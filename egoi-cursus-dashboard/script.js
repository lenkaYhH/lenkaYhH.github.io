/* =========================================================================
   CONFIG
   =========================================================================
   Sheet must be shared as "Anyone with the link can view" for this to work.
   To change the topic-tag passphrase: open a browser console anywhere and run
     crypto.subtle.digest('SHA-256', new TextEncoder().encode('yourPassword'))
       .then(b => console.log([...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')))
   then paste the resulting hex string into TOPIC_PASS_HASH below.
   Default passphrase is: cuttlefish
   ========================================================================= */
const SHEET_ID = '1oM7HCEAZUn6l9QXww-yAu_YV7F3L8hslClvK2cqEG0g';
const SHEET_CUTTLE = 'Cuttle problems';
const SHEET_NONCUTTLE = 'Non-cuttle problems';
const TOPIC_PASS_HASH = 'a85d555e38e6fe7a0e2201f6f1426d01d38c73c201066d27c42e7f9aea8fa59e';

function sheetCsvUrl(name){
  return 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/gviz/tq?tqx=out:csv&sheet=' + encodeURIComponent(name) + '&_=' + Date.now();
}

/* =========================================================================
   STATE
   ========================================================================= */
const state = {
  cuttle: { problems: [], students: [], topics: [], sources: [] },
  noncuttle: { problems: [], students: [], sources: [] },
  allStudents: [],
  filters: {
    cuttle: { search:'', students:new Set(), topics:new Set(), sources:new Set(), sort:'solved-desc' },
    noncuttle: { search:'', students:new Set(), sources:new Set(), sort:'solved-desc' },
    students: { search:'' }
  },
  topicsUnlocked: sessionStorage.getItem('topicsUnlocked') === '1',
  autoRefreshMs: 300000,
  autoTimer: null,
  lbScope: 'all',
  cuttleLbMode: 'hardest',
  ncLbMode: 'hardest'
};

/* =========================================================================
   UTIL
   ========================================================================= */
function parseTags(cell){
  if(!cell) return [];
  return String(cell).split(/[,;\n\/]+/).map(s=>s.trim()).filter(Boolean);
}
function isOne(v){ return String(v||'').trim() === '1'; }
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function uniqSorted(arr){
  const seen = new Map();
  arr.forEach(v => { const k = v.toLowerCase(); if(!seen.has(k)) seen.set(k, v); });
  return [...seen.values()].sort((a,b)=>a.localeCompare(b));
}
function timeAgo(d){
  const s = Math.floor((Date.now()-d)/1000);
  if(s<10) return 'just now';
  if(s<60) return s+'s ago';
  const m = Math.floor(s/60);
  if(m<60) return m+'m ago';
  const h = Math.floor(m/60);
  return h+'h ago';
}
function colorForRatio(r){
  if(r >= 0.66) return 'var(--ac)';
  if(r >= 0.33) return 'var(--tried)';
  return 'var(--noncuttle)';
}
function downloadCsv(filename, rows){
  const csv = rows.map(r => r.map(c => {
    const v = String(c==null?'':c);
    return /[",\n]/.test(v) ? '"' + v.replace(/"/g,'""') + '"' : v;
  }).join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  URL.revokeObjectURL(a.href);
}

/* =========================================================================
   DATA LOADING
   ========================================================================= */
function setSyncStatus(mode, text){
  const dot = document.getElementById('syncDot');
  dot.className = 'dot' + (mode === 'busy' ? ' busy' : mode === 'err' ? ' err' : '');
  document.getElementById('syncText').textContent = text;
}

function fetchSheet(name){
  return new Promise((resolve, reject) => {
    Papa.parse(sheetCsvUrl(name), {
      download: true,
      complete: res => {
        if(!res.data || !res.data.length) { reject(new Error('Empty sheet: ' + name)); return; }
        resolve(res.data);
      },
      error: err => reject(err)
    });
  });
}

function maxRowLen(rows){
  return rows.reduce((m,r)=>Math.max(m, r.length), 0);
}

function parseCuttle(rows){
  const header = rows[0] || [];
  const width = maxRowLen(rows);
  const students = [];
  for(let c = 4; c < width; c++){
    const nm = (header[c] || '').trim();
    if(nm) students.push({ name: nm, col: c });
  }
  const problems = [];
  const topicSet = [], sourceSet = [];
  for(let r = 1; r < rows.length; r++){
    const row = rows[r];
    if(!row || !row[0] || !String(row[0]).trim()) continue;
    const name = String(row[0]).trim();
    const source = parseTags(row[1]);
    const topics = parseTags(row[2]);
    source.forEach(s=>sourceSet.push(s));
    topics.forEach(t=>topicSet.push(t));
    const solves = {};
    let totalSolved = 0;
    students.forEach(s => {
      const v = isOne(row[s.col]);
      solves[s.name] = v;
      if(v) totalSolved++;
    });
    problems.push({ name, source, topics, solves, totalSolved });
  }
  return {
    problems, students,
    topics: uniqSorted(topicSet),
    sources: uniqSorted(sourceSet)
  };
}

function parseNonCuttle(rows){
  const header0 = rows[0] || [];
  const width = maxRowLen(rows);
  const students = [];
  for(let c = 2; c < width; c += 2){
    const left = (header0[c] || '').trim();
    const right = (header0[c+1] || '').trim();
    const nm = left || right;
    if(nm) students.push({ name: nm, triedCol: c, solvedCol: c+1 });
  }
  const problems = [];
  const sourceSet = [];
  for(let r = 2; r < rows.length; r++){
    const row = rows[r];
    if(!row || !row[0] || !String(row[0]).trim()) continue;
    const name = String(row[0]).trim();
    const source = parseTags(row[1]);
    source.forEach(s=>sourceSet.push(s));
    const status = {};
    let totalSolved = 0, totalTried = 0;
    students.forEach(s => {
      const tried = isOne(row[s.triedCol]);
      const solved = isOne(row[s.solvedCol]);
      status[s.name] = { tried, solved };
      if(solved) totalSolved++;
      if(tried || solved) totalTried++;
    });
    problems.push({ name, source, status, totalSolved, totalTried });
  }
  return { problems, students, sources: uniqSorted(sourceSet) };
}

async function loadAll(){
  setSyncStatus('busy', 'syncing\u2026');
  try{
    const [cuttleRows, ncRows] = await Promise.all([
      fetchSheet(SHEET_CUTTLE),
      fetchSheet(SHEET_NONCUTTLE)
    ]);
    state.cuttle = parseCuttle(cuttleRows);
    state.noncuttle = parseNonCuttle(ncRows);
    const names = new Set();
    state.cuttle.students.forEach(s=>names.add(s.name));
    state.noncuttle.students.forEach(s=>names.add(s.name));
    state.allStudents = uniqSorted([...names]);
    state.lastSync = Date.now();
    setSyncStatus('ok', 'synced ' + timeAgo(state.lastSync));
    renderAll();
  }catch(err){
    console.error(err);
    setSyncStatus('err', 'sync failed \u2014 check sheet is shared publicly');
  }
}

/* =========================================================================
   OVERVIEW TAB
   ========================================================================= */
function combinedStudentTotals(scope){
  const totals = {};
  state.allStudents.forEach(n => totals[n] = 0);
  if(scope !== 'noncuttle'){
    state.cuttle.problems.forEach(p => {
      state.cuttle.students.forEach(s => { if(p.solves[s.name]) totals[s.name] = (totals[s.name]||0) + 1; });
    });
  }
  if(scope !== 'cuttle'){
    state.noncuttle.problems.forEach(p => {
      state.noncuttle.students.forEach(s => { if(p.status[s.name] && p.status[s.name].solved) totals[s.name] = (totals[s.name]||0) + 1; });
    });
  }
  return totals;
}

function renderStatGrid(){
  const cuttleTotal = state.cuttle.problems.length;
  const ncTotal = state.noncuttle.problems.length;
  const totals = combinedStudentTotals('all');
  const studentCount = state.allStudents.length;
  const avgPct = cuttleTotal ? Math.round(
    state.cuttle.students.reduce((sum,s)=>{
      const solved = state.cuttle.problems.filter(p=>p.solves[s.name]).length;
      return sum + (solved / cuttleTotal);
    }, 0) / (state.cuttle.students.length || 1) * 100
  ) : 0;
  let topStudent = '\u2014', topVal = -1;
  Object.entries(totals).forEach(([n,v]) => { if(v > topVal){ topVal = v; topStudent = n; } });

  const cards = [
    { label:'Cuttle Problems', value: cuttleTotal, cls:'cuttle', sub: state.cuttle.students.length + ' students tracked' },
    { label:'Non-Cuttle Problems', value: ncTotal, cls:'noncuttle', sub: state.noncuttle.students.length + ' students tracked' },
    { label:'Total Students', value: studentCount, cls:'', sub:'across both sheets' },
    { label:'Avg. Cuttle Completion', value: avgPct + '%', cls:'', sub:'mean across students' },
    { label:'Top Solver', value: topStudent, cls:'', sub: (topVal<0?0:topVal) + ' problems solved' },
    { label:'Last Synced', value: timeAgo(state.lastSync), cls:'', sub: new Date(state.lastSync).toLocaleTimeString() }
  ];
  document.getElementById('statGrid').innerHTML = cards.map(c => `
    <div class="stat-card">
      <div class="label">${esc(c.label)}</div>
      <div class="value ${c.cls}">${esc(c.value)}</div>
      <div class="sub">${esc(c.sub)}</div>
    </div>`).join('');
}

function renderStudentLeaderboard(){
  const totals = combinedStudentTotals(state.lbScope);
  const maxCuttle = state.cuttle.problems.length + state.noncuttle.problems.length;
  const entries = Object.entries(totals).sort((a,b)=>b[1]-a[1]).filter(e=>state.allStudents.includes(e[0]));
  const max = Math.max(1, ...entries.map(e=>e[1]));
  document.getElementById('studentLeaderboard').innerHTML = entries.map(([name,val], i) => {
    const badge = i===0 ? '<span class="podium-badge g">1</span>' : i===1 ? '<span class="podium-badge s">2</span>' : i===2 ? '<span class="podium-badge b">3</span>' : `<span class="lb-rank">${i+1}</span>`;
    const pct = (val/max*100).toFixed(0);
    return `<li>${badge}<span class="lb-name">${esc(name)}</span>
      <span class="lb-bar-wrap"><span class="lb-bar" style="width:${pct}%; background:${colorForRatio(val/max)}"></span></span>
      <span class="lb-count">${val}</span></li>`;
  }).join('') || '<div class="empty-note">No student data yet</div>';
}

function renderCuttleProblemLeaderboard(){
  const students = state.cuttle.students.length || 1;
  let list = [...state.cuttle.problems].sort((a,b) => a.totalSolved - b.totalSolved);
  if(state.cuttleLbMode === 'easiest') list = [...list].reverse();
  list = list.slice(0, 10);
  document.getElementById('cuttleProblemLeaderboard').innerHTML = list.map((p,i) => {
    const pct = (p.totalSolved/students*100).toFixed(0);
    return `<li><span class="lb-rank">${i+1}</span><span class="lb-name" title="${esc(p.name)}">${esc(p.name)}</span>
      <span class="lb-bar-wrap"><span class="lb-bar" style="width:${pct}%; background:var(--cuttle)"></span></span>
      <span class="lb-count">${p.totalSolved}/${students}</span></li>`;
  }).join('') || '<div class="empty-note">No problems loaded</div>';
}

function renderNcProblemLeaderboard(){
  const students = state.noncuttle.students.length || 1;
  let list = [...state.noncuttle.problems];
  if(state.ncLbMode === 'hardest') list.sort((a,b)=>a.totalSolved-b.totalSolved);
  else if(state.ncLbMode === 'easiest') list.sort((a,b)=>b.totalSolved-a.totalSolved);
  else list.sort((a,b)=>(b.totalTried-b.totalSolved)-(a.totalTried-a.totalSolved));
  list = list.slice(0, 10);
  document.getElementById('ncProblemLeaderboard').innerHTML = list.map((p,i) => {
    const val = state.ncLbMode === 'stuck' ? (p.totalTried - p.totalSolved) : p.totalSolved;
    const pct = Math.min(100, (val/students*100));
    const label = state.ncLbMode === 'stuck' ? `${val} unsolved` : `${val}/${students}`;
    return `<li><span class="lb-rank">${i+1}</span><span class="lb-name" title="${esc(p.name)}">${esc(p.name)}</span>
      <span class="lb-bar-wrap"><span class="lb-bar" style="width:${pct}%; background:var(--noncuttle)"></span></span>
      <span class="lb-count">${esc(label)}</span></li>`;
  }).join('') || '<div class="empty-note">No problems loaded</div>';
}

function renderOverview(){
  renderStatGrid();
  renderStudentLeaderboard();
  renderCuttleProblemLeaderboard();
  renderNcProblemLeaderboard();
}

/* =========================================================================
   REUSABLE MULTI-SELECT FILTER WIDGET
   options: array of strings
   selectedSet: Set of currently selected strings (mutated in place)
   onChange: called after selection changes
   ========================================================================= */
function buildMultiSelect(id, label, options, selectedSet, onChange, opts){
  opts = opts || {};
  const withSearch = options.length > 8;
  const wrap = document.createElement('div');
  wrap.className = 'fgroup';
  const lbl = document.createElement('label');
  lbl.textContent = label;
  wrap.appendChild(lbl);

  const details = document.createElement('details');
  details.className = 'msel';
  details.id = id;
  const summary = document.createElement('summary');
  function updateSummary(){
    const n = selectedSet.size;
    summary.innerHTML = (n ? `${n} selected` : 'All') + (n ? `<span class="count-pill">${n}</span>` : '');
  }
  updateSummary();
  details.appendChild(summary);

  const panel = document.createElement('div');
  panel.className = 'msel-panel';

  if(withSearch){
    const search = document.createElement('input');
    search.className = 'filter-search';
    search.placeholder = 'Search ' + label.toLowerCase() + '\u2026';
    search.addEventListener('input', () => {
      const q = search.value.toLowerCase();
      panel.querySelectorAll('.msel-row').forEach(row => {
        row.style.display = row.dataset.name.toLowerCase().includes(q) ? '' : 'none';
      });
    });
    panel.appendChild(search);
  }

  options.forEach(opt => {
    const row = document.createElement('label');
    row.className = 'msel-row';
    row.dataset.name = opt;
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = selectedSet.has(opt);
    cb.addEventListener('change', () => {
      if(cb.checked) selectedSet.add(opt); else selectedSet.delete(opt);
      updateSummary();
      onChange();
    });
    const span = document.createElement('span');
    span.textContent = opt;
    if(opts.lockClass && !state.topicsUnlocked){ span.className = opts.lockClass; span.textContent = '\u2022\u2022\u2022\u2022\u2022'; }
    row.appendChild(cb); row.appendChild(span);
    panel.appendChild(row);
  });

  const actions = document.createElement('div');
  actions.className = 'msel-actions';
  const clearBtn = document.createElement('button'); clearBtn.textContent = 'Clear';
  clearBtn.addEventListener('click', e => {
    e.preventDefault();
    selectedSet.clear();
    panel.querySelectorAll('input[type=checkbox]').forEach(c=>c.checked=false);
    updateSummary(); onChange();
  });
  const allBtn = document.createElement('button'); allBtn.textContent = 'Select all';
  allBtn.addEventListener('click', e => {
    e.preventDefault();
    options.forEach(o=>selectedSet.add(o));
    panel.querySelectorAll('input[type=checkbox]').forEach(c=>c.checked=true);
    updateSummary(); onChange();
  });
  actions.appendChild(allBtn); actions.appendChild(clearBtn);
  panel.appendChild(actions);

  details.appendChild(panel);
  wrap.appendChild(details);

  // close when clicking outside
  document.addEventListener('click', e => {
    if(!details.contains(e.target)) details.removeAttribute('open');
  });

  return wrap;
}

/* =========================================================================
   CUTTLE TAB
   ========================================================================= */
function renderCuttleFilterBar(){
  const bar = document.getElementById('cuttleFilterBar');
  bar.innerHTML = '';
  const f = state.filters.cuttle;

  const searchGroup = document.createElement('div');
  searchGroup.className = 'fgroup';
  searchGroup.innerHTML = '<label>Search</label>';
  const searchInput = document.createElement('input');
  searchInput.type = 'text'; searchInput.placeholder = 'Problem name\u2026'; searchInput.value = f.search;
  searchInput.addEventListener('input', () => { f.search = searchInput.value; renderCuttleTable(); });
  searchGroup.appendChild(searchInput);
  bar.appendChild(searchGroup);

  bar.appendChild(buildMultiSelect('cuttleStudentSel', 'Students', state.cuttle.students.map(s=>s.name), f.students, renderCuttleTable));
  bar.appendChild(buildMultiSelect('cuttleSourceSel', 'Source', state.cuttle.sources, f.sources, renderCuttleTable));

  if(state.topicsUnlocked){
    bar.appendChild(buildMultiSelect('cuttleTopicSel', 'Topic', state.cuttle.topics, f.topics, renderCuttleTable));
  } else {
    const g = document.createElement('div'); g.className = 'fgroup';
    g.innerHTML = '<label>Topic</label>';
    const btn = document.createElement('button'); btn.className = 'btn small';
    btn.innerHTML = '\uD83D\uDD12 Unlock to filter';
    btn.addEventListener('click', () => openLockModal());
    g.appendChild(btn);
    bar.appendChild(g);
  }

  const sortGroup = document.createElement('div');
  sortGroup.className = 'fgroup';
  sortGroup.innerHTML = '<label>Sort</label>';
  const sortSel = document.createElement('select');
  sortSel.className = 'mini';
  sortSel.innerHTML = `
    <option value="solved-desc">Most solved first</option>
    <option value="solved-asc">Least solved first</option>
    <option value="name-asc">Name A\u2013Z</option>`;
  sortSel.value = f.sort;
  sortSel.addEventListener('change', () => { f.sort = sortSel.value; renderCuttleTable(); });
  sortGroup.appendChild(sortSel);
  bar.appendChild(sortGroup);

  const resetGroup = document.createElement('div'); resetGroup.className = 'fgroup'; resetGroup.innerHTML = '<label>&nbsp;</label>';
  const resetBtn = document.createElement('button'); resetBtn.className = 'btn small ghost'; resetBtn.textContent = 'Reset filters';
  resetBtn.addEventListener('click', () => {
    f.search=''; f.students.clear(); f.topics.clear(); f.sources.clear(); f.sort='solved-desc';
    renderCuttleFilterBar(); renderCuttleTable();
  });
  resetGroup.appendChild(resetBtn);
  bar.appendChild(resetGroup);

  const exportGroup = document.createElement('div'); exportGroup.className = 'fgroup'; exportGroup.innerHTML = '<label>&nbsp;</label>';
  const exportBtn = document.createElement('button'); exportBtn.className = 'btn small'; exportBtn.textContent = '\u2913 Export CSV';
  exportBtn.addEventListener('click', exportCuttleCsv);
  exportGroup.appendChild(exportBtn);
  bar.appendChild(exportGroup);
}

function filteredCuttleProblems(){
  const f = state.filters.cuttle;
  let list = state.cuttle.problems.filter(p => {
    if(f.search && !p.name.toLowerCase().includes(f.search.toLowerCase())) return false;
    if(f.topics.size && !p.topics.some(t => f.topics.has(t))) return false;
    if(f.sources.size && !p.source.some(s => f.sources.has(s))) return false;
    return true;
  });
  if(f.sort === 'solved-desc') list.sort((a,b)=>b.totalSolved-a.totalSolved);
  else if(f.sort === 'solved-asc') list.sort((a,b)=>a.totalSolved-b.totalSolved);
  else list.sort((a,b)=>a.name.localeCompare(b.name));
  return list;
}

function activeCuttleStudents(){
  const f = state.filters.cuttle;
  return f.students.size ? state.cuttle.students.filter(s=>f.students.has(s.name)) : state.cuttle.students;
}

function renderCuttleTable(){
  const table = document.getElementById('cuttleTable');
  const problems = filteredCuttleProblems();
  const students = activeCuttleStudents();

  if(!state.cuttle.problems.length){
    table.innerHTML = '<tr><td class="empty-note">No cuttle problem data loaded yet.</td></tr>';
    return;
  }

  let thead = `<thead><tr>
    <th style="min-width:220px;">Problem</th>
    <th style="min-width:120px;">Source</th>
    <th style="min-width:140px;">Topics</th>
    <th class="center">Solved</th>`;
  students.forEach(s => thead += `<th class="student-col">${esc(s.name)}</th>`);
  thead += '</tr></thead>';

  let tbody = '<tbody>';
  problems.forEach(p => {
    tbody += `<tr>
      <td class="name-cell">${esc(p.name)}</td>
      <td>${p.source.map(s=>`<span class="tagchip">${esc(s)}</span>`).join('') || '<span class="count-badge">\u2014</span>'}</td>
      <td>${state.topicsUnlocked
        ? (p.topics.map(t=>`<span class="tagchip topic">${esc(t)}</span>`).join('') || '<span class="count-badge">\u2014</span>')
        : (p.topics.length ? `<span class="tagchip topic locked">hidden</span>` : '<span class="count-badge">\u2014</span>')}</td>
      <td class="center"><span class="count-badge">${p.totalSolved}/${state.cuttle.students.length}</span></td>`;
    students.forEach(s => {
      tbody += `<td class="center">${p.solves[s.name] ? '<span class="verdict ac">AC</span>' : '<span class="verdict no">\u00b7</span>'}</td>`;
    });
    tbody += '</tr>';
  });
  tbody += '</tbody>';

  if(!problems.length) tbody = '<tbody><tr><td colspan="' + (4+students.length) + '" class="empty-note">No problems match the current filters.</td></tr></tbody>';

  table.innerHTML = thead + tbody;
}

function exportCuttleCsv(){
  const problems = filteredCuttleProblems();
  const students = activeCuttleStudents();
  const rows = [['Problem','Source','Topics','Solved', ...students.map(s=>s.name)]];
  problems.forEach(p => {
    rows.push([p.name, p.source.join('; '), state.topicsUnlocked ? p.topics.join('; ') : 'hidden', p.totalSolved, ...students.map(s => p.solves[s.name] ? 1 : 0)]);
  });
  downloadCsv('cuttle-problems.csv', rows);
}

/* =========================================================================
   NON-CUTTLE TAB
   ========================================================================= */
function renderNcFilterBar(){
  const bar = document.getElementById('ncFilterBar');
  bar.innerHTML = '';
  const f = state.filters.noncuttle;

  const searchGroup = document.createElement('div');
  searchGroup.className = 'fgroup';
  searchGroup.innerHTML = '<label>Search</label>';
  const searchInput = document.createElement('input');
  searchInput.type = 'text'; searchInput.placeholder = 'Problem name\u2026'; searchInput.value = f.search;
  searchInput.addEventListener('input', () => { f.search = searchInput.value; renderNcTable(); });
  searchGroup.appendChild(searchInput);
  bar.appendChild(searchGroup);

  bar.appendChild(buildMultiSelect('ncStudentSel', 'Students', state.noncuttle.students.map(s=>s.name), f.students, renderNcTable));
  bar.appendChild(buildMultiSelect('ncSourceSel', 'Source', state.noncuttle.sources, f.sources, renderNcTable));

  const sortGroup = document.createElement('div');
  sortGroup.className = 'fgroup';
  sortGroup.innerHTML = '<label>Sort</label>';
  const sortSel = document.createElement('select');
  sortSel.className = 'mini';
  sortSel.innerHTML = `
    <option value="solved-desc">Most solved first</option>
    <option value="solved-asc">Least solved first</option>
    <option value="tried-desc">Most attempted first</option>
    <option value="name-asc">Name A\u2013Z</option>`;
  sortSel.value = f.sort;
  sortSel.addEventListener('change', () => { f.sort = sortSel.value; renderNcTable(); });
  sortGroup.appendChild(sortSel);
  bar.appendChild(sortGroup);

  const resetGroup = document.createElement('div'); resetGroup.className = 'fgroup'; resetGroup.innerHTML = '<label>&nbsp;</label>';
  const resetBtn = document.createElement('button'); resetBtn.className = 'btn small ghost'; resetBtn.textContent = 'Reset filters';
  resetBtn.addEventListener('click', () => {
    f.search=''; f.students.clear(); f.sources.clear(); f.sort='solved-desc';
    renderNcFilterBar(); renderNcTable();
  });
  resetGroup.appendChild(resetBtn);
  bar.appendChild(resetGroup);

  const exportGroup = document.createElement('div'); exportGroup.className = 'fgroup'; exportGroup.innerHTML = '<label>&nbsp;</label>';
  const exportBtn = document.createElement('button'); exportBtn.className = 'btn small'; exportBtn.textContent = '\u2913 Export CSV';
  exportBtn.addEventListener('click', exportNcCsv);
  exportGroup.appendChild(exportBtn);
  bar.appendChild(exportGroup);
}

function filteredNcProblems(){
  const f = state.filters.noncuttle;
  let list = state.noncuttle.problems.filter(p => {
    if(f.search && !p.name.toLowerCase().includes(f.search.toLowerCase())) return false;
    if(f.sources.size && !p.source.some(s => f.sources.has(s))) return false;
    return true;
  });
  if(f.sort === 'solved-desc') list.sort((a,b)=>b.totalSolved-a.totalSolved);
  else if(f.sort === 'solved-asc') list.sort((a,b)=>a.totalSolved-b.totalSolved);
  else if(f.sort === 'tried-desc') list.sort((a,b)=>b.totalTried-a.totalTried);
  else list.sort((a,b)=>a.name.localeCompare(b.name));
  return list;
}

function activeNcStudents(){
  const f = state.filters.noncuttle;
  return f.students.size ? state.noncuttle.students.filter(s=>f.students.has(s.name)) : state.noncuttle.students;
}

function renderNcTable(){
  const table = document.getElementById('ncTable');
  const problems = filteredNcProblems();
  const students = activeNcStudents();

  if(!state.noncuttle.problems.length){
    table.innerHTML = '<tr><td class="empty-note">No non-cuttle problem data loaded yet.</td></tr>';
    return;
  }

  let thead = `<thead><tr>
    <th style="min-width:220px;">Problem</th>
    <th style="min-width:120px;">Source</th>
    <th class="center">Solved</th>
    <th class="center">Tried</th>`;
  students.forEach(s => thead += `<th class="student-col">${esc(s.name)}</th>`);
  thead += '</tr></thead>';

  let tbody = '<tbody>';
  problems.forEach(p => {
    tbody += `<tr>
      <td class="name-cell">${esc(p.name)}</td>
      <td>${p.source.map(s=>`<span class="tagchip">${esc(s)}</span>`).join('') || '<span class="count-badge">\u2014</span>'}</td>
      <td class="center"><span class="count-badge">${p.totalSolved}/${state.noncuttle.students.length}</span></td>
      <td class="center"><span class="count-badge">${p.totalTried}/${state.noncuttle.students.length}</span></td>`;
    students.forEach(s => {
      const st = p.status[s.name] || {tried:false,solved:false};
      const cell = st.solved ? '<span class="verdict ac">AC</span>' : st.tried ? '<span class="verdict tr">TR</span>' : '<span class="verdict no">\u00b7</span>';
      tbody += `<td class="center">${cell}</td>`;
    });
    tbody += '</tr>';
  });
  tbody += '</tbody>';

  if(!problems.length) tbody = '<tbody><tr><td colspan="' + (4+students.length) + '" class="empty-note">No problems match the current filters.</td></tr></tbody>';

  table.innerHTML = thead + tbody;
}

function exportNcCsv(){
  const problems = filteredNcProblems();
  const students = activeNcStudents();
  const rows = [['Problem','Source','Solved','Tried', ...students.flatMap(s=>[s.name+' (tried)', s.name+' (solved)'])]];
  problems.forEach(p => {
    const cells = students.flatMap(s => {
      const st = p.status[s.name] || {tried:false,solved:false};
      return [st.tried?1:0, st.solved?1:0];
    });
    rows.push([p.name, p.source.join('; '), p.totalSolved, p.totalTried, ...cells]);
  });
  downloadCsv('non-cuttle-problems.csv', rows);
}

/* =========================================================================
   STUDENTS TAB
   ========================================================================= */
function renderStudentsFilterBar(){
  const bar = document.getElementById('studentsFilterBar');
  bar.innerHTML = '';
  const f = state.filters.students;
  const searchGroup = document.createElement('div');
  searchGroup.className = 'fgroup';
  searchGroup.innerHTML = '<label>Search</label>';
  const searchInput = document.createElement('input');
  searchInput.type = 'text'; searchInput.placeholder = 'Student name\u2026'; searchInput.value = f.search;
  searchInput.addEventListener('input', () => { f.search = searchInput.value; renderStudentGrid(); });
  searchGroup.appendChild(searchInput);
  bar.appendChild(searchGroup);

  if(!state.topicsUnlocked){
    const note = document.createElement('div');
    note.className = 'locked-note';
    note.innerHTML = '\uD83D\uDD12 Topic breakdown &amp; suggestions are hidden. <button class="btn small" style="margin-left:6px;" id="studentsUnlockBtn">Unlock</button>';
    bar.appendChild(note);
  }
}

function renderStudentGrid(){
  const grid = document.getElementById('studentGrid');
  const f = state.filters.students;
  const cuttleTotal = state.cuttle.problems.length;
  const names = state.allStudents.filter(n => !f.search || n.toLowerCase().includes(f.search.toLowerCase()));

  if(!names.length){ grid.innerHTML = '<div class="empty-note">No students match.</div>'; return; }

  grid.innerHTML = names.map(name => {
    const inCuttle = state.cuttle.students.some(s=>s.name===name);
    const inNc = state.noncuttle.students.some(s=>s.name===name);

    let cuttleSolved = 0, unsolved = [];
    const topicCounts = {};
    if(inCuttle){
      state.cuttle.problems.forEach(p => {
        if(p.solves[name]){
          cuttleSolved++;
          p.topics.forEach(t => topicCounts[t] = (topicCounts[t]||0)+1);
        } else {
          unsolved.push(p);
        }
      });
    }
    const cuttlePct = cuttleTotal ? Math.round(cuttleSolved/cuttleTotal*100) : 0;

    let ncSolved = 0, ncTried = 0, ncTotal = state.noncuttle.problems.length;
    if(inNc){
      state.noncuttle.problems.forEach(p => {
        const st = p.status[name] || {};
        if(st.solved) ncSolved++;
        if(st.tried || st.solved) ncTried++;
      });
    }

    let topicHtml = '';
    if(inCuttle && state.topicsUnlocked){
      const topTopics = Object.entries(topicCounts).sort((a,b)=>b[1]-a[1]).slice(0,5);
      const maxT = Math.max(1, ...topTopics.map(t=>t[1]));
      if(topTopics.length){
        topicHtml = '<div style="margin-top:10px; padding-top:10px; border-top:1px dashed var(--border);">' +
          topTopics.map(([t,c]) => `
            <div style="display:flex; align-items:center; gap:6px; font-size:11.5px; margin-bottom:4px;">
              <span style="width:90px; color:var(--text-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${esc(t)}">${esc(t)}</span>
              <span class="mini-bar-wrap" style="width:80px;"><span class="mini-bar" style="width:${c/maxT*100}%; background:var(--cuttle);"></span></span>
              <span class="count-badge">${c}</span>
            </div>`).join('') + '</div>';
      }
    }

    let suggestHtml = '';
    if(inCuttle && state.topicsUnlocked && unsolved.length){
      const items = unsolved.slice(0,15).map(p => `<li>${esc(p.name)} ${p.topics.length? '<span class="count-badge">('+esc(p.topics.join(', '))+')</span>':''}</li>`).join('');
      suggestHtml = `<details class="suggest-list"><summary>Suggested next (${unsolved.length} unsolved)</summary><ul>${items}</ul></details>`;
    }

    return `<div class="student-card">
      <h3>${esc(name)}</h3>
      ${inCuttle ? `
      <div class="progress-row">
        <div class="plabel"><span>Cuttle <span class="tag-src cuttle" style="font-size:9px;">CUTTLE</span></span><span>${cuttleSolved}/${cuttleTotal} (${cuttlePct}%)</span></div>
        <div class="progress-track"><div class="progress-fill" style="width:${cuttlePct}%; background:var(--cuttle);"></div></div>
      </div>` : ''}
      ${inNc ? `
      <div class="progress-row">
        <div class="plabel"><span>Non-Cuttle solved <span class="tag-src noncuttle" style="font-size:9px;">NON-CUTTLE</span></span><span>${ncSolved}/${ncTotal}</span></div>
        <div class="progress-track"><div class="progress-fill" style="width:${ncTotal?ncSolved/ncTotal*100:0}%; background:var(--noncuttle);"></div></div>
      </div>
      <div class="progress-row">
        <div class="plabel"><span>Non-Cuttle tried/seen</span><span>${ncTried}/${ncTotal}</span></div>
        <div class="progress-track"><div class="progress-fill" style="width:${ncTotal?ncTried/ncTotal*100:0}%; background:var(--tried);"></div></div>
      </div>` : ''}
      ${!inCuttle && !inNc ? '<div class="empty-note" style="padding:8px 0;">No tracked activity</div>' : ''}
      ${topicHtml}
      ${suggestHtml}
    </div>`;
  }).join('');
}

/* =========================================================================
   TOPIC LOCK MODAL
   ========================================================================= */
async function sha256Hex(str){
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
function openLockModal(){
  document.getElementById('lockErr').style.display = 'none';
  document.getElementById('lockInput').value = '';
  document.getElementById('lockModal').classList.add('show');
  document.getElementById('lockInput').focus();
}
function closeLockModal(){ document.getElementById('lockModal').classList.remove('show'); }

async function attemptUnlock(){
  const val = document.getElementById('lockInput').value;
  const hash = await sha256Hex(val);
  if(hash === TOPIC_PASS_HASH){
    state.topicsUnlocked = true;
    sessionStorage.setItem('topicsUnlocked','1');
    closeLockModal();
    updateLockBtn();
    renderAll();
  } else {
    document.getElementById('lockErr').style.display = 'block';
  }
}

/* =========================================================================
   TABS
   ========================================================================= */
function switchTab(name){
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
}

/* =========================================================================
   MASTER RENDER + WIRING
   ========================================================================= */
function renderAll(){
  renderOverview();
  renderCuttleFilterBar();
  renderCuttleTable();
  renderNcFilterBar();
  renderNcTable();
  renderStudentsFilterBar();
  renderStudentGrid();
}

function scheduleAutoRefresh(){
  if(state.autoTimer) clearInterval(state.autoTimer);
  if(state.autoRefreshMs > 0){
    state.autoTimer = setInterval(loadAll, state.autoRefreshMs);
  }
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

document.getElementById('refreshBtn').addEventListener('click', loadAll);
document.getElementById('autoRefreshSel').addEventListener('change', e => {
  state.autoRefreshMs = parseInt(e.target.value, 10);
  scheduleAutoRefresh();
});

document.getElementById('lockSubmit').addEventListener('click', attemptUnlock);
document.getElementById('lockCancel').addEventListener('click', closeLockModal);
document.getElementById('lockInput').addEventListener('keydown', e => { if(e.key === 'Enter') attemptUnlock(); });
document.getElementById('lockModal').addEventListener('click', e => { if(e.target.id === 'lockModal') closeLockModal(); });

document.getElementById('lbScope').addEventListener('change', e => { state.lbScope = e.target.value; renderStudentLeaderboard(); });

document.querySelectorAll('[data-toggle="cuttleLbMode"]').forEach(btn => {
  btn.addEventListener('click', () => {
    state.cuttleLbMode = btn.dataset.val;
    document.querySelectorAll('[data-toggle="cuttleLbMode"]').forEach(b => b.classList.toggle('ghost', b !== btn));
    renderCuttleProblemLeaderboard();
  });
});
document.querySelectorAll('[data-toggle="ncLbMode"]').forEach(btn => {
  btn.addEventListener('click', () => {
    state.ncLbMode = btn.dataset.val;
    document.querySelectorAll('[data-toggle="ncLbMode"]').forEach(b => b.classList.toggle('ghost', b !== btn));
    renderNcProblemLeaderboard();
  });
});

// event delegation for the "unlock" button inside the students-tab locked note (re-rendered each time)
document.getElementById('studentsFilterBar').addEventListener('click', e => {
  if(e.target && e.target.id === 'studentsUnlockBtn') openLockModal();
});

// periodic refresh of the "synced Xs ago" label without refetching
setInterval(() => {
  if(state.lastSync) setSyncStatus('ok', 'synced ' + timeAgo(state.lastSync));
}, 15000);

function updateLockBtn(){
  const btn = document.getElementById('topicLockBtn');
  btn.innerHTML = state.topicsUnlocked ? '\uD83D\uDD13 Topics unlocked' : '\uD83D\uDD12 Unlock topics';
}
document.getElementById('topicLockBtn').addEventListener('click', () => {
  if(state.topicsUnlocked){
    state.topicsUnlocked = false;
    sessionStorage.removeItem('topicsUnlocked');
    updateLockBtn();
    renderAll();
  } else {
    openLockModal();
  }
});

document.getElementById('autoRefreshSel').value = String(state.autoRefreshMs);
updateLockBtn();
scheduleAutoRefresh();
loadAll();