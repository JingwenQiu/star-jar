/* ============================================================
   data.js — Seed data extracted from "My Star Jar Version 2.xlsx"
   ------------------------------------------------------------
   Source mapping (sheet "My Star Jar"):
     C3  -> profile.name            "Superstar"
     C4  -> profile.weekStart       2026-10-05 (a Monday)
     C5  -> profile.goal            60 stars to fill the jar
     C6  -> profile.reward          "Movie night + ice cream"
     B9:B25 / C9:C25 -> tasks[] (label + stars each)
     D9:J24 (✔) -> per-day task completions
     D26:J26     -> per-day mood  (😊,🙂,😐,😕,😢)
     D29:J29     -> "One thing I'm proud of today"
     C33         -> carryOver = 12 stars from earlier weeks
     L27:L31     -> goodAt[] "Things I'm good at"
   Sheet "Read me (grown-ups)" -> the philosophy encoded in rules below
     (never deduct stars; no wrong moods)

   STAR RULE, as the family asked for it: stars come ONLY from ticked tasks
   (plus any manually added bonus). The workbook's showing-up +1 and the
   rainbow-week +5 were both removed — checking in is what earning looks
   like, not a second way to earn. "Have I done anything today?" now has a
   single honest answer: the tasks you ticked.
   ============================================================ */

const STORE_KEY = 'superstar-star-jar:v2';

/* ---------- Seed: the 17 habits from rows 9-25 ---------- */
const SEED_TASKS = [
  { id: 't1',  icon: '🎒', name: 'Pack the schoolbag (before sleep)',        stars: 1, cat: 'Morning & Night' },
  { id: 't2',  icon: '🪥', name: 'Brush teeth and moisturize my face (night)', stars: 1, cat: 'Morning & Night' },
  { id: 't3',  icon: '📚', name: 'Do my homework',                            stars: 3, cat: 'Learning' },
  { id: 't4',  icon: '🍽️', name: 'Wash the dishes',                           stars: 3, cat: 'Helping Out' },
  { id: 't5',  icon: '👕', name: 'Put clothes in the wash',                    stars: 2, cat: 'Helping Out' },
  { id: 't6',  icon: '🧺', name: 'Hang up the clothes',                        stars: 3, cat: 'Helping Out' },
  { id: 't7',  icon: '🛏️', name: 'Tidy my room',                              stars: 2, cat: 'Helping Out' },
  { id: 't8',  icon: '🎈', name: 'Play time (something fun!)',                stars: 1, cat: 'Fun' },
  { id: 't9',  icon: '📺', name: 'TV finished on time (30 min)',              stars: 2, cat: 'Fun' },
  { id: 't10', icon: '📖', name: 'Read for 15 minutes',                       stars: 2, cat: 'Learning' },
  { id: 't11', icon: '💛', name: 'Do something kind for someone',             stars: 3, cat: 'Bravery' },
  { id: 't12', icon: '🙌', name: 'Asked for help when I needed it',           stars: 2, cat: 'Bravery' },
  { id: 't13', icon: '💪', name: 'Tried something hard (any result!)',         stars: 3, cat: 'Bravery' },
  { id: 't14', icon: '🎵', name: 'practice the flute (30 minute)',             stars: 4, cat: 'Learning', sub: true },
  { id: 't15', icon: '🙋', name: 'raise my hand during class',                 stars: 1, cat: 'Learning', sub: true },
  { id: 't16', icon: '🧮', name: 'write steps and check it (math)',            stars: 1, cat: 'Learning', sub: true },
  { id: 't17', icon: '✏️', name: 'correct my answers I got wrong',            stars: 1, cat: 'Learning', sub: true },
];

const MOODS = [
  { key: '😊', label: 'Happy'  },
  { key: '🙂', label: 'Good'   },
  { key: '😐', label: 'Okay'   },
  { key: '😕', label: 'Meh'    },
  { key: '😢', label: 'Sad'    },
];

const CATEGORIES = ['Morning & Night', 'Learning', 'Helping Out', 'Fun', 'Bravery', 'Other'];

/* ---------- Seed: starter demo data from the workbook ----------
   Mon-Wed ticks, moods, proud notes, 12 earlier-week stars.
   The workbook's own Read-me says: "Starter data ... is a demo.
   Clear it before real use." — so it is flagged and clearable. */
const SEED_DAYS = {
  '2026-10-05': {
    ticks: ['t1', 't2', 't3', 't4', 't8'],
    mood: '🙂',
    proud: 'I finished my homework by myself!',
  },
  '2026-10-06': {
    ticks: ['t1', 't2', 't3', 't6', 't7', 't8', 't11', 't13'],
    mood: '😊',
    proud: 'I helped tidy the kitchen',
  },
  '2026-10-07': {
    ticks: ['t1'],
    mood: '😐',
    proud: '',
  },
};

const SEED_PRIZES = [
  { id: 'p1', icon: '🎬', name: 'Pick the movie',              cost: 20 },
  { id: 'p2', icon: '🍦', name: 'Ice cream trip',              cost: 15 },
  { id: 'p3', icon: '🛝', name: 'Extra playground hour',       cost: 30 },
  { id: 'p4', icon: '📚', name: 'New book of my choosing',    cost: 45 },
  { id: 'p5', icon: '🎨', name: 'New art supplies',           cost: 60 },
];

const SEED_GOOD_AT = ['I never give up on drawing', 'I make people laugh'];

const SEED_PROFILE = {
  name: 'Superstar',
  goal: 60,
  reward: 'Movie night + ice cream',
  weekStart: '2026-10-05',
  carryOver: 12,
  /* Kept only so an older saved jar (v3/v4) still migrates cleanly. New jars
     never award these — see RULES. */
  showUpBonus: 0,
  rainbowBonus: 0,
};

/* The whole star economy, in one place.
   Stars are earned by ticking tasks, and by nothing else. There is no bonus
   for "showing up" — the act of ticking a task already is the showing up. */
const RULES = { neverDeduct: true, showUpBonus: 0, rainbowBonus: 0 };

/* ---------- Date helpers ---------- */
const DAY_MS = 86400000;
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const iso = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
const parseISO = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (s, n) => {
  const d = parseISO(s);
  d.setDate(d.getDate() + n);
  return iso(d);
};
/* Monday-based week start, matching the workbook's "Week starting (a Monday)" */
const weekStartOf = (s) => {
  const d = parseISO(s);
  const shift = (d.getDay() + 6) % 7;
  return addDays(s, -shift);
};
const todayISO = () => iso(new Date());
const prettyDate = (s) => {
  const d = parseISO(s);
  return `${MON[d.getMonth()]} ${d.getDate()}`;
};
const longDate = (s) => {
  const d = parseISO(s);
  return `${DOW_LONG[d.getDay()]}, ${MON[d.getMonth()]} ${d.getDate()}`;
};

/* ---------- Default state ---------- */
function defaultState() {
  return {
    v: 4,
    profile: { ...SEED_PROFILE },
    tasks: SEED_TASKS.map((t) => ({ ...t })),
    days: JSON.parse(JSON.stringify(SEED_DAYS)),
    prizes: SEED_PRIZES.map((p) => ({ ...p, repeatable: false })),
    /* Redemption ledger. Every entry is one real withdrawal of stars:
       { id, prizeId, name, icon, cost, date }. Stars are removed from the
       spendable balance by the sum of these entries, and can be given back
       by deleting one. */
    redemptions: [],
    goodAt: [...SEED_GOOD_AT],
    rules: { ...RULES },
    /* Append-only activity log. One entry per event, never rewritten or
       removed. This is the record of WHAT HAPPENED; the fields above are the
       current derived state. See Log below. */
    events: [],
    seeded: true,
  };
}

/* ============================================================
   EVENT LOG — append-only, one line per event
   ------------------------------------------------------------
   Nothing here is ever edited or deleted: un-ticking a task appends a new
   `task.untick` event rather than erasing the `task.tick`. Both live in the
   log forever, which is the point — the jar's numbers are derived, the log is
   the history. The database store uses autoIncrement and `add()` (never
   `put()`), so a write can only ever land at the end.
   ============================================================ */
const EVENT_TYPES = {
  'task.tick':      { label: 'Task done',      icon: '✅', sign: +1 },
  'task.untick':    { label: 'Task undone',    icon: '↩️', sign: -1 },
  'task.add':       { label: 'Task added',     icon: '➕', sign: 0 },
  'task.edit':      { label: 'Task edited',    icon: '✏️', sign: 0 },
  'task.delete':    { label: 'Task removed',   icon: '🗑️', sign: 0 },
  'mood.set':       { label: 'Mood logged',    icon: '💭', sign: 0 },
  'mood.clear':     { label: 'Mood cleared',   icon: '💭', sign: 0 },
  'note.set':       { label: 'Note written',   icon: '💬', sign: 0 },
  'bonus.add':      { label: 'Bonus star',     icon: '🎁', sign: +1 },
  'bonus.remove':   { label: 'Bonus removed',  icon: '↩️', sign: -1 },
  'prize.redeem':   { label: 'Prize redeemed', icon: '🏆', sign: 0 },
  'prize.undo':     { label: 'Stars returned', icon: '↩️', sign: 0 },
  'prize.add':      { label: 'Prize added',    icon: '🎁', sign: 0 },
  'prize.edit':     { label: 'Prize edited',   icon: '✏️', sign: 0 },
  'prize.delete':   { label: 'Prize removed',  icon: '🗑️', sign: 0 },
  'goodat.add':     { label: 'Good at noted',  icon: '💪', sign: 0 },
  'goodat.remove':  { label: 'Good at removed',icon: '💪', sign: 0 },
  'settings.update':{ label: 'Settings saved', icon: '⚙️', sign: 0 },
};

const Log = {
  _pending: new Set(),
  _timer: null,
  SNAPSHOT_CAP: 1000,   // what we keep in localStorage; the DB keeps everything
  /* The day the user is currently looking at. Events must be stamped with the
     day they belong to, not the wall clock — you can browse to 2025 and tick a
     task there. app.js keeps this in sync with the cursor. */
  currentDate: '',

  /* Append one event. Returns the stored record. */
  append(type, fields = {}) {
    if (!Store.state.events) Store.state.events = [];
    const ev = {
      id: 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      ts: Date.now(),
      date: fields.date || this.currentDate || todayISO(),
      type,
      label: fields.label != null ? String(fields.label).slice(0, 90) : '',
      stars: Number(fields.stars) || 0,
      mood: fields.mood || '',
      note: fields.note != null ? String(fields.note).slice(0, 200) : '',
    };
    Store.state.events.push(ev);
    this._pending.add(ev.id);
    this.queue();
    return ev;
  },

  queue() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.flush(), 500);
  },

  /* Write only the not-yet-persisted events. Appends, never rewrites. */
  async flush() {
    clearTimeout(this._timer);
    const fresh = Store.state.events.filter((e) => this._pending.has(e.id));
    if (!fresh.length) return 0;
    if (!DB.ok && !(await DB.open())) return 0;
    const wrote = await DB.appendEvents(fresh);
    if (wrote) fresh.forEach((e) => this._pending.delete(e.id));
    return wrote ? fresh.length : 0;
  },

  /* Every event, newest first. */
  all() {
    return [...(Store.state.events || [])].reverse();
  },

  byDate(date) {
    return this.all().filter((e) => e.date === date);
  },

  count() { return (Store.state.events || []).length; },

  /* Group newest-first, one bucket per day — drives the activity panel. */
  days(limit = 14) {
    const seen = [];
    const out = [];
    for (const e of this.all()) {
      if (!seen.includes(e.date)) { seen.push(e.date); out.push({ date: e.date, events: [] }); }
      if (out.length <= limit) out[out.length - 1].events.push(e);
    }
    return out;
  },

  /* ---------- exports: one line per event, forever ---------- */
  toJSONL() {
    return (Store.state.events || [])
      .map((e) => JSON.stringify(e))
      .join('\n') + ((Store.state.events || []).length ? '\n' : '');
  },

  toCSV() {
    const cols = ['id', 'ts', 'iso_time', 'date', 'weekday', 'type', 'label', 'stars', 'mood', 'note'];
    const esc = (v) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = (Store.state.events || []).map((e) => {
      const d = new Date(e.ts);
      return [
        e.id,
        e.ts,
        d.toISOString(),
        e.date,
        DOW[d.getDay()],
        e.type,
        e.label,
        e.stars,
        e.mood,
        e.note,
      ].map(esc).join(',');
    });
    return [cols.join(','), ...rows].join('\n') + '\n';
  },

  /* Keeps localStorage bounded; the database retains the full history. */
  trimSnapshot(state) {
    if (state.events && state.events.length > this.SNAPSHOT_CAP) {
      const dropped = state.events.length - this.SNAPSHOT_CAP;
      state.events = state.events.slice(dropped);
    }
    return state;
  },
};

/* ============================================================
   Storage — two layers
     1. localStorage  : synchronous mirror, the fast path
     2. IndexedDB     : a real on-disk database
   The `jar` store holds the current state snapshot (overwritten each save).
   The `events` store is append-only: autoIncrement + add(), so a write can
   only ever land at the end of the log — nothing is ever replaced.
   IndexedDB is unavailable on some origins (notably file:// in Chrome),
   so every call is guarded and degrades to local-only.
   ============================================================ */
const DB = {
  NAME: 'superstar-star-jar',
  VERSION: 2,
  STORE: 'jar',
  EVENTS: 'events',
  KEY: 'current',
  db: null,
  ok: false,
  reason: 'not tried yet',
  lastWrite: null,
  lastAppend: null,
  eventCount: 0,
  _timer: null,

  open() {
    return new Promise((resolve) => {
      let settled = false;
      const done = (v) => { if (!settled) { settled = true; resolve(v); } };
      setTimeout(() => { if (!settled) { this.reason = 'timed out'; done(null); } }, 2500);
      try {
        if (!('indexedDB' in window)) {
          this.reason = 'this browser has no IndexedDB';
          return done(null);
        }
        const req = indexedDB.open(this.NAME, this.VERSION);
        req.onupgradeneeded = () => {
          const d = req.result;
          if (!d.objectStoreNames.contains(this.STORE)) d.createObjectStore(this.STORE);
          // autoIncrement + add() ⇒ strictly append-only.
          if (!d.objectStoreNames.contains(this.EVENTS)) {
            d.createObjectStore(this.EVENTS, { keyPath: 'id', autoIncrement: false });
          }
        };
        req.onsuccess = () => {
          this.db = req.result;
          this.ok = true;
          this.reason = 'ready';
          done(this.db);
        };
        req.onerror = () => { this.reason = req.error ? req.error.name : 'open failed'; done(null); };
        req.onblocked = () => { this.reason = 'blocked by another tab'; done(null); };
      } catch (e) {
        this.reason = 'unavailable on this origin';
        done(null);
      }
    });
  },

  async write(state) {
    if (!this.db && !(await this.open())) return false;
    try {
      await new Promise((resolve, reject) => {
        const tx = this.db.transaction(this.STORE, 'readwrite');
        tx.objectStore(this.STORE).put(JSON.parse(JSON.stringify(state)), this.KEY);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      this.lastWrite = new Date();
      return true;
    } catch (e) {
      this.ok = false;
      this.reason = 'write failed';
      return false;
    }
  },

  async read() {
    if (!this.db && !(await this.open())) return null;
    try {
      return await new Promise((resolve, reject) => {
        const tx = this.db.transaction(this.STORE, 'readonly');
        const rq = tx.objectStore(this.STORE).get(this.KEY);
        rq.onsuccess = () => resolve(rq.result || null);
        rq.onerror = () => reject(rq.error);
      });
    } catch (e) {
      return null;
    }
  },

  /* Append events. `add()` refuses to overwrite an existing key, so this can
     only ever grow the log. */
  async appendEvents(events) {
    if (!this.db && !(await this.open())) return false;
    try {
      await new Promise((resolve, reject) => {
        const tx = this.db.transaction(this.EVENTS, 'readwrite');
        const store = tx.objectStore(this.EVENTS);
        events.forEach((e) => store.add(JSON.parse(JSON.stringify(e))));
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      this.lastAppend = new Date();
      this.eventCount += events.length;
      return true;
    } catch (e) {
      this.reason = 'event append failed';
      return false;
    }
  },

  async readEvents() {
    if (!this.db && !(await this.open())) return [];
    try {
      return await new Promise((resolve, reject) => {
        const tx = this.db.transaction(this.EVENTS, 'readonly');
        const rq = tx.objectStore(this.EVENTS).getAll();
        rq.onsuccess = () => resolve(rq.result || []);
        rq.onerror = () => reject(rq.error);
      });
    } catch (e) {
      return [];
    }
  },

  async countEvents() {
    if (!this.db && !(await this.open())) return 0;
    try {
      return await new Promise((resolve, reject) => {
        const tx = this.db.transaction(this.EVENTS, 'readonly');
        const rq = tx.objectStore(this.EVENTS).count();
        rq.onsuccess = () => resolve(rq.result || 0);
        rq.onerror = () => reject(rq.error);
      });
    } catch (e) {
      return 0;
    }
  },

  /* Erasing the snapshot copy is a deliberate user action; the event log is
     append-only history and is only cleared by the explicit "erase history"
     control, never as a side effect of a normal save. */
  async clear() {
    if (!this.db && !(await this.open())) return false;
    try {
      await new Promise((resolve, reject) => {
        const tx = this.db.transaction(this.STORE, 'readwrite');
        tx.objectStore(this.STORE).delete(this.KEY);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      this.lastWrite = null;
      return true;
    } catch (e) {
      return false;
    }
  },

  async clearEvents() {
    if (!this.db && !(await this.open())) return false;
    try {
      await new Promise((resolve, reject) => {
        const tx = this.db.transaction(this.EVENTS, 'readwrite');
        tx.objectStore(this.EVENTS).clear();
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      this.eventCount = 0;
      this.lastAppend = null;
      return true;
    } catch (e) {
      return false;
    }
  },

  /* Writes are debounced: ticking a task can fire many saves in a second. */
  queue(state) {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.write(state), 400);
  },
};

/* ---------- Persistence ---------- */
/* ============================================================
   MERGE — used when a jar comes in from another device
   ------------------------------------------------------------
   Replacing wholesale is how a family loses a week of stars: whichever
   phone you import last wins and the other one is silently erased. So a
   merge is the DEFAULT, and it follows the workbook's own rule — stars are
   never taken away:
     · ticks union per day  → an earned star can never vanish
     · events / redemptions union by id, ordered by time (both are
       append-only, so union is exactly right)
     · tasks & prizes union by id, incoming wins a genuine edit
     · text fields (mood, proud note) keep whatever is already filled in
     · carry-over stars take the higher number, never the lower
   ============================================================ */
function mergeJars(local, inc) {
  const out = JSON.parse(JSON.stringify(local || {}));
  out.profile = { ...(out.profile || {}) };
  out.tasks = out.tasks || [];
  out.days = out.days || {};
  out.prizes = out.prizes || [];
  out.redemptions = out.redemptions || [];
  out.events = out.events || [];
  out.goodAt = out.goodAt || [];

  const incProfile = inc.profile || {};
  ['name', 'goal', 'reward'].forEach((k) => {
    if (incProfile[k] != null && incProfile[k] !== '') out.profile[k] = incProfile[k];
  });
  out.profile.carryOver = Math.max(
    Number(out.profile.carryOver) || 0, Number(incProfile.carryOver) || 0);

  // tasks / prizes — union by id, incoming wins on conflict
  const unionById = (mine, theirs) => {
    const map = new Map();
    (mine || []).forEach((x) => map.set(x.id, x));
    (theirs || []).forEach((x) => {
      if (!x || !x.id) return;
      map.set(x.id, map.has(x.id) ? { ...map.get(x.id), ...x } : { ...x });
    });
    return [...map.values()];
  };
  out.tasks = unionById(out.tasks, inc.tasks);
  out.prizes = unionById(out.prizes, inc.prizes);

  // days — ticks union, never overwrite what is already written
  Object.entries(inc.days || {}).forEach(([date, d]) => {
    const cur = out.days[date];
    if (!cur) { out.days[date] = JSON.parse(JSON.stringify(d)); return; }
    cur.ticks = [...new Set([...(cur.ticks || []), ...(d.ticks || [])])];
    cur.mood = cur.mood || d.mood || '';
    cur.proud = cur.proud || d.proud || '';
    const seen = new Set((cur.bonus || []).map((b) => `${b.label}|${b.stars}`));
    (d.bonus || []).forEach((b) => {
      const key = `${b.label}|${b.stars}`;
      if (!seen.has(key)) { cur.bonus = cur.bonus || []; cur.bonus.push({ ...b }); seen.add(key); }
    });
    cur.bonus = (cur.bonus || []).sort((a, b) => (a.label || '').localeCompare(b.label || ''));
  });

  // append-only logs — union by id, ordered by time
  const unionEvents = (mine, theirs) => {
    const map = new Map();
    (mine || []).forEach((e) => e && e.id && map.set(e.id, e));
    (theirs || []).forEach((e) => {
      if (e && e.id && !map.has(e.id)) map.set(e.id, e);
    });
    return [...map.values()].sort((a, b) => (a.ts === b.ts ? 0 : (a.ts < b.ts ? -1 : 1)));
  };
  out.events = unionEvents(out.events, inc.events);
  out.redemptions = unionEvents(out.redemptions, inc.redemptions);

  out.goodAt = [...new Set([...out.goodAt, ...(inc.goodAt || [])])];
  return out;
}

/* What a merge would actually bring in — shown before the user commits. */
function diffJars(local, inc) {
  const ids = (a) => new Set((a || []).map((x) => x.id));
  const lt = ids(local.tasks), it = ids(inc.tasks);
  const newTasks = [...it].filter((x) => !lt.has(x));
  const newDays = Object.keys(inc.days || {})
    .filter((d) => !(local.days || {})[d]);
  const gainedTicks = Object.entries(inc.days || {}).reduce((s, [d, v]) => {
    const have = new Set((((local.days || {})[d] || {}).ticks) || []);
    return s + (v.ticks || []).filter((t) => !have.has(t)).length;
  }, 0);
  const haveEvents = ids(local.events);
  const newEvents = (inc.events || []).filter((e) => e && e.id && !haveEvents.has(e.id));
  const haveRed = ids(local.redemptions);
  const newRedemptions = (inc.redemptions || []).filter((e) => e && e.id && !haveRed.has(e.id));

  return {
    tasks: newTasks.length,
    days: newDays.length,
    gainedTicks,
    events: newEvents.length,
    redemptions: newRedemptions.length,
    prizes: [...ids(inc.prizes)].filter((x) => !ids(local.prizes).has(x)).length,
    name: (inc.profile || {}).name,
    savedAt: Number(inc.savedAt) || 0,
    empty: newTasks.length === 0 && newDays.length === 0 && gainedTicks === 0
      && newEvents.length === 0 && newRedemptions.length === 0,
  };
}

const Store = {
  state: null,
  _lastLocal: 0,

  load() {
    let fromLocal = null;
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) fromLocal = JSON.parse(raw);
    } catch (e) {
      console.warn('Could not read saved jar.', e);
    }
    if (fromLocal && Array.isArray(fromLocal.tasks)) {
      this.state = migrateToV4(fromLocal);
      this._lastLocal = Number(fromLocal.savedAt) || 0;
    } else {
      this.state = defaultState();
      this.save();
    }
    return this.state;
  },

  save() {
    this.state.savedAt = Date.now();
    // localStorage keeps a bounded tail; the database keeps the whole log.
    const snapshot = Log.trimSnapshot(JSON.parse(JSON.stringify(this.state)));
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(snapshot));
      this._lastLocal = this.state.savedAt;
    } catch (e) {
      console.warn('Could not save jar to local storage.', e);
    }
    DB.queue(this.state);
  },

  /* Merge the database's full append-only log back into the snapshot,
     de-duplicating by event id. Anything the snapshot is missing is restored;
     nothing already recorded is ever dropped. */
  async mergeEvents() {
    const fromDb = await DB.readEvents();
    if (!fromDb.length) return { added: 0, total: (this.state.events || []).length };
    const have = new Set((this.state.events || []).map((e) => e.id));
    const fresh = fromDb.filter((e) => !have.has(e.id));
    if (fresh.length) {
      const all = this.state.events.concat(fresh);
      all.sort((a, b) => (a.ts === b.ts ? 0 : a.ts - b.ts));
      this.state.events = all;
      // these came FROM the database, so nothing here needs re-appending
      fresh.forEach((e) => Log._pending.delete(e.id));
      this.save();
    }
    DB.eventCount = fromDb.length;
    return { added: fresh.length, total: this.state.events.length };
  },

  /* After the async database opens, adopt it if it is newer than localStorage.
     Returns which way the data moved, or 'local-only' if this browser/origin
     has no usable IndexedDB. */
  async reconcile() {
    if (!DB.ok && !(await DB.open())) return 'local-only';
    const dbState = await DB.read();
    if (!dbState || !Array.isArray(dbState.tasks)) {
      // Nothing in the database yet — seed it from what we already have.
      await DB.write(this.state);
      return 'seeded';
    }
    const localAt = Number(this.state.savedAt) || 0;
    const dbAt = Number(dbState.savedAt) || 0;
    if (dbAt > localAt) {
      this.state = migrateToV4(dbState);
      this.save();
      return 'restored';
    }
    if (localAt > dbAt) {
      await DB.write(this.state);
      return 'pushed';
    }
    return 'in-sync';
  },

  reset() {
    this.state = defaultState();
    this.save();
  },

  clearAll() {
    this.state = defaultState();
    this.state.seeded = false;
    this.state.days = {};
    this.state.profile.carryOver = 0;
    this.state.redemptions = [];
    this.save();
  },
};

/* ---------- Migration from earlier saved jars ----------
   v2 stored a single `claimed` flag on the prize. v3 keeps a real ledger so the
   stars come back if a redemption is undone. */
function migrate(parsed) {
  if (parsed.v === 3) {
    if (!Array.isArray(parsed.events)) parsed.events = [];
    return parsed;
  }
  const next = { ...parsed, v: 3, redemptions: parsed.redemptions || [], events: parsed.events || [] };
  next.prizes = (parsed.prizes || []).map((p) => {
    const { claimed, claimedOn, ...rest } = p;
    const clean = { repeatable: false, ...rest };
    if (claimed) {
      next.redemptions.push({
        id: 'r' + clean.id,
        prizeId: clean.id,
        name: clean.name,
        icon: clean.icon || '🎁',
        cost: Number(clean.cost) || 0,
        date: claimedOn || todayISO(),
      });
    }
    return clean;
  });
  return next;
}

/* v3 → v4: the showing-up and rainbow bonuses were removed, so any saved jar
   still carrying those values must be zeroed or the old economy keeps paying
   out. Only the RULES change — no stars are ever removed from history, and the
   jar total simply becomes the sum of ticked tasks from now on. */
function migrateToV4(parsed) {
  const out = migrate(parsed);
  out.v = 4;
  out.rules = { ...RULES, ...(out.rules || {}) };
  out.rules.showUpBonus = 0;
  out.rules.rainbowBonus = 0;
  out.profile = { ...(out.profile || {}) };
  out.profile.showUpBonus = 0;
  out.profile.rainbowBonus = 0;
  return out;
}

/* ============================================================
   Derived calculations (mirrors the workbook formulas)
   ------------------------------------------------------------
   Reads Store.state directly rather than caching a reference, so
   reset() / import() (which swap the whole object) are picked up.
   ============================================================ */
const Calc = {
  get state() { return Store.state; },

  /* Where a day's stars come from, split by source.
     This is the single place the day total is composed, so the UI can show a
     breakdown that provably adds up instead of a number that has to be taken
     on trust. dayStars() sums exactly these parts. */
  dayBreakdown(date) {
    const rec = this.state.days[date];
    if (!rec) return { tasks: 0, bonus: 0, showUp: 0, taskCount: 0, active: false, total: 0 };
    const tickIds = [...new Set(rec.ticks || [])];   // a duplicate id must never pay twice
    const tasks = tickIds.reduce((sum, id) => {
      const t = this.state.tasks.find((x) => x.id === id);
      return sum + (t ? Number(t.stars) || 0 : 0);
    }, 0);
    const bonus = (rec.bonus || []).reduce((s, b) => s + (Number(b.stars) || 0), 0);
    /* Kept in the shape so stored data and callers stay compatible, but it is
       always 0 now: showing up is not a separate way to earn. */
    const showUp = 0;
    return {
      tasks, bonus, showUp, taskCount: tickIds.length,
      active: this.activeOn(date),
      total: tasks + bonus,
    };
  },

  dayStars(date) {
    const rec = this.state.days[date];
    if (!rec) return 0;
    const b = this.dayBreakdown(date);
    return b.tasks + b.bonus;
  },

  /* Did she do anything at all that day? Drives streaks and the "x of 7 days"
     counter — but earns nothing. Kept separate from dayStars so the two ideas
     can never be confused again. */
  activeOn(date) {
    const rec = this.state.days[date];
    if (!rec) return false;
    return !!(rec.ticks && rec.ticks.length > 0)
      || !!(rec.mood && rec.mood !== '')
      || !!(rec.proud && rec.proud.trim() !== '')
      || !!(rec.bonus && rec.bonus.length > 0);
  },

  /* Legacy accessor. Returns 0 for every jar, because the showing-up bonus was
     removed. `activeOn` replaces it wherever the question was "did she engage?". */
  showUpFor() { return 0; },

  weekDays(anchor) {
    const ws = weekStartOf(anchor || todayISO());
    return Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  },

  weekStars(anchor) {
    return this.weekDays(anchor).reduce((s, d) => s + this.dayStars(d), 0);
  },

  /* Rainbow bonus removed. Always 0, kept so stored jars and any old callers
     still resolve. */
  rainbowBonus() { return 0; },

  daysActiveThisWeek(anchor) {
    return this.weekDays(anchor).filter((d) => this.activeOn(d)).length;
  },

  /* Lifetime stars earned. This is the jar's trophy number and, following the
     workbook's "stars never go away" rule, spending never reduces it. */
  allStars() {
    const total = Object.keys(this.state.days).reduce((s, d) => s + this.dayStars(d), 0);
    return this.state.profile.carryOver + total;
  },

  /* Stars already handed out as prizes — the sum of the redemption ledger. */
  spentStars() {
    return (this.state.redemptions || []).reduce((s, r) => s + (Number(r.cost) || 0), 0);
  },

  /* Stars actually available to spend right now. */
  balance() {
    return this.allStars() - this.spentStars();
  },

  /* Jar fill is driven by lifetime stars, matching Excel C36 (=C34/C5). */
  fillPct() {
    const goal = Number(this.state.profile.goal) || 1;
    return Math.max(0, Math.min(1, this.allStars() / goal));
  },

  /* How far the spendable balance has eaten into the lifetime total. */
  spentPct() {
    const total = this.allStars();
    if (total <= 0) return 0;
    return Math.max(0, Math.min(100, (this.spentStars() / total) * 100));
  },

  redemptionsFor(prizeId) {
    return (this.state.redemptions || []).filter((r) => r.prizeId === prizeId);
  },

  isRedeemed(prizeId) {
    return this.redemptionsFor(prizeId).length > 0;
  },

  /* Newest first. Ties on the same day break by insertion order, so
     redeeming twice in one sitting still lists the latest on top. */
  redemptionLog() {
    return (this.state.redemptions || [])
      .map((r, i) => ({ r, i }))
      .sort((a, b) => (a.r.date === b.r.date ? b.i - a.i : (a.r.date < b.r.date ? 1 : -1)))
      .map((x) => x.r);
  },

  /* Can this prize be redeemed again? Repeatable prizes always can; one-off
     prizes cannot, until their redemption is undone. */
  canRedeemAgain(p) {
    if (p.repeatable) return true;
    return !this.isRedeemed(p.id);
  },

  /* Days with any activity, ascending — drives the bar chart */
  activeSeries(limit = 14) {
    const out = [];
    const t = todayISO();
    for (let i = limit - 1; i >= 0; i--) {
      const d = addDays(t, -i);
      out.push({ date: d, stars: this.dayStars(d) });
    }
    return out;
  },

  /* Consecutive days with any check-in, counting back from the anchor day.
     Future days inside the same week are skipped rather than breaking the run.
     A streak is a record of consistency — it never pays stars. */
  moodStreak(anchor) {
    const t = todayISO();
    let n = 0;
    let cur = anchor && anchor > t ? t : anchor || t;
    for (let i = 0; i < 400; i++) {
      if (this.activeOn(cur)) { n++; cur = addDays(cur, -1); }
      else break;
    }
    return n;
  },

  totalCheckIns() {
    return Object.keys(this.state.days).filter((d) => this.dayStars(d) > 0).length;
  },
  message() {
    const pct = this.fillPct();
    const total = this.allStars();
    const reward = this.state.profile.reward;
    if (total <= 0) return "Your jar is ready for its very first star!";
    if (pct >= 1) return `THE JAR IS FULL! You earned: ${reward}`;
    if (pct >= 0.75) return 'Almost full! So close - you are AMAZING!';
    if (pct >= 0.5) return 'More than halfway! Look how much you have done!';
    if (pct >= 0.25) return 'A quarter full and glowing! Keep going!';
    return "You've started filling your jar. Look at those stars!";
  },
};
