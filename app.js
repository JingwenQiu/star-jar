/* ============================================================
   app.js — Superstar's Star Jar workbench
   Views: Daily check-in (swipeable dates) · Star jar + prizes + calendar
   ============================================================ */

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

/* ---------- UI state ---------- */
const UI = {
  tab: 'daily',
  cursor: todayISO(),      // selected day on the daily view
  calMonth: null,          // {y, m}
  editingTask: null,
  editingPrize: null,
  lastTotal: 0,
};

const ensureDay = (d) => {
  if (!Store.state.days[d]) Store.state.days[d] = { ticks: [], mood: '', proud: '', bonus: [] };
  const rec = Store.state.days[d];
  rec.ticks = rec.ticks || [];
  rec.bonus = rec.bonus || [];
  return rec;
};

/* ============================================================
   TOASTS + STAR FLIGHT
   ============================================================ */
function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind === 'star' ? 'toast--star' : ''}`;
  el.innerHTML = kind === 'star'
    ? `<svg viewBox="0 0 24 24" style="width:20px;height:20px;fill:var(--butter-500)"><use href="#i-star"/></svg><span>${msg}</span>`
    : `<span>${msg}</span>`;
  $('#toastWrap').appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 300);
  }, 2200);
}

/* Stars fly from the tapped element up to the header counter */
function flyStars(fromEl, count = 1) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const target = $('#starpill').getBoundingClientRect();
  if (!fromEl) return;
  const r = fromEl.getBoundingClientRect();
  const n = Math.min(4, Math.max(1, count));
  for (let i = 0; i < n; i++) {
    const s = document.createElement('div');
    s.className = 'fly';
    s.innerHTML = `<svg viewBox="0 0 24 24" style="width:100%;height:100%;fill:var(--butter-400);filter:drop-shadow(0 2px 6px rgba(255,191,60,.6))"><use href="#i-star"/></svg>`;
    document.body.appendChild(s);
    const sx = r.left + r.width / 2 + (Math.random() - 0.5) * 34;
    const sy = r.top + r.height / 2 + (Math.random() - 0.5) * 24;
    s.style.left = `${sx}px`;
    s.style.top = `${sy}px`;
    s.style.transition = 'transform 780ms cubic-bezier(.5,-0.2,.3,1), opacity 780ms ease-in';
    requestAnimationFrame(() => {
      s.style.transform = `translate(${target.left + target.width / 2 - sx - 15}px, ${target.top + target.height / 2 - sy - 15}px) scale(.45) rotate(320deg)`;
      s.style.opacity = '0.15';
    });
    setTimeout(() => s.remove(), 820);
  }
  const pill = $('#starpill');
  pill.classList.add('bump');
  setTimeout(() => pill.classList.remove('bump'), 320);
}

/* ============================================================
   MODAL
   ============================================================ */
function openModal({ title, sub, body, actions }) {
  $('#modalTitle').textContent = title;
  $('#modalSub').textContent = sub || '';
  $('#modalBody').innerHTML = body || '';
  const acts = $('#modalActs');
  acts.innerHTML = '';
  (actions || []).forEach((a) => {
    const b = document.createElement('button');
    b.className = `btn ${a.cls || ''}`;
    b.textContent = a.label;
    // An action returning `false` (or `close:false`) keeps the dialog open —
    // needed for forms that validate before they can be dismissed.
    // A promise-returning action is awaited first, so an async handler can
    // report failure too. Synchronous handlers still close synchronously.
    const done = (r) => { if (a.close !== false && r !== false) closeModal(); };
    b.onclick = () => {
      const r = a.fn ? a.fn() : undefined;
      if (r && typeof r.then === 'function') { r.then(done, done); return; }
      done(r);
    };
    acts.appendChild(b);
  });
  $('#modal').hidden = false;
  const f = $('#modalBody input, #modalBody select, #modalBody textarea');
  if (f) setTimeout(() => f.focus(), 60);
}
function closeModal() { $('#modal').hidden = true; }
$('#modal').addEventListener('click', (e) => { if (e.target.dataset.close !== undefined) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

/* ============================================================
   DATE RAIL (swipeable)
   ============================================================ */
function renderDateRail() {
  const track = $('#dateTrack');
  const days = Calc.weekDays(UI.cursor);
  const t = todayISO();
  track.innerHTML = days.map((d) => {
    const rec = Store.state.days[d];
    const mood = rec && rec.mood ? rec.mood : '';
    const stars = Calc.dayStars(d);
    const dd = parseISO(d);
    const cls = [
      'day',
      d === t ? 'day--today' : '',
      d === UI.cursor ? 'day--selected' : '',
      d > t ? 'day--future' : '',
    ].filter(Boolean).join(' ');
    const starBits = stars > 0
      ? `<span class="day__stars"><svg style="fill:var(--butter-500)"><use href="#i-star"/></svg>${stars}</span>`
      : `<span class="day__stars" style="color:var(--ink-faint);opacity:.5">–</span>`;
    return `<button class="${cls}" role="tab" data-date="${d}"
              aria-selected="${d === UI.cursor}" aria-label="${longDate(d)}, ${stars} stars">
      <span class="day__dow">${DOW[dd.getDay()]}</span>
      <span class="day__num">${dd.getDate()}</span>
      <span class="day__mood">${mood || '&nbsp;'}</span>
      ${starBits}
    </button>`;
  }).join('');

  const ws = weekStartOf(UI.cursor);
  const we = addDays(ws, 6);
  // Show the year whenever the week is not in the current year, otherwise
  // "Oct 12 – Oct 18" is ambiguous when you are browsing an old week.
  const thisYear = String(new Date().getFullYear());
  const wy = ws.slice(0, 4);
  const weY = we.slice(0, 4);
  const label = (wy === thisYear && weY === thisYear)
    ? `${prettyDate(ws)} – ${prettyDate(we)}`
    : `${prettyDate(ws)}, ${wy} – ${prettyDate(we)}, ${weY}`;
  $('#weekLabel').textContent = label;

  // keep the selected day centred
  const sel = track.querySelector('.day--selected');
  if (sel) {
    const target = sel.offsetLeft - (track.clientWidth - sel.clientWidth) / 2;
    track.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
  }
}

$('#dateTrack').addEventListener('click', (e) => {
  // A horizontal swipe on touch ends with a click event; ignore it so dragging
  // the rail does not also select whichever day happened to be under the finger.
  if (UI.suppressClick) { UI.suppressClick = false; return; }
  const btn = e.target.closest('.day');
  if (!btn) return;
  UI.cursor = btn.dataset.date;
  renderAll();
});

/* drag / swipe to move between days */
(() => {
  const track = $('#dateTrack');
  let down = false, startX = 0, startScroll = 0, moved = 0;
  track.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    down = true; moved = 0;
    startX = e.clientX; startScroll = track.scrollLeft;
  });
  track.addEventListener('pointermove', (e) => {
    if (!down) return;
    const dx = e.clientX - startX;
    moved = Math.abs(dx);
    if (moved > 6) { track.classList.add('dragging'); track.scrollLeft = startScroll - dx; }
  });
  const end = () => {
    if (!down) return;
    down = false;
    track.classList.remove('dragging');
    if (moved > 52) {
      UI.suppressClick = true;          // swallow the trailing click
      stepDay(moved > 0 ? -1 : 1);
      setTimeout(() => { UI.suppressClick = false; }, 60);
    }
  };
  track.addEventListener('pointerup', end);
  track.addEventListener('pointercancel', end);
  track.addEventListener('pointerleave', end);
})();

function stepDay(dir) {
  const days = Calc.weekDays(UI.cursor);
  const i = days.indexOf(UI.cursor);
  const next = i + dir;
  if (next < 0) { UI.cursor = addDays(days[0], dir); }
  else if (next > 6) { UI.cursor = addDays(days[6], dir); }
  else UI.cursor = days[next];
  UI.cursor = clampDate(UI.cursor);
  renderAll();
}

$('#btnPrevWeek').onclick = () => { UI.cursor = clampDate(addDays(UI.cursor, -7)); renderAll(); };
$('#btnNextWeek').onclick = () => { UI.cursor = clampDate(addDays(UI.cursor, 7)); renderAll(); };
$('#btnToday').onclick = () => { UI.cursor = todayISO(); renderAll(); };

/* keyboard nav */
document.addEventListener('keydown', (e) => {
  if (UI.tab !== 'daily') return;
  const tag = document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (e.key === 'ArrowLeft') { stepDay(-1); e.preventDefault(); }
  if (e.key === 'ArrowRight') { stepDay(1); e.preventDefault(); }
});

/* ============================================================
   DATE PICKER  ·  year / month / day selects
   ------------------------------------------------------------
   The selectable window is DATE_MIN … DATE_MAX (2026-10-01 … 2099-12-31).
   Changing year/month/day only fills the selects in — the cursor moves
   when Go is tapped, so picking 2099-12-31 never jumps twice on the way.
   ============================================================ */
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const YEAR_MIN = Number(DATE_MIN.slice(0, 4));   // 2026
const YEAR_MAX = Number(DATE_MAX.slice(0, 4));   // 2099
const MONTH_MIN_IN_MIN_YEAR = Number(DATE_MIN.slice(5, 7)) - 1;   // October
const MONTH_MAX_IN_MAX_YEAR = Number(DATE_MAX.slice(5, 7)) - 1;   // December

function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }

/* Months offered for a picked year — the boundary years clip their list. */
function monthsForYear(y) {
  let lo = 0, hi = 11;
  if (y === YEAR_MIN) lo = MONTH_MIN_IN_MIN_YEAR;
  if (y === YEAR_MAX) hi = MONTH_MAX_IN_MAX_YEAR;
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
}

function fillMonthOptions(box, y, keepM) {
  const mS = $('[data-dp="m"]', box);
  const months = monthsForYear(y);
  mS.innerHTML = months
    .map((i) => `<option value="${i}">${MONTH_NAMES[i]}</option>`).join('');
  mS.value = String(months.includes(keepM) ? keepM : months[0]);
  return Number(mS.value);
}

/* Build one picker into a container. `value` is an ISO date. */
function renderDatePicker(box, value) {
  const d = parseISO(clampDate(value));
  const y = d.getFullYear(), m = d.getMonth(), day = d.getDate();

  const years = [];
  for (let v = YEAR_MIN; v <= YEAR_MAX; v++) years.push(v);

  box.innerHTML = `
    <div class="datepick__grid">
      <label class="datepick__cell">
        <span>Year</span>
        <select class="select select--sm" data-dp="y">
          ${years.map((v) => `<option value="${v}" ${v === y ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
      </label>
      <label class="datepick__cell">
        <span>Month</span>
        <select class="select select--sm" data-dp="m"></select>
      </label>
      <label class="datepick__cell">
        <span>Day</span>
        <select class="select select--sm" data-dp="d"></select>
      </label>
      <button class="btn btn--sm btn--primary datepick__go" data-dp="go">Go</button>
    </div>
    <div class="datepick__quick">
      <button class="btn btn--sm btn--ghost" data-dp="q" data-off="0">Today</button>
      <button class="btn btn--sm btn--ghost" data-dp="q" data-off="-1">Yesterday</button>
      <button class="btn btn--sm btn--ghost" data-dp="q" data-off="-7">Last week</button>
      <button class="btn btn--sm btn--ghost" data-dp="q" data-off="7">Next week</button>
    </div>`;
  const mReal = fillMonthOptions(box, y, m);
  rebuildDayOptions(box, y, mReal, day);
  box.dataset.dpym = `${y}-${mReal}`;
}

/* Reads the three selects into a clamped ISO date. */
function readDatePicker(box) {
  const y = Number($('[data-dp="y"]', box).value);
  const m = Number($('[data-dp="m"]', box).value);
  const day = Math.min(Number($('[data-dp="d"]', box).value) || 1, daysInMonth(y, m));
  return clampDate(iso(new Date(y, m, day)));
}

/* Wire a picker: changing a select only refills its dependents; the cursor
   moves on Go (or on a quick-jump button). */
function bindDatePicker(box, onPick) {
  box.addEventListener('change', (e) => {
    const sel = e.target.closest('select[data-dp]');
    if (!sel) return;
    const y = Number($('[data-dp="y"]', box).value);
    let m = Number($('[data-dp="m"]', box).value);
    if (sel.dataset.dp === 'y') m = fillMonthOptions(box, y, m);
    const key = `${y}-${m}`;
    if (box.dataset.dpym !== key) {
      const keep = Number($('[data-dp="d"]', box).value) || 1;
      rebuildDayOptions(box, y, m, keep);
      box.dataset.dpym = key;
    }
  });
  box.addEventListener('click', (e) => {
    const go = e.target.closest('[data-dp="go"]');
    const q = e.target.closest('[data-dp="q"]');
    if (go) { onPick(readDatePicker(box)); return; }
    if (q) onPick(clampDate(addDays(todayISO(), Number(q.dataset.off))));
  });
}

let dailyPickerOpen = false, calPickerOpen = false;

function pickDate(date, opts = {}) {
  UI.cursor = clampDate(date);
  const d = parseISO(UI.cursor);
  UI.calMonth = { y: d.getFullYear(), m: d.getMonth() };
  if (opts.close) {
    dailyPickerOpen = calPickerOpen = false;
    $('#datepickDaily').hidden = true;
    $('#datepickCal').hidden = true;
    $('#btnPickDate').setAttribute('aria-expanded', 'false');
    $('#btnPickCalDate').setAttribute('aria-expanded', 'false');
  }
  // Always switch: picking a date means "show me that day", and switchTab
  // repaints whichever view we land on. renderAll() alone would be a no-op
  // when the other tab happened to be the active one.
  switchTab(opts.to === 'jar' ? 'jar' : 'daily');
}

$('#btnPickDate').onclick = () => {
  dailyPickerOpen = !dailyPickerOpen;
  $('#datepickDaily').hidden = !dailyPickerOpen;
  $('#btnPickDate').setAttribute('aria-expanded', String(dailyPickerOpen));
  if (dailyPickerOpen) renderDatePicker($('#datepickDaily'), UI.cursor);
};
$('#btnPickCalDate').onclick = () => {
  calPickerOpen = !calPickerOpen;
  $('#datepickCal').hidden = !calPickerOpen;
  $('#btnPickCalDate').setAttribute('aria-expanded', String(calPickerOpen));
  if (calPickerOpen) renderDatePicker($('#datepickCal'), UI.cursor);
};

bindDatePicker($('#datepickDaily'), (d) => pickDate(d, { to: 'daily' }));
/* "Jump to" behaves like clicking a calendar cell: land on the daily view. */
bindDatePicker($('#datepickCal'), (d) => pickDate(d, { to: 'daily', close: true }));

/* ============================================================
   ACTIVITY TIMELINE + JSONL / CSV EXPORT
   ============================================================ */
let eventDayFilter = '';   // '' = show everything

function renderTimeline() {
  const box = $('#timeline');
  if (!box) return;
  const all = Log.all();
  const shown = eventDayFilter ? all.filter((e) => e.date === eventDayFilter) : all;

  $('#eventCountChip').textContent =
    eventDayFilter
      ? `${shown.length} on ${prettyDate(eventDayFilter)}`
      : `${all.length} event${all.length === 1 ? '' : 's'}`;
  $('#btnEventDay').textContent = eventDayFilter ? 'Show all days' : 'Today only';

  if (!shown.length) {
    box.innerHTML = `<p style="font-size:.86rem;color:var(--ink-soft);font-weight:600">
      ${eventDayFilter
        ? 'Nothing recorded on that day.'
        : 'Nothing recorded yet. Tick a task and it will show up here.'}</p>`;
    return;
  }

  // group by day, newest day first
  const groups = [];
  shown.forEach((e) => {
    let g = groups.find((x) => x.date === e.date);
    if (!g) { g = { date: e.date, events: [] }; groups.push(g); }
    g.events.push(e);
  });

  box.innerHTML = groups.slice(0, 8).map((g) => `
    <div class="tl-day">
      <button class="tl-day__head" data-tl-date="${g.date}">
        <span class="tl-day__name">${prettyDate(g.date)}</span>
        <span class="tl-day__dow">${longDate(g.date).split(',')[0]}</span>
        <span class="tl-day__n">${g.events.length}</span>
      </button>
      <div class="tl-items">
        ${g.events.map((e) => {
          const meta = EVENT_TYPES[e.type] || { label: e.type, icon: '•' };
          const time = new Date(e.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const stars = e.stars
            ? `<span class="tl-stars tl-stars--${meta.sign > 0 ? 'up' : meta.sign < 0 ? 'down' : 'flat'}">${meta.sign > 0 ? '+' : meta.sign < 0 ? '−' : ''}${e.stars}</span>`
            : '';
          return `<div class="tl-item">
            <span class="tl-item__ico">${meta.icon}</span>
            <span class="tl-item__body">
              <span class="tl-item__label">${escapeHtml(e.label || meta.label)}</span>
              <span class="tl-item__meta">${meta.label} · ${time}${e.mood ? ' · ' + e.mood : ''}</span>
            </span>
            ${stars}
          </div>`;
        }).join('')}
      </div>
    </div>`).join('');
}

$('#timeline').addEventListener('click', (e) => {
  const h = e.target.closest('[data-tl-date]');
  if (h) { UI.cursor = h.dataset.tlDate; renderAll(); }
});

$('#btnEventDay').onclick = () => {
  eventDayFilter = eventDayFilter ? '' : UI.cursor;
  renderTimeline();
};

/* ============================================================
   Saving a file
   ------------------------------------------------------------
   A plain `a.download` + `blob:` URL is not enough on a phone:
     - iOS Safari ignores the download attribute on blob: URLs and just
       opens the content in a tab, so nothing lands in Files;
     - revoking the object URL immediately after .click() races the download
       and can cancel it outright;
     - a detached <a> is flaky in WebKit.
   So: offer the Share sheet first (the real "save to Files" path on iOS),
   then a well-behaved anchor, then a new tab as a last resort.
   ============================================================ */
async function saveFile(filename, text, mime) {
  const file = new File([text], filename, { type: mime });

  // 1. Share sheet — on phones this is what actually saves the file.
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return 'shared';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';   // user backed out
      // otherwise fall through to the anchor
    }
  }

  // 2. Anchor download, attached and revoked late enough to survive.
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 3000);
  return 'downloaded';
}

/* ============================================================
   EXPORT — one menu, four formats
   ------------------------------------------------------------
   - Whole jar (JSON): the portable backup another device can import.
   - Event log (JSONL / CSV): the append-only history, one line per event.
   - Spreadsheet (.xls): a real Excel workbook via SpreadsheetML — two sheets
     (Events + Days) with no third-party library to ship or break offline.
   ============================================================ */
function toExcelXML() {
  const xe = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  const cell = (v, num, head) =>
    head ? `<Cell ss:StyleID="h"><Data ss:Type="String">${xe(v)}</Data></Cell>`
         : num && v !== '' && v != null
           ? `<Cell><Data ss:Type="Number">${v}</Data></Cell>`
           : `<Cell><Data ss:Type="String">${xe(v)}</Data></Cell>`;
  const row = (vals) => `<Row>${vals.join('')}</Row>`;
  const head = (cols) => row(cols.map((c) => cell(c, 0, 1)));

  const evCols = ['id', 'ts', 'iso_time', 'date', 'weekday', 'type', 'label', 'stars', 'mood', 'note'];
  const evRows = (Store.state.events || []).map((e) => {
    const d = new Date(e.ts);
    return row([
      cell(e.id), cell(e.ts, 1), cell(d.toISOString()), cell(e.date),
      cell(DOW[d.getDay()]), cell(e.type), cell(e.label),
      cell(e.stars, 1), cell(e.mood), cell(e.note),
    ]);
  });

  const dayCols = ['date', 'weekday', 'tasks_done', 'stars', 'mood', 'proud_note', 'bonuses'];
  const dayRows = Object.keys(Store.state.days).sort().map((k) => {
    const rec = Store.state.days[k];
    const d = parseISO(k);
    const bonus = (rec.bonus || []).map((b) => `${b.label} (+${b.stars})`).join('; ');
    return row([
      cell(k), cell(DOW[d.getDay()]), cell((rec.ticks || []).length, 1),
      cell(Calc.dayStars(k), 1), cell(rec.mood || ''), cell(rec.proud || ''), cell(bonus),
    ]);
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles><Style ss:ID="h"><Font ss:Bold="1"/></Style></Styles>
<Worksheet ss:Name="Events"><Table>
<Column ss:AutoFitWidth="1"/>
${head(evCols)}
${evRows.join('\n')}
</Table></Worksheet>
<Worksheet ss:Name="Days"><Table>
<Column ss:AutoFitWidth="1"/>
${head(dayCols)}
${dayRows.join('\n')}
</Table></Worksheet>
</Workbook>`;
}

async function exportJar(kind) {
  let how;
  if (kind === 'json') {
    how = await saveFile(`star-jar-${todayISO()}.json`,
      JSON.stringify(Store.state, null, 2), 'application/json');
    if (how === 'cancelled') return;
    toast(how === 'shared' ? 'Ready to save or send' : 'Whole jar exported — keep it somewhere safe');
  } else if (kind === 'jsonl') {
    how = await saveFile(`star-jar-events-${todayISO()}.jsonl`, Log.toJSONL(), 'application/x-ndjson');
    if (how === 'shared') toast(`${Log.count()} events ready to save or send`);
    else if (how === 'downloaded') toast(`${Log.count()} events exported — append-only, keep it safe`);
  } else if (kind === 'csv') {
    how = await saveFile(`star-jar-events-${todayISO()}.csv`, Log.toCSV(), 'text/csv');
    if (how === 'shared') toast(`${Log.count()} events ready to save or send`);
    else if (how === 'downloaded') toast(`${Log.count()} events exported to CSV`);
  } else if (kind === 'xls') {
    how = await saveFile(`star-jar-${todayISO()}.xls`, toExcelXML(), 'application/vnd.ms-excel');
    if (how === 'cancelled') return;
    toast(how === 'shared' ? 'Spreadsheet ready to save or send' : 'Spreadsheet exported — opens in Excel');
  }
}

/* Dropdown helper: the button toggles its menu; a click anywhere else or on
   an item closes it. Works for both export menus (timeline card + footer). */
function wireMenu(btnId, menuId) {
  const btn = $('#' + btnId), menu = $('#' + menuId);
  if (!btn || !menu) return;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const wasOpen = !menu.hidden;
    document.querySelectorAll('.menu').forEach((m) => { m.hidden = true; });
    menu.hidden = wasOpen;
    btn.setAttribute('aria-expanded', String(!wasOpen));
  });
  menu.addEventListener('click', (e) => {
    const item = e.target.closest('[data-x]');
    if (!item) return;
    menu.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    exportJar(item.dataset.x);
  });
}
wireMenu('btnExportMenu', 'exportMenu');
wireMenu('btnExportMenuF', 'exportMenuF');
document.addEventListener('click', () => {
  document.querySelectorAll('.menu').forEach((m) => { m.hidden = true; });
});

/* ============================================================
   SYNC — one panel, whichever provider is configured.
   Supabase when the user has connected one. The built-in cloud is
   deliberately NOT auto-offered: its library loads fine but the credential
   is rejected at the gateway, so showing its email form only walks people
   into a dead end. It stays wired up in case that credential is restored,
   and the panel picks it up once it has actually worked once.
   ============================================================ */
function syncProvider() {
  if (typeof Supa !== 'undefined' && Supa.configured) return Supa;
  if (typeof Cloud !== 'undefined' && Cloud.proven) return Cloud;
  return null;
}

function paintCloud() {
  const box = $('#cloudPanel');
  const chip = $('#cloudChip');
  if (!box || typeof Supa === 'undefined') return;

  const P = syncProvider();

  if (!P) {
    chip.textContent = 'not connected';
    box.innerHTML = `<div class="cloudblocked">
        <span class="cloudblocked__ico">☁️</span>
        <span class="cloudblocked__body">
          <strong>Automatic sync is not switched on.</strong>
          Nothing is lost without it — every star stays on this device.
          To move the jar to another device, use <b>Export my jar</b> and
          <b>Import</b> at the bottom of this page. To sync automatically,
          connect a cloud account in <b>Settings → Cloud sync</b>.
        </span>
      </div>`;
    return;
  }

  const isSupa = P === Supa;

  // A rejected app credential means sign-in can never work, so stop offering
  // a form that cannot succeed and point at the manual route.
  if (P.blocked) {
    chip.textContent = 'unavailable';
    box.innerHTML = `<div class="cloudblocked">
        <span class="cloudblocked__ico">🔌</span>
        <span class="cloudblocked__body">
          <strong>Automatic sync is switched off right now.</strong>
          The sign-in service rejected this app's access, so no device can
          reach the cloud copy. Nothing is lost — every star stays on this
          device, and nothing you can fix in the app will change it.
          <em>To move the jar to another device, use <b>Export my jar</b> and
          <b>Import</b> at the bottom of this page.</em>
        </span>
      </div>`;
    return;
  }

  if (isSupa && Supa.sdkState === 'loading' && !Supa.client) {
    // Only a genuine "still fetching the library" state. If a client already
    // exists, render the form regardless — never leave someone staring at a
    // spinner that cannot resolve.
    chip.textContent = 'loading…';
    box.innerHTML = `<p style="font-size:.84rem;color:var(--ink-soft);font-weight:600">
      Getting sync ready… Everything works on this device in the meantime.</p>`;
    return;
  }

  if (!P.user) {
    // The 6-digit code is the primary path. Supabase's default template mails
    // a link, but a link can be rewritten by the mail provider (QQ Mail wraps
    // every link in a spam redirect and drops the token) — a code cannot.
    // So: email a code, type it back, and a matching code means both devices
    // are the same account and their jars can sync.
    const waiting = P.status === 'awaiting-code' || P.status === 'link-sent';
    // Supa keeps the address on `email`; Cloud keeps it on `pending.email`.
    const waitEmail = P.email || (P.pending && P.pending.email) || '';
    chip.textContent = 'not signed in';
    box.innerHTML = `
      <div class="field">
        <label for="clEmail">Parent's email</label>
        <input class="input" id="clEmail" type="email" inputmode="email" autocomplete="email"
               placeholder="you@example.com" value="${escapeHtml(waitEmail)}" ${waiting ? 'disabled' : ''}>
      </div>
      ${waiting ? `
        <p style="margin-top:11px;font-size:.84rem;font-weight:700;color:var(--mint-700);
                  background:var(--mint-50);border:2px solid var(--mint-200);border-radius:12px;padding:11px 13px">
          ✉️ We emailed a 6-digit code to
          ${escapeHtml((waitEmail || 'your email').replace(/^(.).*(@.*)$/, '$1•••$2'))}.
          Type it below to prove it is you — the same account then syncs on
          every device.
        </p>
        <div class="field" style="margin-top:10px">
          <label for="clCode">6-digit code from the email</label>
          <input class="input" id="clCode" inputmode="numeric" autocomplete="one-time-code"
                 placeholder="123456" maxlength="8">
        </div>` : ''}
      <div style="display:flex;gap:7px;margin-top:12px;flex-wrap:wrap">
        ${waiting
          ? `<button class="btn btn--mint" id="clConfirm" ${P.busy ? 'disabled' : ''}>
               ${P.busy ? 'Verifying…' : 'Verify & sync'}</button>
             <button class="btn" id="clResend">Use a different email</button>`
          : `<button class="btn btn--mint" id="clSend" ${P.busy ? 'disabled' : ''}>
               ${P.busy ? 'Sending…' : 'Email me a 6-digit code'}</button>`}
      </div>
      ${cloudNote()}`;

    const send = $('#clSend');
    if (send) {
      send.onclick = () => (isSupa ? Supa.sendCode($('#clEmail').value)
                                   : Cloud.sendCode($('#clEmail').value));
    }
    const confirmBtn = $('#clConfirm');
    if (confirmBtn) {
      confirmBtn.onclick = () => (isSupa ? Supa.confirmCode($('#clCode').value)
                                          : Cloud.confirmCode($('#clCode').value));
    }
    // Enter should submit the code, not just clicking the button.
    const codeBox = $('#clCode');
    if (codeBox) {
      codeBox.onkeydown = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); if (confirmBtn) confirmBtn.click(); }
      };
    }
    // Enter on the email field should request a code.
    const emailBox = $('#clEmail');
    if (emailBox) {
      emailBox.onkeydown = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); if (send) send.click(); }
      };
    }
    const resend = $('#clResend');
    if (resend) {
      resend.onclick = () => {
        if (isSupa) { Supa.email = ''; Supa.status = 'signed-out'; }
        else { Cloud.pending = null; Cloud.status = 'idle'; }
        paintCloud();
      };
    }
    return;
  }

  const when = P.lastSync
    ? new Date(P.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'not yet';
  chip.textContent = P.busy ? 'syncing…' : `synced ${when}`;
  box.innerHTML = `
    <div class="store-row">
      <span class="store-dot ${P.status === 'error' ? 'is-off' : 'is-ok'}"></span>
      <span class="store-row__body">
        <span class="store-row__label">${escapeHtml(P.user.user_metadata?.email
          || P.user.email || P.user.name || 'Signed in')}</span>
        <span class="store-row__detail">${escapeHtml(P.message || `Last synced at ${when}`)}</span>
      </span>
      <span class="chip ${P.status === 'error' ? 'chip--butter' : 'chip--mint'}">
        ${P.status === 'error' ? 'problem' : 'on'}</span>
    </div>
    <div style="display:flex;gap:7px;margin-top:11px;flex-wrap:wrap">
      <button class="btn btn--sm btn--mint" id="clSync" ${P.busy ? 'disabled' : ''}>
        ${P.busy ? 'Syncing…' : 'Sync now'}</button>
      <button class="btn btn--sm" id="clOut">Sign out</button>
      ${isSupa ? `<button class="btn btn--sm" id="clConfig">Change account</button>` : ''}
    </div>
    ${cloudNote()}`;
  $('#clSync').onclick = () => P.sync(false);
  $('#clOut').onclick = () => P.signOut();
  const cfg = $('#clConfig');
  if (cfg) cfg.onclick = () => openCloudSettings();
}

function cloudNote() {
  const P = syncProvider();
  // Any state can carry a message — a rejected code keeps status
  // 'awaiting-code' so the input stays on screen, and hiding the reason
  // there would leave someone guessing at a 6-digit field.
  if (P && P.lastError && P.status !== 'ok' && P.status !== 'link-sent') {
    return `<p style="margin-top:10px;font-size:.78rem;font-weight:700;color:var(--peach-700);background:var(--peach-50);
                    border:2px solid var(--peach-200);border-radius:12px;padding:9px 12px">${escapeHtml(P.lastError)}</p>`;
  }
  return '';
}

/* ============================================================
   CLOUD ACCOUNT SETTINGS
   ============================================================ */
function openCloudSettings() {
  const s = Store.state.sync || {};
  openModal({
    title: 'Cloud sync',
    sub: 'Connect a free Supabase project so every device keeps the same jar.',
    body: `
      <ol style="display:grid;gap:8px;padding-left:19px;font-weight:600;font-size:.86rem;line-height:1.5;color:var(--ink-soft)">
        <li>Create a free project at <strong>supabase.com</strong></li>
        <li>Open <strong>SQL Editor</strong>, paste <strong>SUPABASE-SETUP.txt</strong>
            (it ships in this app's folder) and run it</li>
        <li>Under <strong>Authentication → Email Templates → Magic Link</strong>,
            make the body contain <code>{{ .Token }}</code> instead of
            <code>{{ .ConfirmationURL }}</code>, so the email carries a
            <strong>6-digit code</strong> (not a link)</li>
        <li>Under <strong>Authentication → URL Configuration</strong>, add
            <strong>${escapeHtml(location.origin)}</strong> to Redirect URLs</li>
        <li>Paste the two values from <strong>Project Settings → API</strong> below</li>
      </ol>
      <p style="margin-top:11px;font-size:.78rem;font-weight:700;color:var(--butter-700);
                background:var(--butter-50);border:2px solid var(--butter-200);border-radius:12px;padding:10px 12px;line-height:1.5">
        Sign-in works by <strong>6-digit code</strong>: you type your email, we
        mail a code, and you type it back to prove it is you. A matching code
        means the same account, so your stars sync across devices. If the email
        shows a long link instead of a code, step 3 above has not been applied yet.
      </p>
      <div class="field" style="margin-top:14px">
        <label for="csUrl">Project URL</label>
        <input class="input" id="csUrl" placeholder="https://xxxx.supabase.co"
               value="${escapeHtml(s.supabaseUrl || '')}" autocomplete="off">
      </div>
      <div class="field" style="margin-top:10px">
        <label for="csKey">anon public key</label>
        <input class="input" id="csKey" placeholder="eyJhbGciOi…" autocomplete="off"
               value="${escapeHtml(s.supabaseKey || '')}">
      </div>
      <p style="margin-top:10px;font-size:.76rem;color:var(--ink-faint);font-weight:600;line-height:1.5">
        The <b>anon public</b> key is designed to be published in a web page — it
        grants nothing on its own, and row-level rules keep each account's jar
        private. Never paste the <b>service_role</b> key here.
      </p>
      <div id="csMsg" style="margin-top:10px"></div>`,
    actions: [
      ...(s.supabaseUrl ? [{ label: 'Disconnect', cls: 'btn--ghost', fn: () => {
        Supa.disconnect(); toast('Cloud account disconnected'); renderAll();
      } }] : []),
      { label: 'Cancel' },
      { label: 'Connect', cls: 'btn--mint', fn: async () => {
        const msg = $('#csMsg');
        msg.innerHTML = `<p style="font-size:.82rem;font-weight:700;color:var(--ink-faint)">Checking…</p>`;
        const r = await Supa.configure($('#csUrl').value, $('#csKey').value);
        if (!r.ok) {
          msg.innerHTML = `<p style="font-size:.8rem;font-weight:700;color:var(--peach-700);
            background:var(--peach-50);border:2px solid var(--peach-200);border-radius:12px;padding:10px 12px">
            ${escapeHtml(r.error)}</p>`;
          return false;   // keep the dialog open so the values can be corrected
        }
        toast('Cloud account connected');
        renderAll();
        return true;
      } },
    ],
  });
}

/* ============================================================
   TASKS
   ============================================================ */
/* Each category owns a macaron hue. The row publishes it as --cat / --cat-soft
   so every part of the row (dot, label, tick, hover border, done tint) draws
   from the SAME colour in every state — many colours, one system. */
const CAT_COLOR = {
  'Learning':       { c: '--lilac-300',  s: '--lilac-50',  t: '--lilac-700' },
  'Helping Out':    { c: '--mint-300',   s: '--mint-50',   t: '--mint-700' },
  'Fun':            { c: '--peach-300',  s: '--peach-50',  t: '--peach-700' },
  'Bravery':        { c: '--pink-300',   s: '--pink-50',   t: '--pink-700' },
  'Morning & Night':{ c: '--sky-300',    s: '--sky-50',    t: '--sky-700' },
  'Other':          { c: '--butter-300', s: '--butter-50', t: '--butter-700' },
};
const catVars = (name) => {
  const k = CAT_COLOR[name] || CAT_COLOR.Other;
  return `--cat:var(${k.c});--cat-soft:var(${k.s});--cat-text:var(${k.t})`;
};

/* True when the day in view hasn't arrived yet — look, but don't tick. */
const isFutureDay = () => UI.cursor > todayISO();

function renderTasks() {
  const rec = ensureDay(UI.cursor);
  const list = $('#taskList');
  const done = new Set(rec.ticks);
  const future = isFutureDay();

  // Tasks with a schedule are visible on every day, but only tickable while
  // the day in view sits inside their from..until window.
  const active = Calc.tasksFor(UI.cursor);
  const activeIds = new Set(active.map((t) => t.id));

  $('#futureBanner').hidden = !future;

  const schedLabel = (t) => {
    if (!t.from && !t.to) return '';
    const f = t.from ? prettyDate(t.from) : '…';
    const u = t.to ? prettyDate(t.to) : '…';
    return `<div class="task__sched" title="Runs ${f} → ${u}">🗓 ${f} → ${u}</div>`;
  };

  const row = (t, i, off) => {
    const isDone = done.has(t.id);
    const locked = future || off;
    return `<div class="task ${isDone ? 'task--done' : ''} ${t.sub ? 'task--sub' : ''} ${locked ? 'task--off' : ''}"
                 style="${catVars(t.cat)}; animation-delay:${Math.min(i * 26, 420)}ms" data-id="${t.id}">
      <button class="task__check" data-act="toggle" data-id="${t.id}" ${locked ? 'disabled' : ''}
              aria-pressed="${isDone}"
              aria-label="${future ? 'This day has not arrived yet' : off ? 'Not scheduled on this day' : isDone ? 'Undo' : 'Mark done'}: ${escapeHtml(t.name)}"
              title="${future ? 'This day has not arrived yet' : off ? 'Not scheduled on this day' : ''}">
        <svg viewBox="0 0 24 24"><use href="#i-check"/></svg>
      </button>
      <span class="task__icon" aria-hidden="true">${t.icon || '⭐'}</span>
      <div class="task__name">${escapeHtml(t.name)}${schedLabel(t)}</div>
      <div class="task__cat"><span class="task__catdot" aria-hidden="true"></span>${escapeHtml(t.cat || 'Other')}</div>
      <div class="task__val" title="${t.stars} star${t.stars === 1 ? '' : 's'}">
        <svg style="fill:var(--butter-500)"><use href="#i-star"/></svg><span>${t.stars}</span>
      </div>
      <div class="task__acts">
        <button class="iconbtn" data-act="edit" data-id="${t.id}" aria-label="Edit ${escapeHtml(t.name)}">
          <svg viewBox="0 0 24 24"><use href="#i-edit"/></svg>
        </button>
        <button class="iconbtn" data-act="del" data-id="${t.id}" aria-label="Delete ${escapeHtml(t.name)}">
          <svg viewBox="0 0 24 24"><use href="#i-trash"/></svg>
        </button>
      </div>
    </div>`;
  };

  const activeRows = Store.state.tasks.filter((t) => activeIds.has(t.id));
  const offRows = Store.state.tasks.filter((t) => !activeIds.has(t.id));
  list.innerHTML =
    activeRows.map((t, i) => row(t, i, false)).join('') +
    offRows.map((t, i) => row(t, activeRows.length + i, true)).join('') ||
    `<div class="empty"><div class="empty__ico">🗒️</div><p>No tasks yet — add your first one below.</p></div>`;

  $('#taskCountChip').textContent = `${done.size} / ${active.length}`;
  $('#taskDayLabel').textContent =
    UI.cursor === todayISO() ? 'today' : longDate(UI.cursor).split(',')[0].toLowerCase();
}

$('#taskList').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const { act, id } = btn.dataset;
  const rec = ensureDay(UI.cursor);

  if (act === 'toggle') {
    if (isFutureDay()) return;                 // tomorrow's stars can't be ticked yet
    const t = Store.state.tasks.find((x) => x.id === id);
    if (!t || !taskActiveOn(t, UI.cursor)) return;   // outside its schedule
    const i = rec.ticks.indexOf(id);
    const before = Calc.dayStars(UI.cursor);
    if (i >= 0) {
      rec.ticks.splice(i, 1);
      // Appended, never edited away: the earlier task.tick stays in the log.
      Log.append('task.untick', { label: t ? t.name : '', stars: t ? t.stars : 0 });
    } else {
      rec.ticks.push(id);
      Log.append('task.tick', { label: t ? t.name : '', stars: t ? t.stars : 0 });
    }
    // Report the REAL delta. With no showing-up bonus this equals the task's
    // own value, but computing it rather than printing t.stars means the toast
    // can never disagree with the counter again.
    const delta = Calc.dayStars(UI.cursor) - before;
    if (delta > 0) {
      flyStars(btn, t ? t.stars : 1);
      toast(`+${delta} star${delta === 1 ? '' : 's'} — ${t ? t.name : ''}`, 'star');
    }
    Store.save(); renderAll();
  }

  if (act === 'edit') {
    const t = Store.state.tasks.find((x) => x.id === id);
    if (!t) return;
    UI.editingTask = id;
    $('#tfIcon').value = t.icon;
    $('#tfName').value = t.name;
    $('#tfStars').value = t.stars;
    $('#tfCat').value = t.cat || 'Other';
    $('#tfFrom').value = t.from || '';
    $('#tfTo').value = t.to || '';
    $('#tfSubmit').textContent = 'Save changes';
    $('#tfSubmit').classList.remove('btn--primary');
    $('#tfSubmit').classList.add('btn--mint');
    $('#tfCancel').hidden = false;
    $('#tfName').focus();
  }

  if (act === 'del') {
    const t = Store.state.tasks.find((x) => x.id === id);
    if (!t) return;
    openModal({
      title: 'Delete this task?',
      sub: `"${t.name}" will be removed from every day. Stars already earned stay in the jar.`,
      body: '',
      actions: [
        { label: 'Keep it', cls: '' },
        {
          label: 'Delete', cls: 'btn--danger', fn: () => {
            Log.append('task.delete', { label: t.name, stars: t.stars });
            Store.state.tasks = Store.state.tasks.filter((x) => x.id !== id);
            Object.values(Store.state.days).forEach((d) => {
              d.ticks = (d.ticks || []).filter((x) => x !== id);
            });
            Store.save();
            toast('Task deleted');
            renderAll();
          },
        },
      ],
    });
  }
});

/* add / edit task form */
$('#taskForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const icon = ($('#tfIcon').value || '⭐').trim().slice(0, 4);
  const name = $('#tfName').value.trim();
  const stars = Math.max(0, Math.min(20, Number($('#tfStars').value) || 0));
  const cat = $('#tfCat').value;
  if (!name) return;

  // Optional schedule window. Empty = long-term task with no bound.
  let from = $('#tfFrom').value || '';
  let to = $('#tfTo').value || '';
  if (from) from = clampDate(from);
  if (to) to = clampDate(to);
  if (from && to && from > to) {
    toast('The start date is after the stop date — please swap them');
    return;
  }

  if (UI.editingTask) {
    const t = Store.state.tasks.find((x) => x.id === UI.editingTask);
    if (t) Object.assign(t, { icon, name, stars, cat, from, to });
    Log.append('task.edit', { label: name, stars, note: cat });
    toast('Task updated');
    resetTaskForm();
  } else {
    Store.state.tasks.push({
      id: 't' + Date.now().toString(36) + Math.floor(Math.random() * 90 + 10),
      icon, name, stars, cat, from, to,
    });
    Log.append('task.add', { label: name, stars, note: cat });
    toast('Task added — nice one!');
    resetTaskForm();
  }
  Store.save(); renderAll();
});

function resetTaskForm() {
  UI.editingTask = null;
  $('#taskForm').reset();
  $('#tfIcon').value = '⭐';
  $('#tfStars').value = '1';
  $('#tfCat').value = CATEGORIES[0];
  $('#tfFrom').value = '';
  $('#tfTo').value = '';
  $('#tfSubmit').textContent = 'Add task';
  $('#tfSubmit').classList.add('btn--primary');
  $('#tfSubmit').classList.remove('btn--mint');
  $('#tfCancel').hidden = true;
}
$('#tfCancel').onclick = () => { resetTaskForm(); };

/* ============================================================
   MOOD
   ============================================================ */
function renderMoods() {
  const rec = ensureDay(UI.cursor);
  $('#moodRow').innerHTML = MOODS.map((m) => `
    <button class="mood" data-mood="${m.key}" aria-pressed="${rec.mood === m.key}"
            aria-label="Feeling ${m.label}">
      <span class="mood__e">${m.key}</span>
      <span class="mood__l">${m.label}</span>
    </button>`).join('');
}
$('#moodRow').addEventListener('click', (e) => {
  const b = e.target.closest('[data-mood]');
  if (!b) return;
  const rec = ensureDay(UI.cursor);
  rec.mood = rec.mood === b.dataset.mood ? '' : b.dataset.mood;
  Log.append(rec.mood ? 'mood.set' : 'mood.clear',
    { mood: rec.mood, label: `${MOODS.find((m) => m.key === b.dataset.mood)?.label || ''}` });
  Store.save();
  if (rec.mood) toast('Mood saved — any answer is OK 🌈');
  renderAll();
});

/* ============================================================
   BONUS STARS
   ============================================================ */
function renderBonus() {
  const rec = ensureDay(UI.cursor);
  const box = $('#bonusList');
  const future = isFutureDay();
  // Future days are read-only: no bonus stars can be added or removed yet.
  $('#bfLabel').disabled = future;
  $('#bfStars').disabled = future;
  const bfBtn = $('#bonusForm button[type="submit"], #bonusForm .btn');
  if (bfBtn) bfBtn.disabled = future;
  if (!rec.bonus.length) {
    box.innerHTML = `<p style="font-size:.84rem;color:var(--ink-soft);font-weight:600">
      ${future ? 'Bonus stars unlock when this day arrives.' : 'No extra bonuses today. Got something extra nice? Add it here.'}</p>`;
    return;
  }
  box.innerHTML = rec.bonus.map((b, i) => `
    <div class="bonus-pill">
      <svg viewBox="0 0 24 24" style="width:15px;height:15px;fill:var(--butter-500)"><use href="#i-star"/></svg>
      <span>${escapeHtml(b.label)}</span>
      <strong style="font-family:var(--f-num)">+${b.stars}</strong>
      <button data-bdel="${i}" ${future ? 'disabled' : ''} aria-label="Remove ${escapeHtml(b.label)}">×</button>
    </div>`).join('');
}
$('#bonusList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-bdel]');
  if (!b || b.disabled || isFutureDay()) return;
  const rec = ensureDay(UI.cursor);
  const [item] = rec.bonus.splice(Number(b.dataset.bdel), 1);
  Log.append('bonus.remove', { label: item.label, stars: item.stars });
  Store.save();
  toast(`Removed "${item.label}"`);
  renderAll();
});
$('#bonusForm').addEventListener('submit', (e) => {
  e.preventDefault();
  if (isFutureDay()) return;
  const label = $('#bfLabel').value.trim();
  const stars = Math.max(1, Math.min(10, Number($('#bfStars').value) || 1));
  if (!label) return;
  const rec = ensureDay(UI.cursor);
  rec.bonus.push({ label, stars });
  $('#bfLabel').value = '';
  Log.append('bonus.add', { label, stars });
  Store.save();
  flyStars($('#bfStars'), stars);
  toast(`+${stars} bonus star${stars === 1 ? '' : 's'} — ${label}`, 'star');
  renderAll();
});

/* ============================================================
   PROUD NOTE
   ============================================================ */
const proudBox = $('#proudBox');
proudBox.addEventListener('input', () => {
  const rec = ensureDay(UI.cursor);
  const before = rec.proud || '';
  rec.proud = proudBox.value;
  $('#proudCount').textContent = `${proudBox.value.length} / 180`;
  // Log only when the text actually settles on something new, so typing does
  // not append one line per keystroke.
  clearTimeout(proudBox._t);
  const settled = rec.proud;
  proudBox._t = setTimeout(() => {
    if (settled !== before) Log.append('note.set', { note: settled });
    Store.save();
  }, 700);
});
proudBox.addEventListener('blur', () => { clearTimeout(proudBox._t); Store.save(); renderAll(); });

function renderProud() {
  const rec = ensureDay(UI.cursor);
  if (document.activeElement !== proudBox) proudBox.value = rec.proud || '';
  $('#proudCount').textContent = `${(rec.proud || '').length} / 180`;
}

/* ============================================================
   GOOD AT
   ============================================================ */
function renderGoodAt() {
  const box = $('#goodAtList');
  if (!Store.state.goodAt.length) {
    box.innerHTML = `<p style="font-size:.86rem;color:var(--ink-soft);font-weight:600">
      Nothing here yet — notice something you did well and write it down.</p>`;
    return;
  }
  box.innerHTML = Store.state.goodAt.map((g, i) => `
    <span class="goodat__item">${escapeHtml(g)}
      <button data-gdel="${i}" aria-label="Remove ${escapeHtml(g)}">×</button>
    </span>`).join('');
}
$('#goodAtList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-gdel]');
  if (!b) return;
  Log.append('goodat.remove', { label: Store.state.goodAt[Number(b.dataset.gdel)] });
  Store.state.goodAt.splice(Number(b.dataset.gdel), 1);
  Store.save(); renderAll();
});
$('#btnAddGood').onclick = () => {
  openModal({
    title: 'Something you are good at',
    sub: 'Write it small and specific — that is what makes it stick.',
    body: `<div class="field"><label for="gaInput">I am good at…</label>
           <input class="input" id="gaInput" maxlength="60" placeholder="I keep going even when it is hard"></div>`,
    actions: [
      { label: 'Cancel' },
      {
        label: 'Add', cls: 'btn--primary', fn: () => {
          const v = $('#gaInput').value.trim();
          if (!v) return;
          Store.state.goodAt.unshift(v);
          Log.append('goodat.add', { label: v });
          Store.save(); renderAll();
          toast('Added — that is worth noticing');
        },
      },
    ],
  });
};

/* ============================================================
   SUMMARY TILES + MINI BARS
   ============================================================ */
function renderSummary() {
  const today = todayISO();
  const isToday = UI.cursor === today;
  const dStars = Calc.dayStars(UI.cursor);
  const week = Calc.weekStars(UI.cursor);
  const active = Calc.daysActiveThisWeek(UI.cursor);
  const streak = Calc.moodStreak(UI.cursor);
  const breakdown = Calc.dayBreakdown(UI.cursor);

  // Stars come only from ticked tasks (plus any manual bonus), so the tile and
  // its subtitle now describe the same thing: what she did today.
  $('#sToday').textContent = dStars;
  $('#sTodaySub').textContent = dStars === 0
    ? (isToday ? 'tick a task to earn' : 'nothing that day')
    : `${breakdown.tasks}★ from ${breakdown.taskCount} task${breakdown.taskCount === 1 ? '' : 's'}`
      + (breakdown.bonus ? ` · ${breakdown.bonus}★ bonus` : '');
  $('#sWeek').textContent = week;
  $('#sWeekSub').textContent = `${active} of 7 days active`;
  $('#sStreak').textContent = streak;
  $('#sStreakSub').textContent = streak > 1 ? 'days in a row 🔥' : 'day in a row';
  $('#streakLabel').textContent = streak > 1 ? `${streak}-day streak 🔥` : '';

  // 14-day mini bars
  const series = Calc.activeSeries(14);
  const max = Math.max(...series.map((s) => s.stars), 1);
  $('#miniBars').innerHTML = series.map((s) => {
    const dd = parseISO(s.date);
    const h = s.stars > 0 ? Math.max(6, (s.stars / max) * 100) : 3;
    const sel = s.date === UI.cursor ? 'bar--sel' : '';
    return `<button class="bar ${sel}" data-date="${s.date}" title="${longDate(s.date)}: ${s.stars} stars">
      <span class="bar__v">${s.stars || ''}</span>
      <span class="bar__track"><span class="bar__fill ${s.stars ? '' : 'bar__fill--zero'}" style="height:${h}%"></span></span>
      <span class="bar__l">${DOW[dd.getDay()][0]}</span>
    </button>`;
  }).join('');
}
$('#miniBars').addEventListener('click', (e) => {
  const b = e.target.closest('[data-date]');
  if (b) { UI.cursor = b.dataset.date; renderAll(); }
});

/* ============================================================
   JAR (SVG with fill level + floating stars)
   ============================================================ */
const JAR_COLORS = ['var(--pink-300)', 'var(--butter-300)', 'var(--mint-300)', 'var(--lilac-300)', 'var(--sky-300)', 'var(--peach-300)'];

function renderJar() {
  const pct = Calc.fillPct();
  const total = Calc.allStars();
  const stage = $('#jarStage');

  // jar body geometry
  const W = 300, H = 342;
  const top = 74, bottom = 300;          // inner fill band
  const fillY = bottom - (bottom - top) * pct;

  // deterministic star positions inside the jar
  const stars = [];
  let seed = 7;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  const slots = Math.round(pct * 26);
  for (let i = 0; i < slots; i++) {
    const x = 78 + rnd() * 144;
    const y = fillY + 12 + rnd() * Math.max(6, bottom - fillY - 22);
    const r = 8 + rnd() * 7;
    const c = JAR_COLORS[i % JAR_COLORS.length];
    stars.push(`<g class="jar__star" style="opacity:${Math.min(1, (bottom - y) / 34 + .45)}">
      <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(r + 4).toFixed(1)}" fill="${c}" opacity=".28"/>
      <path transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${(r / 12).toFixed(3)})"
            d="M12 1.6l3.4 7.4 8 1-5.9 5.5 1.5 8L12 19.4 5 23.5l1.5-8L.6 10l8-1z" fill="${c}"
            stroke="rgba(70,58,82,.34)" stroke-width="1.1" stroke-linejoin="round"/>
    </g>`);
  }

  // bubbles
  const bubbles = pct > 0.05 ? Array.from({ length: 5 }, (_, i) => {
    const bx = 92 + ((i * 41) % 118);
    const by = bottom - 12 - ((i * 27) % Math.max(20, (bottom - fillY)));
    return `<circle class="jar__bubble" cx="${bx}" cy="${by}" r="${3 + (i % 3)}" fill="#fff" opacity=".5"
             style="animation-delay:${i * 0.5}s"/>`;
  }).join('') : '';

  stage.innerHTML = `
  <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Star jar ${Math.round(pct * 100)} percent full">
    <defs>
      <clipPath id="jarInner">
        <path d="M62 74 Q60 60 74 56 L226 56 Q240 60 238 74 L238 246 Q238 292 196 296 L104 296 Q62 292 62 246 Z"/>
      </clipPath>
      <linearGradient id="liquidGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--butter-200)"/>
        <stop offset="55%" stop-color="var(--pink-200)"/>
        <stop offset="100%" stop-color="var(--lilac-200)"/>
      </linearGradient>
      <linearGradient id="glassSheen" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#fff" stop-opacity=".62"/>
        <stop offset="38%" stop-color="#fff" stop-opacity=".12"/>
        <stop offset="100%" stop-color="#fff" stop-opacity=".38"/>
      </linearGradient>
    </defs>

    <!-- glass body -->
    <path d="M62 74 Q60 60 74 56 L226 56 Q240 60 238 74 L238 246 Q238 292 196 296 L104 296 Q62 292 62 246 Z"
          fill="url(#glassSheen)" stroke="var(--ink)" stroke-width="4.5" stroke-linejoin="round"/>

    <g clip-path="url(#jarInner)">
      ${pct > 0 ? `<g class="jar__liquid" style="transform:translateY(0)">
          <rect x="58" y="${fillY.toFixed(1)}" width="184" height="${(bottom - fillY + 14).toFixed(1)}" fill="url(#liquidGrad)" opacity=".82"/>
          <ellipse cx="150" cy="${fillY.toFixed(1)}" rx="92" ry="11" fill="var(--butter-200)" opacity=".95"/>
        </g>` : ''}
      ${bubbles}
      ${stars.join('')}
    </g>

    <!-- lid -->
    <rect x="66" y="24" width="168" height="38" rx="14" fill="var(--peach-200)" stroke="var(--ink)" stroke-width="4.5"/>
    <rect x="80" y="34" width="140" height="9" rx="4.5" fill="#fff" opacity=".42"/>
    <path d="M132 62h36v10a18 18 0 0 1-36 0z" fill="var(--lilac-200)" stroke="var(--ink)" stroke-width="4"/>
    <path d="M150 64c-5-8-16-8-16-1s11 9 16 13c5-4 16-8 16-13s-11-7-16 1z"
          fill="var(--pink-200)" stroke="var(--ink)" stroke-width="3" stroke-linejoin="round"/>

    <!-- shine -->
    <path d="M84 96 Q78 180 84 250" stroke="#fff" stroke-width="9" stroke-linecap="round" fill="none" opacity=".5"/>
  </svg>
  <span class="jar-pct" id="jarPct">${Math.round(pct * 100)}%</span>`;

  $('#jarMsg').textContent = Calc.message();
  $('#jarChip').textContent = `${Math.round(pct * 100)}% full`;
  const bal = Calc.balance();
  const spent = Calc.spentStars();
  // "In the jar" is the live, spendable balance — it really drops after a prize.
  $('#jTotal').textContent = bal;
  $('#jTotalSub').textContent = spent ? `${spent}★ traded for prizes` : 'ready to spend';
  $('#jGoal').textContent = Store.state.profile.goal;
  // "Earned all time" keeps the full history so progress is never forgotten.
  $('#jBalance').textContent = total;
  $('#jBalanceSub').textContent = spent ? `${spent}★ already spent` : 'before any prizes';
  $('#jDays').textContent = Calc.totalCheckIns();
  $('#rewardText').textContent = Store.state.profile.reward || '—';

  // Spend legend under the jar, shown only once something has been redeemed.
  const legend = $('#jarLegend');
  if (legend) {
    legend.hidden = spent <= 0;
    if (spent > 0) {
      legend.innerHTML = `<span class="jar-legend__swatch"></span>
        <span><strong>${spent}★</strong> have been traded for prizes, so the jar now holds
        <strong>${bal}★</strong> of the <strong>${total}★</strong> earned all time.
        Every trade is listed under <em>Stars I've spent</em> — and it can be undone there.</span>`;
    }
  }
}

/* ============================================================
   PRIZES  ·  redeem deducts stars via the redemption ledger
   ============================================================ */
function renderPrizes() {
  const bal = Calc.balance();
  const box = $('#prizeList');
  $('#prizeBalChip').textContent = `${bal} to spend`;

  if (!Store.state.prizes.length) {
    box.innerHTML = `<div class="empty"><div class="empty__ico">🎁</div><p>No prizes yet — add one below.</p></div>`;
    renderRedemptions();
    return;
  }

  box.innerHTML = Store.state.prizes.map((p, i) => {
    const affordable = bal >= p.cost;
    const pctv = Math.min(100, (bal / Math.max(1, p.cost)) * 100);
    const short = Math.max(0, p.cost - bal);
    const times = Calc.redemptionsFor(p.id).length;
    const spentOn = times * p.cost;
    const open = Calc.canRedeemAgain(p);

    return `<div class="prize ${affordable && open ? 'prize--afford' : ''} ${!open ? 'prize--claimed' : ''}"
                 style="animation-delay:${Math.min(i * 40, 320)}ms" data-id="${p.id}">
      <div class="prize__ico">${p.icon || '🎁'}</div>
      <div class="prize__body">
        <div class="prize__name">
          ${escapeHtml(p.name)}
          ${p.repeatable ? '<span class="chip chip--sky" style="margin-left:6px">repeatable</span>'
            : !open ? '<span class="chip chip--mint" style="margin-left:6px">redeemed</span>' : ''}
        </div>
        <div class="prize__meta">${prizeMeta(p, affordable, short, bal, times, spentOn)}</div>
        <div class="prize__bar"><div class="prize__fill" style="width:${pctv}%"></div></div>
      </div>
      <div class="prize__cost">
        <svg style="fill:var(--butter-500)"><use href="#i-star"/></svg>${p.cost}
      </div>
      <div class="prize__acts">
        <button class="btn btn--sm ${affordable && open ? 'btn--mint' : ''}" data-pact="claim" data-id="${p.id}"
                ${!open ? 'disabled' : ''}>${!open ? 'Redeemed' : affordable ? 'Redeem' : 'Save up'}</button>
        <button class="iconbtn" data-pact="edit" data-id="${p.id}" aria-label="Edit ${escapeHtml(p.name)}">
          <svg viewBox="0 0 24 24"><use href="#i-edit"/></svg>
        </button>
        <button class="iconbtn" data-pact="del" data-id="${p.id}" aria-label="Delete ${escapeHtml(p.name)}">
          <svg viewBox="0 0 24 24"><use href="#i-trash"/></svg>
        </button>
      </div>
    </div>`;
  }).join('');

  renderRedemptions();
}

function prizeMeta(p, affordable, short, bal, times, spentOn) {
  const last = times ? Calc.redemptionsFor(p.id)[0] : null;
  // Show how much has already gone on this prize, and how many times, so a
  // repeatable prize is never mistaken for a finished one.
  const history = times
    ? ` · ${spentOn}★ spent${p.repeatable ? ` (${times}×)` : ''}`
    : '';
  if (!Calc.canRedeemAgain(p)) return `Redeemed ${prettyDate(last.date)}${history}`;
  if (affordable) return `You can get this! ${bal - p.cost}★ left after${history}`;
  return `${short} more star${short === 1 ? '' : 's'} to go${history}`;
}

/* ---------- Redemption history ---------- */
function renderRedemptions() {
  const log = Calc.redemptionLog();
  const box = $('#redeemList');
  const chip = $('#spentChip');
  const spent = Calc.spentStars();
  if (chip) chip.textContent = `${spent}★ spent`;

  if (!log.length) {
    box.innerHTML = `<p style="font-size:.86rem;color:var(--ink-soft);font-weight:600">
      Nothing redeemed yet. When a prize is claimed, the stars come out of your jar here.</p>`;
    return;
  }
  box.innerHTML = log.map((r) => `
    <div class="redeem" data-rid="${r.id}">
      <span class="redeem__ico">${r.icon || '🎁'}</span>
      <span class="redeem__body">
        <span class="redeem__name">${escapeHtml(r.name)}</span>
        <span class="redeem__date">${prettyDate(r.date)}</span>
      </span>
      <span class="redeem__cost">
        <svg style="fill:var(--pink-500)"><use href="#i-star"/></svg>−${r.cost}
      </span>
      <button class="iconbtn" data-pact="undo" data-rid="${r.id}"
              aria-label="Undo redemption of ${escapeHtml(r.name)}">
        <svg viewBox="0 0 24 24"><use href="#i-left"/></svg>
      </button>
    </div>`).join('');
}

/* ---------- Redeem / undo ---------- */
$('#prizeList').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-pact]');
  if (!btn) return;
  const { pact, id } = btn.dataset;
  const p = Store.state.prizes.find((x) => x.id === id);
  if (!p) return;

  if (pact === 'claim') doRedeem(p);
  if (pact === 'edit') startEditPrize(p);
  if (pact === 'del') confirmDeletePrize(p);
});

$('#redeemList').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-pact="undo"]');
  if (!btn) return;
  const rid = btn.dataset.rid;
  const r = (Store.state.redemptions || []).find((x) => x.id === rid);
  if (!r) return;
  openModal({
    title: 'Give the stars back?',
    sub: `"${r.name}" will go back on the shelf and ${r.cost}★ will return to your jar.`,
    body: '',
    actions: [
      { label: 'Keep it spent' },
      {
        label: `Return ${r.cost}★`, cls: 'btn--mint', fn: () => {
          Store.state.redemptions = Store.state.redemptions.filter((x) => x.id !== rid);
          Log.append('prize.undo', { label: r.name, stars: r.cost, note: r.icon });
          Store.save();
          flyStars($('#starpill'), 4);
          toast(`${r.cost}★ returned to your jar`, 'star');
          renderAll();
        },
      },
    ],
  });
});

function doRedeem(p) {
  const bal = Calc.balance();
  if (!Calc.canRedeemAgain(p)) return;
  if (bal < p.cost) {
    toast(`You need ${p.cost - bal} more star${p.cost - bal === 1 ? '' : 's'} for that one. Keep going!`);
    return;
  }
  openModal({
    title: 'Redeem this prize?',
    sub: `${p.cost}★ will come out of your jar right now.`,
    body: `<div class="redeem-preview">
             <span class="redeem-preview__ico">${p.icon || '🎁'}</span>
             <span class="redeem-preview__name">${escapeHtml(p.name)}</span>
             <span class="redeem-preview__row">
               <span>Stars to spend</span><strong class="n">−${p.cost}</strong>
             </span>
             <span class="redeem-preview__row">
               <span>Left in the jar after</span><strong class="n">${bal - p.cost}</strong>
             </span>
             <span class="redeem-preview__note">The stars really leave the jar — the total drops to what is actually left. The trade is recorded under Stars I've spent, where it can be undone.</span>
           </div>`,
    actions: [
      { label: 'Not yet' },
      {
        label: `Redeem for ${p.cost}★`, cls: 'btn--mint', fn: () => {
          const entry = {
            id: 'r' + Date.now().toString(36) + Math.floor(Math.random() * 90 + 10),
            prizeId: p.id,
            name: p.name,
            icon: p.icon || '🎁',
            cost: Number(p.cost) || 0,
            date: UI.cursor <= todayISO() ? UI.cursor : todayISO(),
          };
          Store.state.redemptions = Store.state.redemptions || [];
          Store.state.redemptions.push(entry);
          Log.append('prize.redeem', { label: p.name, stars: p.cost, note: p.icon });
          Store.save();
          flyStars($('#starpill'), 5);
          toast(`🎉 ${p.name} — ${p.cost}★ spent!`, 'star');
          renderAll();
        },
      },
    ],
  });
}

function startEditPrize(p) {
  UI.editingPrize = p.id;
  $('#pfIcon').value = p.icon || '🎁';
  $('#pfName').value = p.name;
  $('#pfCost').value = p.cost;
  $('#pfRepeat').checked = !!p.repeatable;
  $('#pfSubmit').textContent = 'Save changes';
  $('#pfSubmit').classList.remove('btn--mint');
  $('#pfSubmit').classList.add('btn--primary');
  $('#pfCancel').hidden = false;
  $('#pfName').focus();
}

function confirmDeletePrize(p) {
  const times = Calc.redemptionsFor(p.id).length;
  openModal({
    title: 'Delete this prize?',
    sub: `"${p.name}" will be removed from the shop.`
      + (times ? ` Its ${times} redemption${times === 1 ? '' : 's'} will stay in your history.` : ''),
    body: '',
    actions: [
      { label: 'Keep it' },
      {
        label: 'Delete', cls: 'btn--danger', fn: () => {
          Store.state.prizes = Store.state.prizes.filter((x) => x.id !== p.id);
          Log.append('prize.delete', { label: p.name, stars: p.cost, note: p.icon });
          Store.save(); toast('Prize deleted'); renderAll();
        },
      },
    ],
  });
}

$('#prizeForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const icon = ($('#pfIcon').value || '🎁').trim().slice(0, 4);
  const name = $('#pfName').value.trim();
  const cost = Math.max(1, Math.min(500, Number($('#pfCost').value) || 1));
  const repeatable = $('#pfRepeat').checked;
  if (!name) return;

  if (UI.editingPrize) {
    const p = Store.state.prizes.find((x) => x.id === UI.editingPrize);
    if (p) Object.assign(p, { icon, name, cost, repeatable });
    Log.append('prize.edit', { label: name, stars: cost, note: icon });
    toast('Prize updated');
  } else {
    Store.state.prizes.push({
      id: 'p' + Date.now().toString(36), icon, name, cost, repeatable,
    });
    Log.append('prize.add', { label: name, stars: cost, note: icon });
    toast('Prize added to the shop');
  }
  resetPrizeForm();
  Store.save(); renderAll();
});
function resetPrizeForm() {
  UI.editingPrize = null;
  $('#prizeForm').reset();
  $('#pfIcon').value = '🎁';
  $('#pfCost').value = '10';
  $('#pfRepeat').checked = false;
  $('#pfSubmit').textContent = 'Add prize';
  $('#pfSubmit').classList.add('btn--mint');
  $('#pfSubmit').classList.remove('btn--primary');
  $('#pfCancel').hidden = true;
}
$('#pfCancel').onclick = resetPrizeForm;

/* ============================================================
   CALENDAR
   ============================================================ */
function renderCalendar() {
  const cm = UI.calMonth;
  $('#calTitle').textContent = `${MON[cm.m]} ${cm.y}`;

  const first = new Date(cm.y, cm.m, 1);
  const startDow = (first.getDay() + 6) % 7;          // Monday-first
  const daysInMonth = new Date(cm.y, cm.m + 1, 0).getDate();
  const t = todayISO();
  const cells = [];

  // leading blanks from the previous month
  const prevDays = new Date(cm.y, cm.m, 0).getDate();
  for (let i = startDow - 1; i >= 0; i--) {
    const d = new Date(cm.y, cm.m - 1, prevDays - i);
    cells.push({ d, out: true });
  }
  for (let i = 1; i <= daysInMonth; i++) cells.push({ d: new Date(cm.y, cm.m, i), out: false });
  // trailing blanks
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1].d;
    cells.push({ d: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1), out: true });
  }

  const maxStars = Math.max(
    ...Object.keys(Store.state.days).map((k) => Calc.dayStars(k)), 1
  );

  $('#calGrid').innerHTML = cells.map(({ d, out }) => {
    const key = iso(d);
    const stars = out ? 0 : Calc.dayStars(key);
    const rec = Store.state.days[key];
    const mood = rec && rec.mood ? rec.mood : '';
    const intensity = stars > 0;
    const busy = stars >= 8;
    const cls = [
      'cal__cell',
      out ? 'cal__cell--out' : '',
      key === t ? 'cal__cell--today' : '',
      busy ? 'cal__cell--full' : intensity ? 'cal__cell--has' : '',
      key === UI.cursor ? 'cal__cell--sel' : '',
    ].filter(Boolean).join(' ');
    const dots = stars > 0
      ? `<span class="cal__dot">${Array.from({ length: Math.min(3, Math.ceil(stars / Math.max(1, maxStars / 3))) },
          () => `<svg style="fill:var(--butter-600)"><use href="#i-star"/></svg>`).join('')}</span>`
      : '';
    return `<button class="${cls}" ${out ? 'disabled' : ''} data-cdate="${key}"
              aria-label="${longDate(key)}, ${stars} stars${mood ? ', mood ' + mood : ''}">
      ${d.getDate()}
      ${mood ? `<span class="cal__mood">${mood}</span>` : dots}
    </button>`;
  }).join('');
}

$('#calGrid').addEventListener('click', (e) => {
  const b = e.target.closest('[data-cdate]');
  if (!b || b.disabled) return;
  UI.cursor = b.dataset.cdate;
  // jump to the daily view for that exact day
  switchTab('daily');
  toast(`Showing ${longDate(UI.cursor)} — ${Calc.dayStars(UI.cursor)} star${Calc.dayStars(UI.cursor) === 1 ? '' : 's'}`);
});

/* The calendar never leaves the DATE_MIN..DATE_MAX window:
   October 2026 is the first page, December 2099 the last. */
const CAL_MIN = { y: Number(DATE_MIN.slice(0, 4)), m: Number(DATE_MIN.slice(5, 7)) - 1 };
const CAL_MAX = { y: Number(DATE_MAX.slice(0, 4)), m: Number(DATE_MAX.slice(5, 7)) - 1 };
$('#calPrev').onclick = () => {
  if (UI.calMonth.y === CAL_MIN.y && UI.calMonth.m === CAL_MIN.m) return;
  const m = UI.calMonth.m - 1;
  UI.calMonth = m < 0 ? { y: UI.calMonth.y - 1, m: 11 } : { y: UI.calMonth.y, m };
  renderCalendar();
};
$('#calNext').onclick = () => {
  if (UI.calMonth.y === CAL_MAX.y && UI.calMonth.m === CAL_MAX.m) return;
  const m = UI.calMonth.m + 1;
  UI.calMonth = m > 11 ? { y: UI.calMonth.y + 1, m: 0 } : { y: UI.calMonth.y, m };
  renderCalendar();
};
$('#calToday').onclick = () => {
  const n = new Date();
  UI.calMonth = { y: n.getFullYear(), m: n.getMonth() };
  renderCalendar();
};
$('#btnGoCalendar').onclick = () => switchTab('jar');

/* ============================================================
   TREND CHARTS (jar view)
   ============================================================ */
function renderTrends() {
  const series = Calc.activeSeries(14);
  const max = Math.max(...series.map((s) => s.stars), 1);
  $('#trendBars').innerHTML = series.map((s) => {
    const dd = parseISO(s.date);
    const h = s.stars > 0 ? Math.max(5, (s.stars / max) * 100) : 3;
    return `<button class="bar" data-date="${s.date}" title="${longDate(s.date)}: ${s.stars} stars">
      <span class="bar__v">${s.stars || ''}</span>
      <span class="bar__track"><span class="bar__fill ${s.stars ? '' : 'bar__fill--zero'}" style="height:${h}%"></span></span>
      <span class="bar__l">${dd.getDate()}</span>
    </button>`;
  }).join('');

  // per-task totals
  const totals = Store.state.tasks.map((t) => ({
    t,
    n: Object.values(Store.state.days).reduce((s, d) => s + ((d.ticks || []).includes(t.id) ? 1 : 0), 0) * t.stars,
  })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 8);

  const tmax = Math.max(...totals.map((x) => x.n), 1);
  $('#taskBars').innerHTML = totals.length ? totals.map((x) => `
    <div class="bar" title="${escapeHtml(x.t.name)}: ${x.n} stars">
      <span class="bar__v">${x.n}</span>
      <span class="bar__track"><span class="bar__fill" style="height:${Math.max(6, (x.n / tmax) * 100)}%"></span></span>
      <span class="bar__l">${x.t.icon}</span>
    </div>`).join('') : `<div class="empty" style="grid-column:1/-1"><div class="empty__ico">📊</div><p>Tick a few tasks and the chart fills in.</p></div>`;
}

$('#trendBars').addEventListener('click', (e) => {
  const b = e.target.closest('[data-date]');
  if (b) { UI.cursor = b.dataset.date; switchTab('daily'); }
});

/* ============================================================
   REWARD INLINE EDIT
   ============================================================ */
const rewardInput = $('#rewardInput');
rewardInput.addEventListener('input', () => {
  Store.state.profile.reward = rewardInput.value;
  Store.save();
  $('#rewardText').textContent = rewardInput.value || '—';
});
function syncReward() { if (document.activeElement !== rewardInput) rewardInput.value = Store.state.profile.reward; }

/* Keep an open picker showing the day currently in view. */
function syncPickers() {
  [dailyPickerOpen ? $('#datepickDaily') : null,
   calPickerOpen ? $('#datepickCal') : null].forEach((box) => {
    if (!box) return;
    const d = parseISO(UI.cursor);
    const yS = $('[data-dp="y"]', box), mS = $('[data-dp="m"]', box);
    if (!yS || !mS) return;
    const y = d.getFullYear(), m = d.getMonth();
    if (Number(yS.value) !== y) {
      yS.value = String(y);
      fillMonthOptions(box, y, m);
    }
    if (Number(mS.value) !== m) mS.value = String(m);
    const key = `${y}-${m}`;
    if (box.dataset.dpym !== key) {
      rebuildDayOptions(box, y, m, d.getDate());
      box.dataset.dpym = key;
    } else {
      const dS = $('[data-dp="d"]', box);
      if (dS && Number(dS.value) !== d.getDate()) dS.value = String(d.getDate());
    }
  });
}

/* Month changes can shorten the day list (Jan 31 → Feb 28); rebuild it. */
function rebuildDayOptions(box, y, m, keepDay) {
  const dS = $('[data-dp="d"]', box);
  if (!dS) return;
  const max = daysInMonth(y, m);
  dS.innerHTML = Array.from({ length: max }, (_, i) => i + 1)
    .map((v) => `<option value="${v}">${v}</option>`).join('');
  dS.value = String(Math.min(keepDay, max));
}

/* ============================================================
   TABS
   ============================================================ */
function switchTab(tab) {
  UI.tab = tab;
  // Keep the event log pointed at the day in view. switchTab paints directly
  // (it does not go through renderAll), so this must be set here too.
  Log.currentDate = UI.cursor;
  const isDaily = tab === 'daily';
  $('#tab-daily').setAttribute('aria-selected', String(isDaily));
  $('#tab-jar').setAttribute('aria-selected', String(!isDaily));
  $('#view-daily').hidden = !isDaily;
  $('#view-jar').hidden = isDaily;
  moveInk();
  // Always repaint the view we land on: the cursor can change while we are
  // away (e.g. clicking a calendar cell jumps to a day on the daily view).
  if (isDaily) {
    renderDateRail();
    renderTasks();
    renderMoods();
    renderBonus();
    renderProud();
    renderSummary();
    renderGoodAt();
    renderTimeline();
  } else {
    renderJar();
    renderPrizes();
    renderCalendar();
    renderTrends();
  }
}
$('#tab-daily').onclick = () => switchTab('daily');
$('#tab-jar').onclick = () => switchTab('jar');

function moveInk() {
  const active = $(`#tab-${UI.tab}`);
  const ink = $('#tabInk');
  const bar = active.parentElement.getBoundingClientRect();
  const r = active.getBoundingClientRect();
  ink.style.width = `${r.width}px`;
  ink.style.transform = `translateX(${r.left - bar.left - 6}px)`;
}
window.addEventListener('resize', moveInk);

/* ============================================================
   SETTINGS
   ============================================================ */
$('#btnSettings').onclick = () => {
  const p = Store.state.profile;
  openModal({
    title: 'Jar settings',
    sub: 'The grown-up numbers behind the jar.',
    body: `
      <div class="stack" style="gap:14px">
        <div class="field"><label for="sName">Who owns the jar</label>
          <input class="input" id="sName" maxlength="24" value="${escapeHtml(p.name)}"></div>
        <div class="field"><label for="sGoal">Stars needed to fill the jar</label>
          <input class="input input--stars" id="sGoal" type="number" min="5" max="999" value="${p.goal}"></div>
        <div class="field"><label for="sReward">Reward when it's full</label>
          <input class="input" id="sReward" maxlength="60" value="${escapeHtml(p.reward)}"></div>
        <div class="field"><label for="sCarry">Stars from earlier weeks</label>
          <input class="input input--stars" id="sCarry" type="number" min="0" max="9999" value="${p.carryOver}"></div>
        <p style="font-size:.8rem;color:var(--ink-soft);font-weight:600;background:var(--mint-50);border:2px solid var(--mint-200);border-radius:14px;padding:11px 14px">
          Stars come only from ticked tasks — there is no extra bonus just for
          showing up, and none for a full week. Whatever a task is worth is
          what she earns.
          <br><br>Redeeming a prize really spends the stars: they come out of the
          jar and the total drops to what is actually left. Every redemption is
          recorded under Stars I've spent and can be undone there.
        </p>

        <div>
          <h4 style="font-family:var(--f-display);font-weight:800;font-size:1.02rem;margin-bottom:8px">Where your data is saved</h4>
          <div class="storebox" id="storeStatus"></div>
          <div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:9px">
            <button class="btn btn--sm" data-store="save">Save to database now</button>
            <button class="btn btn--sm" data-store="restore">Restore from database</button>
            <button class="btn btn--sm btn--danger" data-store="wipe">Erase database copy</button>
          </div>
          <p style="font-size:.76rem;color:var(--ink-faint);font-weight:600;margin-top:8px">
            Everything is written to both places on every change. On start-up the newer copy wins,
            so clearing one store cannot lose your jar. Export/Export JSON below is a third,
            portable copy.
          </p>
        </div>
      </div>`,
    actions: [
      { label: 'Cancel' },
      {
        label: 'Save', cls: 'btn--primary', fn: () => {
          p.name = $('#sName').value.trim() || p.name;
          p.goal = Math.max(5, Math.min(999, Number($('#sGoal').value) || 60));
          p.reward = $('#sReward').value.trim();
          p.carryOver = Math.max(0, Number($('#sCarry').value) || 0);
          Log.append('settings.update', { label: p.name, stars: p.carryOver, note: `${p.goal}/${p.reward}` });
          document.title = `${p.name}'s Star Jar`;
          $('.brand__txt h1').textContent = `${p.name}'s Star Jar`;
          Store.save(); renderAll();
          toast('Settings saved');
        },
      },
    ],
  });
  paintStorage();
};

$('#modal').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-store]');
  if (!b) return;
  const act = b.dataset.store;
  if (act === 'save') {
    const ok = await DB.write(Store.state);
    paintStorage();
    toast(ok ? 'Saved to the database' : 'Database unavailable — kept in local storage');
  }
  if (act === 'restore') {
    const dbState = await DB.read();
    if (!dbState) { toast('No database copy found'); paintStorage(); return; }
    Store.state = migrateToV4(dbState);
    Store.save();
    $('#brand__txt h1').textContent = `${Store.state.profile.name}'s Star Jar`;
    document.title = `${Store.state.profile.name}'s Star Jar`;
    closeModal(); renderAll();
    toast('Restored from the database');
  }
  if (act === 'wipe') {
    await DB.clear();
    Store.save();
    paintStorage();
    toast('Database copy erased — local copy kept');
  }
});

/* ============================================================
   IMPORT / RESET   (export lives in the Export ▾ menus above)
   ============================================================ */
$('#btnCloudSetup').onclick = () => openCloudSettings();
$('#btnImport').onclick = () => $('#fileImport').click();
const btnImport2 = $('#btnImport2');
if (btnImport2) btnImport2.onclick = () => $('#fileImport').click();
$('#fileImport').onchange = (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    let parsed;
    try {
      parsed = JSON.parse(r.result);
      if (!parsed || !Array.isArray(parsed.tasks)) throw new Error('bad file');
    } catch (err) {
      toast('That file is not a star jar.');
      return;
    }
    const d = diffJars(Store.state, parsed);

    // Nothing new, or the file is this device's own jar — replacing is a no-op
    // at best and a wipe at worst, so say so plainly.
    if (d.empty) {
      openModal({
        title: 'This jar is already here',
        sub: 'Every task, day and event in this file is already on this device. Importing it would change nothing.',
        body: '',
        actions: [{ label: 'Close', cls: 'btn--primary' }],
      });
      return;
    }

    const rows = [
      ['Tasks added', d.tasks],
      ['Days added', d.days],
      ['Stars gained', d.gainedTicks],
      ['Events merged', d.events],
      ['Redemptions merged', d.redemptions],
      ['Prizes added', d.prizes],
    ].filter(([, v]) => v > 0);

    openModal({
      title: d.name ? `Merge ${d.name}'s jar?` : 'Merge this jar?',
      sub: 'Nothing already on this device is removed — stars, redemptions and notes are all kept.',
      body: `<div class="redeem-preview">
          <div class="redeem-preview__ico">🔀</div>
          <span class="redeem-preview__name">This file would add</span>
          ${rows.map(([k, v]) => `<span class="redeem-preview__row">
            <span>${k}</span><strong class="n">+${v}</strong></span>`).join('')}
          <span class="redeem-preview__row">
            <span>Stars in your jar now</span><strong class="n">${Calc.balance()}</strong></span>
          <span class="redeem-preview__note">Saved on the other device: ${
            d.savedAt ? new Date(d.savedAt).toLocaleString() : 'unknown date'}.</span>
        </div>`,
      actions: [
        {
          label: 'Replace mine instead', cls: 'btn--ghost', fn: () => {
            Store.state = parsed;
            Store.save();
            afterImport();
          },
        },
        {
          label: 'Merge', cls: 'btn--mint', fn: () => {
            Store.state = mergeJars(Store.state, parsed);
            Store.save();
            afterImport();
            toast('Merged — nothing was lost');
          },
        },
      ],
    });
  };
  r.readAsText(f);
};

function afterImport() {
  $('.brand__txt h1').textContent = `${Store.state.profile.name}'s Star Jar`;
  document.title = `${Store.state.profile.name}'s Star Jar`;
  renderAll();
}
$('#btnReset').onclick = () => {
  openModal({
    title: 'Reset to the demo jar?',
    sub: 'This puts back the sample Mon-Wed data from the spreadsheet and clears everything you added.',
    body: '',
    actions: [
      { label: 'Cancel' },
      {
        label: 'Reset everything', cls: 'btn--danger', fn: () => {
          Store.reset();
          $('.brand__txt h1').textContent = `${Store.state.profile.name}'s Star Jar`;
          document.title = `${Store.state.profile.name}'s Star Jar`;
          renderAll();
          toast('Back to the demo jar');
        },
      },
    ],
  });
};

/* ============================================================
   RENDER ALL + HEADER COUNTER
   ============================================================ */
function renderHeader() {
  const bal = Calc.balance();
  const spent = Calc.spentStars();
  const earned = Calc.allStars();
  const pill = $('#starTotal');
  pill.textContent = bal;
  // The pill shows the stars actually in the jar right now — redeeming a
  // prize makes this number drop for real. The tooltip keeps the full story.
  const el = $('#starpill');
  if (el) {
    el.title = `${bal} stars in the jar right now`
      + (spent ? `\n${spent}★ traded for prizes\n${earned}★ earned all time` : '\nEvery star earned so far')
      + '\n\nStars come only from ticked tasks. There is no extra bonus for'
      + ' showing up or for a full week.';
  }
}

function renderAll() {
  // Events are stamped with the day in view, not today's date.
  Log.currentDate = UI.cursor;
  renderHeader();
  if (UI.tab === 'daily') {
    renderDateRail();
    renderTasks();
    renderMoods();
    renderBonus();
    renderProud();
    renderSummary();
    renderGoodAt();
    renderTimeline();
    if (typeof Cloud !== 'undefined') paintCloud();
  } else {
    renderJar();
    renderPrizes();
    renderCalendar();
    renderTrends();
  }
  syncReward();
  syncPickers();
  moveInk();
  paintStorage();
}

/* ============================================================
   STORAGE STATUS
   ============================================================ */
function storageRow(label, ok, detail) {
  return `<div class="store-row">
    <span class="store-dot ${ok ? 'is-ok' : 'is-off'}"></span>
    <span class="store-row__body">
      <span class="store-row__label">${label}</span>
      <span class="store-row__detail">${detail}</span>
    </span>
    <span class="chip ${ok ? 'chip--mint' : 'chip--butter'}">${ok ? 'active' : 'off'}</span>
  </div>`;
}

function paintStorage() {
  const box = $('#storeStatus');
  if (!box) return;
  let localBytes = 0;
  let localOK = false;
  try {
    const raw = localStorage.getItem(STORE_KEY);
    localBytes = raw ? raw.length : 0;
    localOK = !!raw;
  } catch (e) { /* blocked origin */ }

  const saved = new Date(Number(Store.state.savedAt) || 0);
  const savedTxt = Store.state.savedAt
    ? saved.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : 'not saved yet';

  box.innerHTML =
    storageRow('Local browser storage', localOK,
      localOK ? `${(localBytes / 1024).toFixed(1)} KB · saved ${savedTxt}`
              : 'not available on this origin') +
    storageRow('Database (IndexedDB)', DB.ok,
      DB.ok ? `store "${DB.NAME}" · ${DB.lastWrite ? 'written ' + DB.lastWrite.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'ready'}`
            : `unavailable — ${DB.reason}. Open the page over http:// for database backup, or keep using local storage.`) +
    storageRow('Event log (append-only)', true,
      `${Log.count()} event${Log.count() === 1 ? '' : 's'} recorded · ${DB.eventCount || Log.count()} in the database · newest first, never rewritten`);
}

/* ---------- boot ---------- */
(function init() {
  Store.load();

  const n = new Date();
  UI.calMonth = { y: n.getFullYear(), m: n.getMonth() };

  const p = Store.state.profile;
  $('.brand__txt h1').textContent = `${p.name}'s Star Jar`;
  document.title = `${p.name}'s Star Jar`;

  switchTab('daily');
  renderAll();

  // keep "today" markers fresh if the page is left open past midnight
  setInterval(() => {
    if (UI._lastToday && UI._lastToday !== todayISO()) { UI.cursor = todayISO(); UI.calMonth = (() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; })(); renderAll(); }
    UI._lastToday = todayISO();
  }, 60000);
  UI._lastToday = todayISO();

  if (Store.state.seeded) {
    setTimeout(() => toast('Welcome back! Tap a task to start collecting ⭐'), 500);
  }

  // Second storage layer: open the database, reconcile the snapshot, then pull
  // the append-only event log back in. Runs after first paint so a slow
  // IndexedDB never blocks the UI.
  DB.open().then(async () => {
    if (!DB.ok) { paintStorage(); return; }
    try {
      const res = await Store.reconcile();
      const ev = await Store.mergeEvents();
      if (res === 'restored' || ev.added > 0) {
        $('.brand__txt h1').textContent = `${Store.state.profile.name}'s Star Jar`;
        document.title = `${Store.state.profile.name}'s Star Jar`;
        renderAll();
        if (ev.added > 0) toast(`Recovered ${ev.added} logged event${ev.added === 1 ? '' : 's'} from the database 🧾`);
      }
    } catch (e) {
      console.warn('Database reconcile failed.', e);
    }
    paintStorage();
  });
})();

/* ============================================================
   CLOUD SYNC — strictly optional.
   The app is fully usable without it: this only loads a script and, if the
   user is signed in, quietly pushes/pulls in the background.
   ============================================================ */
if (typeof Supa !== 'undefined' && typeof Cloud !== 'undefined') {
  // Supabase first when the user has connected one; the built-in cloud stays
  // as a fallback in case its credential is restored.
  Supa.init().catch(() => {});
  Cloud.init().catch(() => { Cloud.sdkState = 'unavailable'; paintCloud(); });

  const localSave = Store.save.bind(Store);
  Store.save = function () {
    localSave();
    const P = syncProvider();
    if (P) P.queue();
  };
}

/* ---------- util ---------- */
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ============================================================
   PWA — offline shell + install prompt
   Registered only on http(s): a service worker is meaningless (and throws)
   on file://, where the user simply opens the folder directly.
   ============================================================ */
const PWA = {
  deferred: null,
  register() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return;

    /* A deploy used to leave an open page half-updated: navigation is
       network-first, so it pulls the NEW index.html, while the subresources
       (app.js, styles.css) come from the OLD worker's cache — new markup then
       runs against old JS and throws. The new worker already calls
       skipWaiting() and clients.claim(), so it takes over at once; reloading
       when that takeover happens turns the mixed state into a clean one.
       Only reload for a REAL update: on the very first visit there is no
       controller yet, and reloading there would loop. updateViaCache:'none'
       makes the update check itself skip the HTTP cache, so a fresh deploy is
       found promptly instead of sitting behind the CDN's max-age. */
    let hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) { hadController = true; return; }
      location.reload();
    });

    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
      .catch((e) => console.warn('Service worker registration failed.', e));
  },

  /* `beforeinstallprompt` is CHROMIUM-ONLY. Huawei Browser, HarmonyOS, most
     Chinese Android browsers and iOS Safari never fire it, so it can only ever
     be an optimisation — never the gate for showing the button. */
  watchInstall() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferred = e;
      this.paint();
    });
    window.addEventListener('appinstalled', () => {
      this.deferred = null;
      this.installed = true;
      this.paint();
      toast('Star Jar added to your home screen 🎉');
    });
  },

  async prompt() {
    if (!this.deferred) return false;
    this.deferred.prompt();
    const { outcome } = await this.deferred.userChoice;
    this.deferred = null;
    this.paint();
    return outcome === 'accepted';
  },

  installed: isStandalone(),

  /* Always offer a way in. The button is hidden only once the app is actually
     running installed; otherwise it is a one-tap install when the browser
     supports it and a short how-to otherwise. */
  paint() {
    const b = $('#btnInstall');
    if (!b) return;
    this.installed = this.installed || isStandalone();
    b.hidden = this.installed;
    if (this.installed) return;
    const label = this.deferred ? 'Install' : 'Add to Home Screen';
    const glyph = this.deferred
      ? '<path d="M12 3v12M8 11l4 4 4-4M5 20h14"/>'
      : '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 12h8M12 8v8"/>';
    b.innerHTML = `<svg viewBox="0 0 24 24" style="width:17px;height:17px;stroke:currentColor;stroke-width:2;fill:none;stroke-linecap:round;stroke-linejoin:round">${glyph}</svg> ${label}`;
  },

  /* The exact menu path differs per browser; getting this wrong is why people
     think the app "can't be installed". */
  howTo() {
    const ios = isIOS();
    const huawei = isHuawei();
    const rows = ios
      ? [['Open in Safari', 'This page must be Safari — WeChat and other in-app browsers cannot install.'],
         ['Tap the Share button', 'The square with an up arrow, at the bottom of the screen.'],
         ['Choose "Add to Home Screen"', 'Scroll down in the share sheet until you find it.'],
         ['Tap Add', 'A Star Jar icon appears on your home screen.']]
      : huawei
      ? [['Open in Huawei Browser', 'Tap the ⋮ menu (bottom-right or top-right).'],
         ['Choose "Add to Home Screen"', 'In Chinese builds it reads 「添加到主屏幕」.'],
         ['Confirm', 'A Star Jar icon appears on your home screen.']]
      : [['Open in Chrome', 'Tap the ⋮ menu at the top-right.'],
         ['Choose "Install app" or "Add to Home Screen"', 'If you see "Install app", tap it — that is the one-tap path.'],
         ['Confirm', 'A Star Jar icon appears on your home screen.']];

    return `<ol style="display:grid;gap:11px;padding-left:19px;font-weight:600;font-size:.9rem;line-height:1.5;color:var(--ink-soft)">
      ${rows.map(([h, d]) => `<li><strong style="color:var(--ink)">${h}</strong><br>${d}</li>`).join('')}
    </ol>
    <p style="margin-top:13px;font-size:.8rem;color:var(--ink-faint);font-weight:600;line-height:1.5">
      ${huaweiNote(huawei, ios)}
    </p>`;
  },
};

function huaweiNote(huawei, ios) {
  if (huawei) {
    return 'Your browser may not show our Install button — that is normal, the menu route above always works. '
      + 'Data already saved stays on this phone either way.';
  }
  if (ios) return 'The Install button is hidden on iOS by design; the Share route is the only way, and it is above.';
  return 'If no menu option appears, open the link in Chrome instead — some in-app browsers block installing.';
}

function isStandalone() {
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    navigator.standalone === true;
}
function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
/* Huawei Browser / EMUI / HarmonyOS. */
function isHuawei() {
  const ua = navigator.userAgent;
  return /HuaweiBrowser|HarmonyOS|Huawei|Honor|HUAWEI|HONOR/i.test(ua) ||
    /hbpc|hbq|HMSCore/.test(ua);
}

PWA.register();
PWA.watchInstall();
PWA.paint();
$('#btnInstall').onclick = async () => {
  if (PWA.installed) return;
  // One-tap where the browser supports it…
  if (PWA.deferred) {
    const ok = await PWA.prompt();
    if (ok) toast('Installing Star Jar…');
    return;
  }
  // …otherwise show the menu route for THIS browser.
  openModal({
    title: 'Add Star Jar to your home screen',
    sub: 'Then it opens like a real app — full screen, no browser bar, and it works offline.',
    body: PWA.howTo(),
    actions: [{ label: 'Got it', cls: 'btn--primary' }],
  });
};
