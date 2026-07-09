/* ================================================================
   Summer AoC 2026 — Leaderboard logic
   ================================================================
   HOW THIS WORKS
   This is a static page (no backend). It pulls two tabs straight out
   of your Google Sheet as CSV, using Google's own free CSV export —
   no API key, no third-party service, no sign-up.

   You only need to edit the CONFIG block below. Full walkthrough in
   README.md.
   ================================================================ */

const CONFIG = {
  // ---- Option A (simplest): paste your Sheet ID here. -----------
  // Found in the sheet's URL:
  // https://docs.google.com/spreadsheets/d/  >>THIS PART<<  /edit
  // Requires sharing set to "Anyone with the link – Viewer".
  SHEET_ID: 'PASTE_YOUR_GOOGLE_SHEET_ID_HERE',

  // ---- Option B (more reliable, recommended): paste direct CSV
  // links from File ▸ Share ▸ Publish to web ▸ select tab ▸ CSV.
  // If these are set, they're used instead of SHEET_ID above.
  PROBLEMS_CSV_URL: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSgyh7t54EoFIypVYPAcJT5lqXvA4M_Xkn5819HDzFeLt8v8pKErf8wXDkRqVX_0drxVDJIvUFR8q56/pub?gid=0&single=true&output=csv',
  TRACKER_CSV_URL: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSgyh7t54EoFIypVYPAcJT5lqXvA4M_Xkn5819HDzFeLt8v8pKErf8wXDkRqVX_0drxVDJIvUFR8q56/pub?gid=1440196694&single=true&output=csv',

  // Exact tab names as they appear on your sheet's tabs.
  PROBLEMS_SHEET_NAME: 'Cuttle problems',
  TRACKER_SHEET_NAME: 'Summer problem tracker',

  // Only rows in "Cuttle problems" tagged with this are shown.
  CONTEST_TAG: 'summer-aoc-2026',

  // Challenge shape: 8 weeks × 5 workdays. (Weekend rows, if any ever show
  // up in the tracker sheet, are filtered out automatically either way.)
  DAYS_PER_WEEK: 5,

  // How dates are written in the Tracker sheet's "Date" column (col D).
  // 'DMY'  -> 03/08/2026 means 3 August 2026 (default, NL-style)
  // 'MDY'  -> 03/08/2026 means March 8, 2026 (US-style)
  // 'ISO'  -> 2026-08-03 is handled automatically either way
  DATE_FORMAT: 'DMY',

  // Auto-refresh cadence.
  REFRESH_INTERVAL_MINUTES: 10,

  // Where students go to sign in and solve problems. Shown as a link
  // near the top of the page. Leave '' to hide it.
  CUTTLE_LOGIN_URL: 'https://informatica.cuttle.org/index.php?action=login',

  // Edit these by hand whenever the next office hour changes — this is
  // not pulled from the sheet, just plain config.
  OFFICE_HOURS: {
    when: 'Zaterdag 11 juli, 10:00-12:00',       // e.g. 'Thursday 3 July · 16:00–17:00 CET'
    note: '',                       // optional, e.g. a topic for the session
    link: 'https://meet.google.com/szj-groy-fpb',                       // meeting URL; leave '' to hide the button
  },

  // Problem statements live in a GitHub repo as
  // /<problem-slug>/statement_en.md and /<problem-slug>/statement_nl.md
  // Paste the repo's blob base URL here, e.g.
  // 'https://github.com/yourname/yourrepo/blob/main'
  // Leave '' to hide statement links entirely.
  STATEMENTS_REPO_BASE: '',
};

// How a problem name becomes the folder name used in the URL above.
// Default: lowercase, spaces/punctuation collapsed to single hyphens.
// Edit this if your repo's folder names don't follow that pattern.
function slugifyProblemName(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/* ================================================================
   State
   ================================================================ */
const state = {
  schedule: [],
  students: [],
  eligibleDays: 0,
  totalStudents: 0,
  loading: false,
};

/* ================================================================
   Boot
   ================================================================ */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('tag-name').textContent = CONFIG.CONTEST_TAG;
  applyStaticConfig();

  if (!isConfigured()) {
    document.getElementById('setup-banner').classList.remove('hidden');
    return;
  }

  document.getElementById('refresh-btn').addEventListener('click', () => loadData());
  document.getElementById('error-retry').addEventListener('click', () => loadData());
  document.getElementById('student-search').addEventListener('input', () => {
    renderLeaderboard();
  });
  document.getElementById('day-modal-backdrop').addEventListener('click', closeDayModal);
  document.getElementById('day-modal-close').addEventListener('click', closeDayModal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDayModal();
  });

  loadData();
  setInterval(loadData, Math.max(1, CONFIG.REFRESH_INTERVAL_MINUTES) * 60 * 1000);
});

function isConfigured() {
  if (CONFIG.PROBLEMS_CSV_URL && CONFIG.TRACKER_CSV_URL) return true;
  return !!CONFIG.SHEET_ID && CONFIG.SHEET_ID !== 'PASTE_YOUR_GOOGLE_SHEET_ID_HERE';
}

function applyStaticConfig() {
  const cuttleLink = document.getElementById('cuttle-link');
  if (cuttleLink) {
    if (CONFIG.CUTTLE_LOGIN_URL) {
      cuttleLink.href = CONFIG.CUTTLE_LOGIN_URL;
    } else {
      cuttleLink.classList.add('hidden');
    }
  }

  const whenEl = document.getElementById('office-datetime');
  const noteEl = document.getElementById('office-notes');
  const joinBtn = document.getElementById('office-join');

  if (whenEl) whenEl.textContent = CONFIG.OFFICE_HOURS.when || 'To be announced';
  if (noteEl) noteEl.textContent = CONFIG.OFFICE_HOURS.note || '';

  if (joinBtn) {
    if (CONFIG.OFFICE_HOURS.link) {
      joinBtn.href = CONFIG.OFFICE_HOURS.link;
      joinBtn.classList.remove('is-disabled');
    } else {
      joinBtn.href = '#';
      joinBtn.classList.add('is-disabled');
    }
  }
}

/* ================================================================
   Data loading
   ================================================================ */
function buildGvizUrl(sheetName) {
  return `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
}

function getProblemsUrl() {
  return CONFIG.PROBLEMS_CSV_URL || buildGvizUrl(CONFIG.PROBLEMS_SHEET_NAME);
}

function getTrackerUrl() {
  return CONFIG.TRACKER_CSV_URL || buildGvizUrl(CONFIG.TRACKER_SHEET_NAME);
}

async function fetchCSV(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Sheet request failed (HTTP ${res.status}). Check that the sheet is shared as "Anyone with the link – Viewer".`);
  }
  const text = await res.text();
  if (/^\s*<(!DOCTYPE|html)/i.test(text)) {
    throw new Error('Received a sign-in page instead of CSV data — the sheet probably isn\u2019t shared publicly yet.');
  }
  return text;
}

async function loadData() {
  if (state.loading) return;
  state.loading = true;
  setLoadingUI(true);
  hideError();

  try {
    const [problemsCSV, trackerCSV] = await Promise.all([
      fetchCSV(getProblemsUrl()),
      fetchCSV(getTrackerUrl()),
    ]);

    const problemsTable = parseCSV(problemsCSV);
    const trackerTable = parseCSV(trackerCSV);

    const schedule = buildSchedule(trackerTable);
    const { students, eligibleDays, totalStudents } = buildLeaderboardData(problemsTable, schedule);

    state.schedule = schedule;
    state.students = students;
    state.eligibleDays = eligibleDays;
    state.totalStudents = totalStudents;

    renderAll();
    setLastSynced();
  } catch (err) {
    console.error(err);
    showError(err.message || 'Something went wrong while loading the sheet.');
  } finally {
    state.loading = false;
    setLoadingUI(false);
  }
}

/* ================================================================
   CSV parsing (handles quoted fields, embedded commas/newlines)
   ================================================================ */
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') { inQuotes = true; }
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r') { /* ignore, \n handles the break */ }
    else { field += c; }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/* ================================================================
   Date parsing
   ================================================================ */
function parseDate(raw, format) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // ISO: 2026-08-03(...)
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);

  // Slash/dash separated: 03/08/2026 or 03-08-2026
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) {
    let a = +m[1], b = +m[2], y = +m[3];
    if (y < 100) y += 2000;
    const day = format === 'MDY' ? b : a;
    const month = format === 'MDY' ? a : b;
    return new Date(y, month - 1, day);
  }

  // Fallback: let the browser try ("August 3, 2026", "Aug 3 2026", ...)
  const d = new Date(s);
  if (!isNaN(d.getTime())) return new Date(d.getFullYear(), d.getMonth(), d.getDate());

  return null;
}

function todayMidnight() {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
}

function isPastOrToday(date) {
  return !!date && date.getTime() <= todayMidnight().getTime();
}

function isToday(date) {
  return !!date && date.getTime() === todayMidnight().getTime();
}

/* ================================================================
   Build schedule from "Summer problem tracker" (row 3 onward)
   col C(2)=Day, D(3)=Date, E(4)=Problem name
   ================================================================ */
function isWeekend(date, dayLabel) {
  if (date) {
    const dow = date.getDay(); // 0 = Sun ... 6 = Sat
    return dow === 0 || dow === 6;
  }
  if (dayLabel) {
    const d = dayLabel.trim().toLowerCase();
    return d.startsWith('sat') || d.startsWith('sun') || d.startsWith('za') || d.startsWith('zo');
  }
  return false;
}

function buildSchedule(trackerRows) {
  const schedule = [];
  for (let i = 2; i < trackerRows.length; i++) {
    const r = trackerRows[i] || [];
    const day = (r[2] || '').trim();
    const dateRaw = (r[3] || '').trim();
    const problemName = (r[4] || '').trim();
    const hint = (r[5] || '').trim();
    if (!day && !dateRaw && !problemName) continue;

    const date = parseDate(dateRaw, CONFIG.DATE_FORMAT);
    if (isWeekend(date, day)) continue; // calendar only shows workdays

    schedule.push({
      index: schedule.length,
      day,
      dateRaw,
      date,
      problemName,
      hint,
      isFuture: date ? !isPastOrToday(date) : true,
      isToday: date ? isToday(date) : false,
      solvedBy: [],
    });
  }
  return schedule;
}

/* ================================================================
   Build leaderboard + per-day solve data from "Cuttle problems"
   col A(0)=name, B(1)=tags, E(4)+ = students
   ================================================================ */
function buildLeaderboardData(problemsRows, schedule) {
  if (!problemsRows.length) return { students: [], eligibleDays: 0, totalStudents: 0 };

  const header = problemsRows[0];
  const studentCols = [];
  for (let c = 4; c < header.length; c++) {
    const name = (header[c] || '').trim();
    if (name) studentCols.push({ col: c, name });
  }

  const scheduleByName = new Map();
  schedule.forEach((s) => {
    if (s.problemName) scheduleByName.set(s.problemName.toLowerCase(), s);
  });

  const wantedTag = CONFIG.CONTEST_TAG.toLowerCase();

  for (let i = 1; i < problemsRows.length; i++) {
    const row = problemsRows[i];
    if (!row) continue;
    const name = (row[0] || '').trim();
    if (!name) continue;

    const tags = (row[1] || '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
    if (!tags.includes(wantedTag)) continue;

    const sched = scheduleByName.get(name.toLowerCase());
    if (!sched) continue; // not (yet) scheduled in the tracker sheet

    const solvedBy = [];
    studentCols.forEach(({ col, name: studentName }) => {
      const v = (row[col] || '').trim();
      if (v === '1') solvedBy.push(studentName);
    });
    sched.solvedBy = solvedBy;
  }

  const studentStats = studentCols.map(({ name }) => ({ name, solvedSet: new Set(), count: 0 }));
  const statByName = new Map(studentStats.map((s) => [s.name, s]));

  schedule.forEach((s) => {
    if (s.isFuture) return; // only count days up to and including today
    s.solvedBy.forEach((studentName) => {
      const stat = statByName.get(studentName);
      if (stat) {
        stat.solvedSet.add(s.index);
        stat.count += 1;
      }
    });
  });

  const eligibleDays = schedule.filter((s) => !s.isFuture).length;
  const maxIdx = schedule.length - 1;

  // Rank by solve count; tie-break by who completed the earliest
  // contested day first (a proxy for "first to solve" since the
  // sheet doesn't store solve timestamps).
  studentStats.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    for (let i = 0; i <= maxIdx; i++) {
      const ah = a.solvedSet.has(i);
      const bh = b.solvedSet.has(i);
      if (ah !== bh) return ah ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  return { students: studentStats, eligibleDays, totalStudents: studentCols.length };
}

/* ================================================================
   Rendering
   ================================================================ */
function renderAll() {
  // renderHeaderProgress();
  renderLeaderboard();
  renderCalendar();
}

// function renderHeaderProgress() {
//   const el = document.getElementById('brand-sub');
//   if (!el) return;
//   const total = state.schedule.length;
//   el.textContent = total
//     ? `Day ${state.eligibleDays} of ${total} · 8 weeks, 5 workdays`
//     : '8 weeks · 40 problems · one streak worth keeping';
// }

function renderLeaderboard() {
  const list = document.getElementById('leaderboard-list');
  const filterText = (document.getElementById('student-search').value || '').trim().toLowerCase();
  const total = state.schedule.length;

  list.innerHTML = '';

  if (!state.students.length) {
    const li = document.createElement('li');
    li.className = 'lb-empty';
    li.textContent = 'No students found in the sheet yet.';
    list.appendChild(li);
    return;
  }

  let shown = 0;
  state.students.forEach((s, idx) => {
    if (s.count === 0) return; // not "joined" the leaderboard yet
    if (filterText && !s.name.toLowerCase().includes(filterText)) return;
    shown++;

    const li = document.createElement('li');
    li.className = 'lb-row' + (idx < 3 ? ` lb-row--top lb-row--rank${idx + 1}` : '');

    const rank = document.createElement('span');
    rank.className = 'lb-rank';
    rank.textContent = String(idx + 1).padStart(2, '0');

    const name = document.createElement('span');
    name.className = 'lb-name';
    name.textContent = s.name;

    const dots = document.createElement('span');
    dots.className = 'lb-dots';
    for (let i = 0; i < total; i++) {
      const d = document.createElement('span');
      let dCls = 'lb-dot';
      if (s.solvedSet.has(i)) dCls += ' lb-dot--solved';
      else if (i < state.eligibleDays) dCls += ' lb-dot--missed';
      else dCls += ' lb-dot--future';
      d.className = dCls;
      dots.appendChild(d);
    }

    const count = document.createElement('span');
    count.className = 'lb-count';
    count.textContent = `${s.count}/${state.eligibleDays}`;

    li.append(rank, name, dots, count);
    list.appendChild(li);
  });

  if (!shown) {
    const li = document.createElement('li');
    li.className = 'lb-empty';
    li.textContent = filterText
      ? 'No matching students.'
      : 'Nobody has solved a problem yet — solve one to join the leaderboard.';
    list.appendChild(li);
  }
}

function renderCalendar() {
  const grid = document.getElementById('calendar-grid');
  grid.innerHTML = '';

  if (!state.schedule.length) {
    const empty = document.createElement('p');
    empty.className = 'lb-empty';
    empty.textContent = 'No problems scheduled yet in the tracker sheet.';
    grid.appendChild(empty);
    return;
  }

  state.schedule.forEach((s, i) => {
    const card = document.createElement('button');
    card.type = 'button';
    let cls = 'cal-card';
    if (s.isFuture) cls += ' cal-card--future';
    if (s.isToday) cls += ' cal-card--today';
    card.className = cls;

    const dayNum = document.createElement('span');
    dayNum.className = 'cal-daynum';
    dayNum.textContent = `Day ${i + 1}`;

    const dow = document.createElement('span');
    dow.className = 'cal-dow';
    dow.textContent = [s.day, s.dateRaw].filter(Boolean).join(' · ') || '\u2014';

    const title = document.createElement('span');
    title.className = 'cal-title';
    title.textContent = s.problemName || 'TBA';

    const stat = document.createElement('span');
    stat.className = 'cal-stat';
    stat.textContent = s.isFuture ? 'Upcoming' : `${s.solvedBy.length}/${state.totalStudents} solved`;

    card.append(dayNum, dow, title, stat);
    card.addEventListener('click', () => openDayModal(s, i));
    grid.appendChild(card);
  });
}

/* ================================================================
   Day detail modal
   ================================================================ */
function statementUrl(problemName, lang) {
  if (!CONFIG.STATEMENTS_REPO_BASE || !problemName) return null;
  const slug = slugifyProblemName(problemName);
  if (!slug) return null;
  const base = CONFIG.STATEMENTS_REPO_BASE.replace(/\/+$/, '');
  return `${base}/${slug}/statement_${lang}.md`;
}

function openDayModal(s, i) {
  const modal = document.getElementById('day-modal');
  document.getElementById('day-modal-eyebrow').textContent =
    `Day ${i + 1}${s.day ? ' · ' + s.day : ''}${s.dateRaw ? ' · ' + s.dateRaw : ''}`;
  document.getElementById('day-modal-title').textContent = s.problemName || 'No problem set yet';

  const linksEl = document.getElementById('day-modal-links');
  const hintEl = document.getElementById('day-modal-hint');
  const solversEl = document.getElementById('day-modal-solvers');
  linksEl.innerHTML = '';
  hintEl.innerHTML = '';
  solversEl.innerHTML = '';

  // Statement links and hints only once the problem has actually been
  // released (i.e. its day isn't in the future) — no spoilers early.
  if (!s.isFuture && s.problemName) {
    [['Statement (EN)', statementUrl(s.problemName, 'en')], ['Statement (NL)', statementUrl(s.problemName, 'nl')]]
      .forEach(([label, url]) => {
        if (!url) return;
        const a = document.createElement('a');
        a.className = 'modal-link-btn';
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = `${label} ↗`;
        linksEl.appendChild(a);
      });

    if (s.hint) {
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'hint-toggle';
      toggle.textContent = 'Show hint';
      const text = document.createElement('p');
      text.className = 'hint-text hidden';
      text.textContent = s.hint;
      toggle.addEventListener('click', () => {
        const nowHidden = text.classList.toggle('hidden');
        toggle.textContent = nowHidden ? 'Show hint' : 'Hide hint';
      });
      hintEl.append(toggle, text);
    }
  }

  if (s.isFuture) {
    document.getElementById('day-modal-meta').textContent = 'This day hasn\u2019t happened yet.';
  } else if (!s.solvedBy.length) {
    document.getElementById('day-modal-meta').textContent = `${state.totalStudents} students tracked \u00b7 nobody\u2019s solved this one yet.`;
  } else {
    document.getElementById('day-modal-meta').textContent =
      `${s.solvedBy.length} of ${state.totalStudents} students have solved this one:`;
    s.solvedBy.forEach((name) => {
      const chip = document.createElement('span');
      chip.className = 'solver-chip';
      chip.textContent = name;
      solversEl.appendChild(chip);
    });
  }

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
}

function closeDayModal() {
  const modal = document.getElementById('day-modal');
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
}

/* ================================================================
   UI helpers
   ================================================================ */
function setLoadingUI(loading) {
  const btn = document.getElementById('refresh-btn');
  btn.disabled = loading;
  btn.classList.toggle('is-loading', loading);
  if (loading) document.getElementById('last-synced').textContent = 'Syncing\u2026';
}

function setLastSynced() {
  const now = new Date();
  document.getElementById('last-synced').textContent =
    `Synced ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function showError(message) {
  document.getElementById('error-message').textContent = message;
  document.getElementById('error-banner').classList.remove('hidden');
}

function hideError() {
  document.getElementById('error-banner').classList.add('hidden');
}