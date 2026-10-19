/* Tells apart the two things a browser reports identically as "Failed to fetch":
   the network never reached the host, versus the host answered but CORS blocked
   the read. `mode:'no-cors'` resolves whenever the bytes came back at all
   (opaque response), so it separates DNS/TCP/TLS failure from a CORS refusal. */
async function probeHost(url) {
  let opaqueOk = false;
  try {
    await fetch(url + '/rest/v1/', { mode: 'no-cors', cache: 'no-store' });
    opaqueOk = true;
  } catch (e) {
    return { reachable: false, corsBlocked: false, detail: String((e && e.message) || e) };
  }
  try {
    const res = await fetch(url + '/rest/v1/', { cache: 'no-store' });
    return { reachable: true, corsBlocked: false, status: res.status };
  } catch (e) {
    return { reachable: true, corsBlocked: true, status: 0, detail: String((e && e.message) || e) };
  }
}

function hostOf(url) {
  try { return new URL(url).host; } catch (e) { return url; }
}

/* ============================================================
   Key safety
   ------------------------------------------------------------
   Supabase is renaming its keys (anon / service_role become
   sb_publishable_ / sb_secret_ by end of 2026). A length check alone
   would happily accept the SECRET key, and this app stores the key
   in localStorage and ships it to the browser — where a secret key
   bypasses row-level security entirely. So we name the formats
   explicitly rather than trusting "it looks long enough".
   ============================================================ */
const SECRET_PREFIX = /^sb_secret_/i;

function keyProblem(k) {
  if (!k) return 'Paste the publishable key.';
  if (SECRET_PREFIX.test(k)) {
    return 'That is a sb_secret_ key — the server-side key. It bypasses all row-level '
         + 'rules, so it must never go in a web page. Use the sb_publishable_ key instead.';
  }
  // The legacy JWT pair carries the role in its payload; decode and check it.
  if (k.split('.').length === 3) {
    try {
      const payload = JSON.parse(atob(k.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (payload && payload.role === 'service_role') {
        return 'That is a service_role key — the server-side key. It bypasses all '
             + 'row-level rules, so it must never go in a web page. Use the '
             + 'publishable / anon key instead.';
      }
    } catch (e) { /* not a readable JWT; the length check below still applies */ }
  }
  if (/^service_role/i.test(k)) return 'That is a service_role key. Use the publishable / anon key instead.';
  if (k.length < 20) return 'That key looks too short to be real. Copy it again from Project Settings → API.';
  return null;
}

/* ============================================================
   supabase.js — optional Supabase sync provider
   ------------------------------------------------------------
   Why this file exists: the built-in WorkBuddy cloud rejected this app's
   credential (401 invalid_client at the gateway), so sign-in could not
   work. Supabase is a second, independent path the user controls.

   SAME SHAPE AS `Cloud`, so one panel renders either provider.

   The anon key is safe to ship in front-end code — Supabase calls it the
   "anon" key precisely because it is public and protected by Row Level
   Security. It grants nothing on its own.

   IMPORTANT — this path is NOT pre-verified against a real project: it
   needs a URL + anon key the user supplies after creating a project and
   running the SQL in SUPABASE-SETUP.sql. Everything up to the network
   round trip (client loads, API surface, panel rendering, offline
   degradation) is verified; the round trip itself is not.
   ============================================================ */

const SUPA_LIB = './vendor/supabase.min.js';

const Supa = {
  client: null,
  user: null,
  email: '',
  busy: false,
  blocked: false,
  status: 'signed-out',   // signed-out | link-sent | syncing | ok | error
  message: '',
  lastError: '',
  lastSync: 0,
  sdkState: 'idle',
  _timer: null,

  /* Nothing is configured until the user supplies both values. */
  get configured() {
    const s = Store.state.sync || {};
    return !!(s.supabaseUrl && s.supabaseKey);
  },
  get available() { return this.configured && !!this.client && this.sdkState !== 'error'; },
  get url() { return (Store.state.sync || {}).supabaseUrl || ''; },
  get key() { return (Store.state.sync || {}).supabaseKey || ''; },

  /* ---------- library + client ---------- */
  async init() {
    if (this.client) return true;
    if (!this.configured) return false;
    if (this.sdkState === 'idle') {
      this.sdkState = 'loading';
      try {
        await loadScript(SUPA_LIB, 'supabase-js');
      } catch (e) {
        this.sdkState = 'error';
        this.lastError = 'The sync library could not be loaded.';
        paintCloud();
        return false;
      }
      const g = window.supabase;
      if (!g || typeof g.createClient !== 'function') {
        this.sdkState = 'error';
        this.lastError = 'The sync library loaded but is not the expected version.';
        paintCloud();
        return false;
      }
      this.client = g.createClient(this.url, this.key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,   // sign-in is by 6-digit code, not a link
        },
      });
      // Without this the state stays 'loading' forever and the panel never
      // renders the sign-in form — the panel gates on this exact value.
      this.sdkState = 'ready';
    }
    if (!this.client) { paintCloud(); return false; }

    /* WHICH PANEL STATE THIS ENDS IN MATTERS. init() is the only place that
       turns "loading…" into a usable form, and it runs in parallel with the
       other provider's init(). If the last repaint happened while this one
       was still fetching its script, nothing would repaint afterwards and
       the card stayed stuck on a spinner — so repaint here, on EVERY exit,
       including the failure ones. A dead host also makes getSession() reject
       rather than return { error }, which used to propagate out of init() and
       skip the repaint entirely; catch it and fall back to "not signed in". */
    try {
      const { data, error } = await this.client.auth.getSession();
      if (error) {
        this.user = null;
        this.status = 'signed-out';
      } else if (data && data.session) {
        this.user = data.session.user;
        this.status = 'ok';
        setTimeout(() => this.sync(true), 400);
      } else {
        this.status = 'signed-out';
      }
    } catch (e) {
      this.user = null;
      this.status = 'signed-out';
    }
    paintCloud();
    return true;
  },

  async configure(url, key) {
    const u = String(url || '').trim().replace(/\/+$/, '');
    const k = String(key || '').trim();
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(u)) {
      return { ok: false, error: 'That does not look like a Supabase API URL. It should read https://xxxx.supabase.co — copy it from Project Settings → API.' };
    }
    const bad = keyProblem(k);
    if (bad) return { ok: false, error: bad };
    Store.state.sync = { ...(Store.state.sync || {}), supabaseUrl: u, supabaseKey: k };
    Store.save();

    // Rebuild the client from the new values, then prove it answers.
    this.client = null;
    this.sdkState = 'idle';
    this.blocked = false;
    const built = await this.init();
    if (!built) return { ok: false, error: this.lastError || 'Could not start the client.' };

    // A real round trip, but start with a host probe: a browser reports a dead
    // network and a blocked cross-origin read as the same opaque "Failed to
    // fetch", so probe them separately before blaming the account.
    const host = hostOf(u);
    const net = await probeHost(u);
    if (!net.reachable) {
      return {
        ok: false,
        error: `Cannot reach ${host} from this device. Check that the Project URL is exactly `
          + `https://<your-ref>.supabase.co, and that this network can open supabase.co `
          + `(Supabase is hosted outside mainland China, so some networks block it).`,
      };
    }
    if (net.corsBlocked) {
      return {
        ok: false,
        error: `${host} answered, but the browser blocked the reply as cross-origin. `
          + `In Supabase go to Authentication → URL Configuration and confirm `
          + `${location.origin} is listed under Redirect URLs, then reconnect.`,
      };
    }

    let timedOut = false;
    const probe = await Promise.race([
      this.client.from('jar_state').select('owner_id').limit(1),
      new Promise((r) => setTimeout(() => { timedOut = true; r({ data: null, error: null }); }, 15000)),
    ]);
    if (timedOut) {
      return { ok: false, error: `${host} did not answer within 15 seconds — try again, or switch network.` };
    }
    if (probe.error) {
      return {
        ok: false,
        error: 'Connected, but the tables are not ready: ' + probe.error.message
          + ' — run SUPABASE-SETUP.sql in the Supabase SQL editor.',
      };
    }
    return { ok: true };
  },

  disconnect() {
    this.client = null;
    this.sdkState = 'idle';
    this.user = null;
    Store.state.sync = {};
    Store.state.cloudPushedTs = 0;
    Store.save();
  },

  /* ---------- auth: passwordless 6-digit code ----------
     No password for a child to lose, and no link for a mail provider to
     rewrite. The parent types the code that arrives by email; a matching
     code proves the same account, which is what lets two devices sync. */
  /* Send a 6-digit code to the email. This is the PRIMARY path: a code has
     no URL to be rewritten or corrupted, and the parent proves identity by
     typing it back here — two devices that enter the same code the same
     account, so their jars sync.

     NOTE ON THE TEMPLATE: Supabase's default "Magic Link" email template
     contains {{ .ConfirmationURL }}, i.e. it mails a LINK. To mail the
     digits instead, Authentication → Email Templates → Magic Link must
     contain {{ .Token }} (and NOT {{ .ConfirmationURL }}). sendCode cannot
     force this from the browser — it is a one-time dashboard setting that
     the setup guide walks through.

     emailRedirectTo is deliberately omitted: it only matters for the link
     flow and, when the redirect allow-list is not yet configured, makes a
     perfectly good code request fail with "Redirect URL not allowed". */
  async sendCode(address) {
    if (this.busy) return;
    if (!this.client) {
      // The library never finished loading — a dead network, most likely.
      // Say so rather than throwing on this.client.auth.
      this.status = 'error';
      this.lastError = 'Sync is not ready yet. Check the connection and reload, then try again.';
      paintCloud();
      return;
    }
    const email = String(address || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      this.status = 'error';
      this.lastError = 'Please type a valid email address.';
      paintCloud();
      return;
    }
    this.busy = true; this.status = 'ok'; paintCloud();
    try {
      const { error } = await this.client.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true },
      });
      if (error) throw error;
      this.email = email;
      this.status = 'awaiting-code';
      this.lastError = '';
    } catch (e) {
      this.status = 'error';
      this.lastError = supaFriendly(e);
    } finally {
      this.busy = false; paintCloud();
    }
  },

  async confirmCode(code) {
    if (this.busy) return;
    /* Strip everything that is not a digit: e-mail clients often render the
       code as "123 456" or with copy artefacts, which made the check below
       reject a perfectly valid code. */
    const token = String(code || '').replace(/\D/g, '');
    if (!this.email) { this.status = 'signed-out'; return; }
    if (!/^\d{6,8}$/.test(token)) {
      this.status = 'awaiting-code';
      this.lastError = 'The code is 6 digits — copy it from the email.';
      paintCloud();
      return;
    }
    this.busy = true; paintCloud();
    /* The OTP type has moved around between supabase-js releases: current
       projects verify an emailed one-time code as type 'email', older ones
       expected 'magiclink'. Try them in order and keep the first that the
       server accepts, so this works across project ages. */
    const TYPES = ['email', 'magiclink'];
    try {
      let lastErr = null;
      let ok = false;
      for (const type of TYPES) {
        const { error } = await this.client.auth.verifyOtp({ email: this.email, token, type });
        if (!error) { ok = true; break; }
        lastErr = error;
        // A real "wrong/expired code" is final — only a type mismatch is
        // worth retrying with the next type.
        if (!/type|magiclink|otp|expired|invalid|token/i.test(String(error.message || ''))
            || /expired/i.test(String(error.message || ''))) break;
      }
      if (!ok) throw lastErr || new Error('Verification failed.');
      const { data } = await this.client.auth.getSession();
      this.user = (data && data.session && data.session.user) || null;
      this.status = 'ok';
      this.message = 'Verified — stars now sync to every device.';
      this.lastError = '';
      setTimeout(() => this.sync(true), 300);
    } catch (e) {
      this.status = 'awaiting-code';
      this.lastError = supaFriendly(e);
    } finally {
      this.busy = false; paintCloud();
    }
  },

  async signOut() {
    try { await this.client.auth.signOut(); } catch (e) { /* local sign-out regardless */ }
    this.user = null;
    this.email = '';
    this.status = 'signed-out';
    this.lastSync = 0;
    delete Store.state.cloudPushedTs;
    Store.save();
  },

  /* ---------- sync ---------- */
  async sync(silent) {
    if (this.busy || !this.client || !this.user) return;
    this.busy = true;
    this.status = 'syncing';
    paintCloud();
    try {
      const { data, error } = await this.client.auth.getSession();
      if (error || !data || !data.session) {
        throw Object.assign(new Error('session missing'), { kind: 'unauthenticated' });
      }
      await this.pull();
      await this.push();
      this.lastSync = Date.now();
      this.status = 'ok';
      this.message = silent ? '' : 'Everything is up to date';
      this.lastError = '';
    } catch (e) {
      this.status = 'error';
      this.lastError = supaFriendly(e);
      if (e && e.kind === 'unauthenticated') { this.user = null; this.status = 'signed-out'; }
    } finally {
      this.busy = false;
      paintCloud();
    }
  },

  async pull() {
    // 1. append-only event log — union by id, loses nothing
    const ev = await this.client
      .from('jar_events')
      .select('event_id, ts, day, type, payload')
      .order('ts', { ascending: true })
      .limit(2000);
    if (ev.error) throw ev.error;
    const remote = (ev.data || []).map((r) => (r.payload && r.payload.id ? r.payload : {
      id: r.event_id, ts: Number(r.ts), date: r.day, type: r.type,
    }));
    if (remote.length) {
      const have = new Set((Store.state.events || []).map((e) => e.id));
      const fresh = remote.filter((e) => e && e.id && !have.has(e.id));
      if (fresh.length) {
        Store.state.events = Store.state.events.concat(fresh)
          .sort((a, b) => (a.ts === b.ts ? 0 : (a.ts < b.ts ? -1 : 1)));
        Log.trimSnapshot(Store.state);
        Store.save();
      }
    }

    // 2. snapshot — merged, never replaced
    const st = await this.client.from('jar_state').select('saved_at, payload').limit(1);
    if (st.error) throw st.error;
    const row = (st.data || [])[0];
    if (row && Array.isArray(row.payload && row.payload.tasks)) {
      const d = diffJars(Store.state, row.payload);
      if (!d.empty) {
        Store.state = mergeJars(Store.state, row.payload);
        Store.save();
        $('.brand__txt h1').textContent = `${Store.state.profile.name}'s Star Jar`;
        document.title = `${Store.state.profile.name}'s Star Jar`;
        renderAll();
        const n = d.gainedTicks || d.events;
        this.message = `Brought in ${n} new star${n === 1 ? '' : 's'}`;
      }
    }
  },

  async push() {
    const watermark = Number(Store.state.cloudPushedTs) || 0;

    const fresh = (Store.state.events || []).filter((e) => e && Number(e.ts) > watermark);
    if (fresh.length) {
      const rows = fresh.slice(-500).map((e) => ({
        event_id: e.id,
        ts: Number(e.ts) || Date.now(),
        day: e.date || todayISO(),
        type: e.type || 'unknown',
        payload: e,
      }));
      // ON CONFLICT DO NOTHING — this is what makes two devices safe.
      const res = await this.client.from('jar_events')
        .upsert(rows, { onConflict: 'owner_id,event_id', ignoreDuplicates: true });
      if (res.error) throw res.error;
    }

    const savedAt = Date.now();
    const payload = JSON.parse(JSON.stringify(Store.state));
    delete payload.cloudPushedTs;
    delete payload.sync;                     // never ship the credentials back

    const res = await this.client.from('jar_state').upsert(
      { saved_at: savedAt, payload },
      { onConflict: 'owner_id' },
    );
    if (res.error) throw res.error;

    Store.state.cloudPushedTs = Math.max(watermark, ...fresh.map((e) => Number(e.ts) || 0), watermark);
  },

  queue() {
    if (!this.user || this.busy) return;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.sync(true), 2500);
  },
};

function supaFriendly(e) {
  const code = String((e && (e.code || e.error || '')) || '');
  const msg = String((e && (e.message || e.description || '')) || '');
  const both = `${code} ${msg}`;

  // Supabase pauses free projects after ~7 days with too little activity. The
  // API then refuses every call, and the app sees nothing but a bare error.
  // This is the single most likely reason a working setup stops working, so
  // say it plainly instead of leaving "something went wrong".
  if (/paused|project is paused|PGRST/i.test(both) || /[^a-z]52[13]\b/.test(code)) {
    return 'This Supabase project has been paused (free projects are paused after about '
         + 'a week with little use). Nothing is lost — sign in to supabase.com and press '
         + '"Resume project". Opening the project or using the app for a few days keeps it awake.';
  }

  // A browser network failure is always the vague "Failed to fetch". Name the
  // host instead, so the user can see whether the Project URL is even right.
  if (/failed to fetch|networkerror|load failed/i.test(msg) || /failed to fetch/i.test(code)) {
    const h = (typeof Supa !== 'undefined' && Supa.url) ? hostOf(Supa.url) : 'your Supabase project';
    return `Cannot reach ${h} from this device. Your stars are safe here. `
      + `Check the API URL, and note Supabase sits outside mainland China — some networks block it.`;
  }

  // Email is the most common free-tier failure and the least understandable.
  if (/over_email_send_rate_limit|rate limit|too many|429/i.test(both)) {
    return 'Too many emails from this project. Wait an hour and try again — free Supabase projects have a low limit.';
  }
  if (/signups not allowed|not enabled|provider is not enabled/i.test(both)) {
    return 'This Supabase project has email sign-in switched off. Turn it on in Authentication → Providers → Email.';
  }
  if (/redirect|not allowed|invalid url/i.test(both)) {
    return 'This app\'s address is not an allowed sign-in redirect. Add it under Authentication → URL Configuration → Redirect URLs.';
  }
  if (/invalid.*api key|JWT|apikey/i.test(both)) {
    return 'That anon key was rejected. Copy it again from Project Settings → API.';
  }
  if (/relation .* does not exist|42P01|schema cache/i.test(both)) {
    return 'The tables are not there yet. Run SUPABASE-SETUP.sql in the Supabase SQL editor.';
  }
  if (/row-level security|42501|permission denied/i.test(both)) {
    return 'This account is not allowed to use those tables. Run SUPABASE-SETUP.sql again.';
  }
  if (/timeout/i.test(msg)) {
    return 'Supabase took too long to answer. Your stars are safe on this device — try again.';
  }
  if (/unauthenticated|invalid.*jwt|Auth session missing/i.test(both)) {
    return 'Your session has ended. Please sign in again.';
  }
  return msg || 'Something went wrong. Your stars are safe on this device.';
}
