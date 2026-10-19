/* ============================================================
   cloud.js — optional cloud sync (sign in + multi-device)
   ------------------------------------------------------------
   OFFLINE-FIRST. Nothing here is required to use the app: the local jar
   (localStorage + IndexedDB) is always the source of truth for rendering,
   and every one of these calls is wrapped so a failure leaves the app
   working exactly as before. You only ever see this panel if you choose to
   sign in.

   Sync is append-only by design. The event log already has a unique id per
   entry and a UNIQUE (owner_id, event_id) constraint in the database, so two
   devices can both upload the same event and the database keeps exactly one —
   two devices syncing can never conflict or double-count a star.
   ============================================================ */

/* publicConfig — the only values safe to ship in front-end code.
   There is no secret here: publishableKey identifies the app and carries no
   permissions on its own; the server enforces an exact Origin match. */
const CLOUD_CONFIG = {
  endpoint: 'https://superstar-star-jar.app.workbuddy.host',
  oauthRelayBaseUrl: 'https://www.workbuddy.cn/v2/as/genie-baas/oauth',
  publishableKey: 'wbpk_FS9Dn5FT8mFoLISixMMW1U_Zhvr8Q3GIet3Vn50Xc03lCNtW2EtlJW8',
};
/* The SDK is served from THIS app, not a public CDN.
   Same IIFE build, same `WorkBuddyCloud` global — only the host changes.
   Measured reason: our own resources answer in ~0.48s while jsdelivr takes
   ~1.7s from here and is throttled or blocked intermittently on mainland
   networks. Serving it ourselves also lets the service worker precache it,
   so sign-in can initialise even with no connection. */
const SDK_LOCAL = './vendor/workbuddy-cloud-sdk.js';
/* Kept only as a fallback in case the bundled copy is ever missing. */
const SDK_CDN = 'https://cdn.jsdelivr.net/npm/@tencent-ai/workbuddy-cloud-sdk@dev/lib/index.global.js';

const Cloud = {
  client: null,
  sdkState: 'loading',      // loading | ready | unavailable
  user: null,
  pending: null,            // saved OTP challenge — kept OUTSIDE the handlers
  busy: false,
  status: 'idle',           // idle | syncing | ok | error | signed-out
  message: '',
  lastSync: 0,
  lastError: '',
  blocked: false,          // sign-in service rejected this app's access
  /* Set only after a sync actually completes. Until then this provider is
     never auto-offered — its library loads fine while the credential is
     rejected at the gateway, so "available" says nothing useful. */
  proven: false,
  _timer: null,

  get available() { return this.sdkState === 'ready'; },

  /* ---------- SDK ---------- */
  async init() {
    if (this.client) return true;
    if (this.sdkState === 'unavailable') return false;
    try {
      await loadScript(SDK_LOCAL, 'workbuddy-cloud-sdk');
    } catch (e) {
      try {
        await loadScript(SDK_CDN, 'workbuddy-cloud-sdk');
      } catch (e2) {
        this.sdkState = 'unavailable';
        this.status = 'error';
        this.lastError = 'The sync library could not be loaded (you may be offline).';
        paintCloud();
        return false;
      }
    }
    const g = window.WorkBuddyCloud;
    if (!g || typeof g.createWorkBuddyCloud !== 'function') {
      this.sdkState = 'unavailable';
      this.lastError = 'The sync library loaded but is not the expected version.';
      paintCloud();
      return false;
    }
    this.client = g.createWorkBuddyCloud({
      endpoint: CLOUD_CONFIG.endpoint,
      oauthRelayBaseUrl: CLOUD_CONFIG.oauthRelayBaseUrl,
      publishableKey: CLOUD_CONFIG.publishableKey,
    });
    this.sdkState = 'ready';
    await this.restore();
    // The panel was showing "loading…" this whole time; now show the form.
    paintCloud();
    return true;
  },

  /* ---------- auth ---------- */
  async restore() {
    try {
      const { data, error } = await this.client.auth.getSession();
      if (error || !data) {
        this.user = null;
        this.status = 'signed-out';
      } else {
        this.user = data.user || null;
        this.status = 'idle';
        // A returning device pulls whatever the other device recorded.
        setTimeout(() => this.sync(true), 400);
      }
    } catch (e) {
      this.user = null;
      this.status = 'signed-out';
    }
    paintCloud();
  },

  async sendCode(email) {
    if (this.busy) return;
    const clean = String(email || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) {
      this.status = 'error';
      this.lastError = 'Please type a valid email address.';
      paintCloud(); return;
    }
    this.busy = true; this.status = 'idle'; paintCloud();
    try {
      const sent = await this.client.auth.sendOtp({ email: clean });
      if (sent.error) throw sent.error;
      // Keep the challenge; verifying must never re-send a code.
      this.pending = {
        email: clean,
        verificationId: sent.data.verificationId,
        isExistingUser: sent.data.isExistingUser,
      };
      this.status = 'awaiting-code';
      this.lastError = '';
    } catch (e) {
      this.pending = null;
      this.status = 'error';
      this.lastError = friendly(e);
      // A rejected app credential means sign-in can never work, so stop
      // offering a form that cannot succeed and point at the manual route.
      this.blocked = /rejected this app's access/i.test(this.lastError);
    } finally {
      this.busy = false; paintCloud();
    }
  },

  async confirmCode(code) {
    if (this.busy || !this.pending) return;
    const token = String(code || '').trim();
    if (!token) {
      this.status = 'error';
      this.lastError = 'Enter the code from your email.';
      paintCloud(); return;
    }
    this.busy = true; this.status = 'idle'; paintCloud();
    try {
      const done = await this.client.auth.verifyOtp({
        email: this.pending.email,
        verificationId: this.pending.verificationId,
        isExistingUser: this.pending.isExistingUser,
        token,
      });
      if (done.error) throw done.error;
      this.pending = null;
      this.user = done.data.user || null;
      this.status = 'ok';
      this.message = 'Signed in';
      await this.sync(true);
    } catch (e) {
      // A wrong code keeps the saved challenge so the user can just retype.
      this.status = 'awaiting-code';
      this.lastError = friendly(e);
    } finally {
      this.busy = false; paintCloud();
    }
  },

  async signOut() {
    try { await this.client.auth.signOut(); } catch (e) { /* local sign-out regardless */ }
    this.user = null;
    this.pending = null;
    this.status = 'signed-out';
    this.lastSync = 0;
    // The cloud copy must not reappear after signing out on a shared device.
    delete Store.state.cloudPushedTs;
    Store.save();
    paintCloud();
  },

  /* ---------- sync ---------- */
  async sync(silent) {
    if (this.busy || !this.client || !this.user) return;
    this.busy = true;
    this.status = 'syncing';
    paintCloud();
    try {
      // Auth gate: never touch a user-scoped row without a session.
      const { data: session, error: sErr } = await this.client.auth.getSession();
      if (sErr || !session) throw Object.assign(new Error('Please sign in again.'), { kind: 'unauthenticated' });

      await this.pull();
      await this.push();

      this.lastSync = Date.now();
      this.proven = true;
      Store.state.cloudPushedTs = Store.state.cloudPushedTs || 0;
      Store.save();
      this.status = 'ok';
      this.message = silent ? '' : 'Everything is up to date';
      this.lastError = '';
    } catch (e) {
      this.status = 'error';
      this.lastError = friendly(e);
      this.blocked = /rejected this app's access/i.test(this.lastError);
      // Losing the session is the one case worth surfacing loudly.
      if (e && e.kind === 'unauthenticated' && !this.blocked) { this.user = null; this.status = 'signed-out'; }
    } finally {
      this.busy = false;
      paintCloud();
    }
  },

  /* Pull first, always. Merging before pushing means a device never uploads a
     state that would erase what another device just recorded. */
  async pull() {
    const name = this.user?.name || null;

    // 1. the append-only event log — union by id, never loses anything
    const ev = await this.client.database
      .from('jar_events').select('event_id, ts, day, type, payload')
      .order('ts', { ascending: true }).limit(2000);
    if (ev.error) throw ev.error;
    const remoteEvents = (ev.data || []).map((r) => (r.payload && r.payload.id ? r.payload : {
      id: r.event_id, ts: Number(r.ts), date: r.day, type: r.type,
    }));
    if (remoteEvents.length) {
      const have = new Set((Store.state.events || []).map((e) => e.id));
      const fresh = remoteEvents.filter((e) => e && e.id && !have.has(e.id));
      if (fresh.length) {
        Store.state.events = Store.state.events.concat(fresh)
          .sort((a, b) => (a.ts === b.ts ? 0 : (a.ts < b.ts ? -1 : 1)));
        Log.trimSnapshot(Store.state);
        Store.save();
      }
    }

    // 2. the snapshot — merged, never replaced
    const st = await this.client.database
      .from('jar_state').select('saved_at, payload').maybeSingle();
    if (st.error) throw st.error;
    if (st.data && Array.isArray(st.data.payload?.tasks)) {
      const d = diffJars(Store.state, st.data.payload);
      if (!d.empty) {
        Store.state = mergeJars(Store.state, st.data.payload);
        Store.save();
        $('.brand__txt h1').textContent = `${Store.state.profile.name}'s Star Jar`;
        document.title = `${Store.state.profile.name}'s Star Jar`;
        renderAll();
        this.message = `Brought in ${d.gainedTicks || d.events} new star${(d.gainedTicks || d.events) === 1 ? '' : 's'}`;
      }
      void name;
    }
  },

  async push() {
    const watermark = Number(Store.state.cloudPushedTs) || 0;

    // events: only what this device has not uploaded yet
    const fresh = (Store.state.events || []).filter((e) => e && Number(e.ts) > watermark);
    if (fresh.length) {
      const rows = fresh.slice(-500).map((e) => ({
        event_id: e.id,
        ts: Number(e.ts) || Date.now(),
        day: e.date || todayISO(),
        type: e.type || 'unknown',
        payload: e,
      }));
      const res = await this.client.database
        .from('jar_events').upsert(rows, { ignoreDuplicates: true });
      if (res.error) throw res.error;
    }

    // snapshot: one row per account, so select-then-write (never send owner_id)
    const savedAt = Date.now();
    const payload = JSON.parse(JSON.stringify(Store.state));
    delete payload.cloudPushedTs;

    const cur = await this.client.database
      .from('jar_state').select('id').maybeSingle();
    if (cur.error) throw cur.error;

    let write;
    if (cur.data && cur.data.id) {
      write = await this.client.database
        .from('jar_state')
        .update({ saved_at: savedAt, payload })
        .eq('id', cur.data.id)
        .select();
    } else {
      write = await this.client.database
        .from('jar_state')
        .insert({ saved_at: savedAt, payload })
        .select();
    }
    if (write.error) throw write.error;
    // An empty array means RLS blocked it — that is a failure, not a success.
    if (!write.data || write.data.length === 0) {
      throw new Error('The cloud copy was not saved — this account may not own that jar.');
    }

    Store.state.cloudPushedTs = Math.max(
      watermark,
      ...fresh.map((e) => Number(e.ts) || 0),
      watermark,
    );
  },

  /* Debounced auto-sync so ticking a task does not hammer the network. */
  queue() {
    if (!this.user || this.busy) return;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.sync(true), 2500);
  },
};

/* Turns an SDK error into something a parent can act on.
   Order matters: a credential failure often arrives tagged "unauthenticated",
   so it MUST be checked first — telling someone to "sign in again" when they
   are literally trying to sign in is worse than saying nothing. */
function friendly(e) {
  const code = String((e && (e.code || e.error || e.error_code)) || '');
  const msg = String((e && (e.message || e.error_description || e.msg)) || '');
  const both = `${code} ${msg}`;

  // The platform gateway rejected this app's credential. Not the user's
  // problem, and not fixable from the front end — say so and point at the
  // manual route instead.
  if (/invalid_client|MISSING_CREDENTIALS|ACCESS_TOKEN_KID_INVALID|credential is invalid|revoked/i.test(both)) {
    return 'Sync is temporarily unavailable — the sign-in service rejected this app\'s access. '
      + 'Your stars are safe on this device. To move the jar between devices, use Export and Import at the bottom of the page.';
  }
  if (/429|too many|rate.?limit/i.test(both)) {
    return 'Too many attempts — please wait a minute and try again.';
  }
  if (/network|Failed to fetch|Load failed|timeout/i.test(msg)) {
    return 'No connection. Your stars are safe on this device — try again later.';
  }
  if (/unauthenticated|invalid_grant|not signed in|no session|expired/i.test(both)) {
    return 'Your session has ended. Please sign in again.';
  }
  if (/23505/.test(code)) return 'That already exists.';
  if (/42501|permission|not allowed/i.test(both)) return 'This account is not allowed to do that.';
  return msg || 'Something went wrong. Your stars are safe on this device.';
}

/* Loads a script once. A failed attempt removes its <script> so a retry starts
   from a clean element — a dead tag would never fire load/error again. */
function loadScript(src, id) {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(id);
    if (existing && existing.dataset.loaded === 'ok') return resolve();
    if (existing) existing.remove();

    const el = document.createElement('script');
    el.id = id;
    el.src = src;
    el.async = true;
    const timer = setTimeout(() => {
      el.remove();
      reject(new Error('script timeout'));
    }, 12000);
    el.addEventListener('load', () => {
      clearTimeout(timer);
      el.dataset.loaded = 'ok';
      resolve();
    }, { once: true });
    el.addEventListener('error', () => {
      clearTimeout(timer);
      el.remove();
      reject(new Error('script load failed'));
    }, { once: true });
    document.head.appendChild(el);
  });
}
