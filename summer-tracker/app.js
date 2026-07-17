/* ==========================================================================
   TRACKLINE — summer ops log
   All data lives in localStorage. No backend. No build step.
   ========================================================================== */

const STORAGE_KEY = 'trackline.v1';
const COLORS = ['amber','cyan','violet','rose','green','blue','orange'];

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2));
const todayISO = () => new Date().toISOString().slice(0,10);
const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

/* ============ STATE ============ */
let state = loadState();

function defaultState(){
  return {
    projects: [],
    entries: [],
    todoist: { token:'', sources:[] },
    ui: { view:'rails', statusFilter:'all', colorCursor:0 }
  };
}

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return seedState();
    const parsed = JSON.parse(raw);
    return Object.assign(defaultState(), parsed);
  }catch(e){
    console.error('Failed to load state', e);
    return defaultState();
  }
}

function saveState(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function seedState(){
  // First-run seed so the page isn't empty on first load.
  const s = defaultState();
  const mk = (name, category) => ({ id: uid(), name, category, colorIndex: 0, status:'active', desc:'', createdAt: Date.now() });
  const projects = [
    mk('Daily Problems', 'Informatics'),
    mk('Olympiad Ops', 'Informatics'),
    mk('Competitive Programming', 'Informatics'),
    mk('Machine Learning', 'Personal'),
    mk('Flight Software', 'Teams'),
  ];
  projects.forEach((p,i) => p.colorIndex = i % COLORS.length);
  s.projects = projects;
  s.entries = [
    { id: uid(), projectId: projects[0].id, kind:'milestone', title:'Set up the daily problem pipeline', date: null, notes:'Decided on format: 1 problem/day, rated by difficulty.', code:null, links:[], order:1, createdAt: Date.now() },
  ];
  return s;
}

/* ============ HELPERS ============ */
function projectById(id){ return state.projects.find(p => p.id === id); }
function entriesFor(projectId){
  return state.entries.filter(e => e.projectId === projectId).sort((a,b) => a.order - b.order);
}
function nextOrder(projectId){
  const es = entriesFor(projectId);
  return es.length ? Math.max(...es.map(e => e.order)) + 1 : 1;
}
function colorVar(project){ return `var(--${COLORS[project.colorIndex % COLORS.length]})`; }
function fmtDate(iso){
  if(!iso) return null;
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month:'short', day:'numeric', year: (new Date().getFullYear() !== d.getFullYear()) ? 'numeric' : undefined });
}
function toast(msg){
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._h);
  toast._h = setTimeout(() => t.hidden = true, 2400);
}

/* ============ RENDER: TOP STATS + HEADER ============ */
function renderHeader(){
  $('#dateToday').textContent = new Date().toLocaleDateString(undefined, { weekday:'long', month:'long', day:'numeric' });

  const active = state.projects.filter(p => p.status === 'active').length;
  const now = Date.now();
  const weekAgo = now - 7*86400000;
  const thisWeek = state.entries.filter(e => e.createdAt >= weekAgo).length;
  const total = state.entries.length;

  $('#topStats').innerHTML = `
    <div class="stat"><b>${active}</b><span>active tracks</span></div>
    <div class="stat"><b>${thisWeek}</b><span>logged this week</span></div>
    <div class="stat"><b>${total}</b><span>total entries</span></div>
  `;
}

/* ============ RENDER: ACTIVITY HEATMAP ============ */
function renderHeatmap(){
  const container = $('#heatmap');
  container.innerHTML = '';
  const days = 105; // ~15 weeks
  const counts = {};
  state.entries.forEach(e => {
    if(e.date){ counts[e.date] = (counts[e.date]||0) + 1; }
  });
  const today = new Date();
  today.setHours(0,0,0,0);
  // align to start of week (Sunday) minus (days) so grid columns are full weeks
  const start = new Date(today);
  start.setDate(start.getDate() - days);
  while(start.getDay() !== 0) start.setDate(start.getDate() - 1);

  const cells = [];
  const cur = new Date(start);
  while(cur <= today){
    const iso = cur.toISOString().slice(0,10);
    cells.push({ iso, count: counts[iso] || 0, future: cur > today });
    cur.setDate(cur.getDate() + 1);
  }
  cells.forEach(c => {
    const div = document.createElement('div');
    div.className = 'heat-cell';
    div.title = `${c.iso}: ${c.count} ${c.count===1?'entry':'entries'}`;
    let alpha = 0;
    if(c.count > 0) alpha = Math.min(1, 0.28 + c.count*0.22);
    div.style.background = alpha ? `rgba(79,209,197,${alpha})` : 'var(--surface-2)';
    container.appendChild(div);
  });

  // streak
  let streak = 0;
  let d = new Date(today);
  while(true){
    const iso = d.toISOString().slice(0,10);
    if(counts[iso] > 0){ streak++; d.setDate(d.getDate()-1); }
    else break;
  }
  $('#streakNum').textContent = streak;
}

/* ============ RENDER: STATUS FILTERS ============ */
function renderFilters(){
  const wrap = $('#statusFilters');
  const opts = [['all','all'],['active','active'],['paused','paused'],['done','done']];
  wrap.innerHTML = opts.map(([val,label]) =>
    `<span class="chip ${state.ui.statusFilter===val?'active':''}" data-status="${val}">${label}</span>`
  ).join('');
  $$('.chip', wrap).forEach(chip => {
    chip.addEventListener('click', () => {
      state.ui.statusFilter = chip.dataset.status;
      saveState();
      renderFilters();
      renderBoard();
    });
  });
}

/* ============ RENDER: BOARD / LANES ============ */
function renderBoard(){
  const board = $('#board');
  board.className = 'board ' + (state.ui.view === 'list' ? 'list' : '');
  board.innerHTML = '';

  let projects = state.projects.slice();
  if(state.ui.statusFilter !== 'all'){
    projects = projects.filter(p => p.status === state.ui.statusFilter);
  }

  $('#emptyHint').hidden = state.projects.length > 0;

  projects.forEach(project => {
    board.appendChild(renderLane(project));
  });
}

function renderLane(project){
  const lane = document.createElement('div');
  lane.className = `lane status-${project.status}`;
  const color = colorVar(project);

  const head = document.createElement('div');
  head.className = 'lane-head';
  head.innerHTML = `
    <span class="lane-dot" style="background:${color}"></span>
    <h3>${escapeHtml(project.name)}</h3>
    <span class="lane-cat">${escapeHtml(project.category)}</span>
  `;
  head.addEventListener('click', () => openProjectModal(project.id));
  lane.appendChild(head);

  if(project.desc){
    const desc = document.createElement('p');
    desc.className = 'lane-desc';
    desc.textContent = project.desc;
    lane.appendChild(desc);
  }

  const entries = entriesFor(project.id);
  const count = document.createElement('div');
  count.className = 'lane-count';
  const milestoneCt = entries.filter(e=>e.kind==='milestone').length;
  const markCt = entries.filter(e=>e.kind==='mark').length;
  count.textContent = `${milestoneCt} milestone${milestoneCt!==1?'s':''} · ${markCt} mark${markCt!==1?'s':''}`;
  lane.appendChild(count);

  const rail = document.createElement('div');
  rail.className = 'rail';
  rail.style.setProperty('--dot-color', color);

  entries.forEach(entry => {
    rail.appendChild(renderStation(entry, project, color));
  });
  lane.appendChild(rail);

  const addBtn = document.createElement('button');
  addBtn.className = 'lane-add';
  addBtn.textContent = '+ add entry';
  addBtn.addEventListener('click', () => openEntryModal(null, project.id));
  lane.appendChild(addBtn);

  return lane;
}

function renderStation(entry, project, color){
  const el = document.createElement('div');
  el.className = `station ${entry.kind === 'mark' ? 'mark' : ''} ${entry.date ? 'dated' : ''}`;
  el.style.setProperty('--dot-color', color);

  const node = document.createElement('div');
  node.className = 'station-node';
  el.appendChild(node);

  const conn = document.createElement('div');
  conn.className = 'station-connector';
  el.appendChild(conn);

  const card = document.createElement('div');
  card.className = 'station-card';
  const badges = [];
  if(entry.notes) badges.push('<span class="badge-icon" title="has notes">▤</span>');
  if(entry.code && entry.code.content) badges.push('<span class="badge-icon" title="has code">⌘</span>');
  if(entry.links && entry.links.length) badges.push(`<span class="badge-icon" title="${entry.links.length} link(s)">🔗</span>`);

  card.innerHTML = `
    <div class="station-title">${escapeHtml(entry.title)}</div>
    <div class="station-meta">
      ${entry.date ? `<span class="station-date">${fmtDate(entry.date)}</span>` : `<span class="station-nodate">no date</span>`}
      <span class="station-badges">${badges.join('')}</span>
    </div>
  `;
  el.appendChild(card);

  el.addEventListener('click', () => openDetail(entry.id));
  return el;
}

function escapeHtml(str){
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

/* ============ RENDER: QUICK ADD PROJECT SELECT ============ */
function refreshProjectSelects(){
  const opts = state.projects.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  [$('#qaProject'), $('#enProject')].forEach(sel => {
    const prev = sel.value;
    sel.innerHTML = opts || '<option disabled>No tracks yet</option>';
    if(prev && state.projects.some(p => p.id === prev)){
      sel.value = prev;
    }
  });
}

/* ============ FULL RENDER ============ */
function renderAll(){
  renderHeader();
  renderHeatmap();
  renderFilters();
  refreshProjectSelects();
  renderBoard();
}

/* ==========================================================================
   MODALS: generic open/close
   ========================================================================== */
function openModal(id){ $('#'+id).hidden = false; document.body.style.overflow='hidden'; }
function closeModal(id){ $('#'+id).hidden = true; document.body.style.overflow=''; }

$$('.modal-close, [data-close]').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.close));
});
$$('.modal-overlay').forEach(ov => {
  ov.addEventListener('click', (e) => { if(e.target === ov) closeModal(ov.id); });
});
document.addEventListener('keydown', (e) => {
  if(e.key === 'Escape'){
    $$('.modal-overlay').forEach(ov => { if(!ov.hidden) closeModal(ov.id); });
  }
});

/* ============ PROJECT MODAL ============ */
function openProjectModal(id){
  const isEdit = !!id;
  $('#projModalTitle').textContent = isEdit ? 'Edit Track' : 'New Track';
  $('#pjDelete').hidden = !isEdit;
  if(isEdit){
    const p = projectById(id);
    $('#pjId').value = p.id;
    $('#pjName').value = p.name;
    $('#pjCategory').value = p.category;
    $('#pjStatus').value = p.status;
    $('#pjDesc').value = p.desc || '';
  } else {
    $('#pjId').value = '';
    $('#pjName').value = '';
    $('#pjCategory').value = 'Informatics';
    $('#pjStatus').value = 'active';
    $('#pjDesc').value = '';
  }
  openModal('modalProject');
  setTimeout(() => $('#pjName').focus(), 50);
}

$('#btnNewProject').addEventListener('click', () => openProjectModal(null));

$('#pjSave').addEventListener('click', () => {
  const name = $('#pjName').value.trim();
  if(!name){ toast('Give the track a name'); return; }
  const id = $('#pjId').value;
  if(id){
    const p = projectById(id);
    p.name = name;
    p.category = $('#pjCategory').value;
    p.status = $('#pjStatus').value;
    p.desc = $('#pjDesc').value.trim();
  } else {
    state.projects.push({
      id: uid(), name, category: $('#pjCategory').value, status: $('#pjStatus').value,
      desc: $('#pjDesc').value.trim(), colorIndex: state.ui.colorCursor % COLORS.length, createdAt: Date.now()
    });
    state.ui.colorCursor++;
  }
  saveState();
  closeModal('modalProject');
  renderAll();
  toast('Track saved');
});

$('#pjDelete').addEventListener('click', () => {
  const id = $('#pjId').value;
  if(!id) return;
  if(!confirm('Delete this track and all its entries? This cannot be undone.')) return;
  state.projects = state.projects.filter(p => p.id !== id);
  state.entries = state.entries.filter(e => e.projectId !== id);
  saveState();
  closeModal('modalProject');
  renderAll();
  toast('Track deleted');
});

/* ============ ENTRY MODAL ============ */
function openEntryModal(entryId, presetProjectId){
  const isEdit = !!entryId;
  $('#entryModalTitle').textContent = isEdit ? 'Edit Entry' : 'New Entry';
  $('#enDelete').hidden = !isEdit;
  $('#enLinks').innerHTML = '';

  if(isEdit){
    const e = state.entries.find(x => x.id === entryId);
    $('#enId').value = e.id;
    $('#enProject').value = e.projectId;
    $('#enKind').value = e.kind;
    $('#enTitle').value = e.title;
    $('#enDate').value = e.date || '';
    $('#enNotes').value = e.notes || '';
    $('#enCodeLang').value = (e.code && e.code.lang) || '';
    $('#enCode').value = (e.code && e.code.content) || '';
    (e.links || []).forEach(l => addLinkRow(l.label, l.url));
  } else {
    $('#enId').value = '';
    if(presetProjectId) $('#enProject').value = presetProjectId;
    $('#enKind').value = 'milestone';
    $('#enTitle').value = '';
    $('#enDate').value = '';
    $('#enNotes').value = '';
    $('#enCodeLang').value = '';
    $('#enCode').value = '';
  }
  openModal('modalEntry');
  setTimeout(() => $('#enTitle').focus(), 50);
}

function addLinkRow(label='', url=''){
  const row = document.createElement('div');
  row.className = 'link-row';
  row.innerHTML = `
    <input type="text" placeholder="label" class="link-label" value="${escapeHtml(label)}" style="max-width:120px">
    <input type="url" placeholder="https://…" class="link-url" value="${escapeHtml(url)}">
    <button class="btn btn-tiny btn-ghost link-remove" type="button">×</button>
  `;
  row.querySelector('.link-remove').addEventListener('click', () => row.remove());
  $('#enLinks').appendChild(row);
}
$('#enAddLink').addEventListener('click', () => addLinkRow());

$('#enToday').addEventListener('click', () => { $('#enDate').value = todayISO(); });
$('#enClearDate').addEventListener('click', () => { $('#enDate').value = ''; });

$('#enSave').addEventListener('click', () => {
  const title = $('#enTitle').value.trim();
  const projectId = $('#enProject').value;
  if(!title){ toast('Entries need a title'); return; }
  if(!projectId){ toast('Add a track first'); return; }

  const links = $$('.link-row', $('#enLinks')).map(row => ({
    label: row.querySelector('.link-label').value.trim(),
    url: row.querySelector('.link-url').value.trim()
  })).filter(l => l.url);

  const codeContent = $('#enCode').value;
  const code = codeContent.trim() ? { lang: $('#enCodeLang').value.trim() || 'text', content: codeContent } : null;

  const id = $('#enId').value;
  if(id){
    const e = state.entries.find(x => x.id === id);
    e.projectId = projectId;
    e.kind = $('#enKind').value;
    e.title = title;
    e.date = $('#enDate').value || null;
    e.notes = $('#enNotes').value.trim();
    e.code = code;
    e.links = links;
  } else {
    state.entries.push({
      id: uid(), projectId, kind: $('#enKind').value, title,
      date: $('#enDate').value || null,
      notes: $('#enNotes').value.trim(),
      code, links,
      order: nextOrder(projectId),
      createdAt: Date.now()
    });
  }
  saveState();
  closeModal('modalEntry');
  renderAll();
  toast('Entry saved');
});

$('#enDelete').addEventListener('click', () => {
  const id = $('#enId').value;
  if(!id) return;
  if(!confirm('Delete this entry?')) return;
  state.entries = state.entries.filter(e => e.id !== id);
  saveState();
  closeModal('modalEntry');
  renderAll();
  toast('Entry deleted');
});

/* ============ DETAIL DRAWER ============ */
let detailEntryId = null;
function openDetail(entryId){
  detailEntryId = entryId;
  const e = state.entries.find(x => x.id === entryId);
  const p = projectById(e.projectId);
  $('#detailTitle').textContent = e.title;

  const kv = `
    <div class="detail-kv">
      <span style="color:${colorVar(p)}">● ${escapeHtml(p.name)}</span>
      <span>${e.kind === 'milestone' ? 'Milestone' : 'Mark'}</span>
      <span>${e.date ? fmtDate(e.date) : 'no date'}</span>
    </div>
  `;
  let body = kv;
  if(e.notes) body += `<div class="detail-notes">${escapeHtml(e.notes)}</div>`;
  if(e.code && e.code.content){
    body += `<div class="detail-code"><span class="detail-code-lang">${escapeHtml(e.code.lang)}</span>${escapeHtml(e.code.content)}</div>`;
  }
  if(e.links && e.links.length){
    body += `<div class="detail-links">` + e.links.map(l =>
      `<a href="${escapeHtml(l.url)}" target="_blank" rel="noopener">${escapeHtml(l.label || l.url)}</a>`
    ).join('') + `</div>`;
  }
  if(!e.notes && !(e.code && e.code.content) && !(e.links && e.links.length)){
    body += `<p class="hint">No notes, code, or links on this entry yet.</p>`;
  }
  $('#detailBody').innerHTML = body;
  openModal('modalDetail');
}

$('#detailEdit').addEventListener('click', () => {
  closeModal('modalDetail');
  openEntryModal(detailEntryId);
});

$('#detailMoveUp').addEventListener('click', () => moveEntry(detailEntryId, -1));
$('#detailMoveDown').addEventListener('click', () => moveEntry(detailEntryId, 1));

function moveEntry(entryId, dir){
  const e = state.entries.find(x => x.id === entryId);
  const siblings = entriesFor(e.projectId);
  const idx = siblings.findIndex(x => x.id === entryId);
  const swapIdx = idx + dir;
  if(swapIdx < 0 || swapIdx >= siblings.length) return;
  const other = siblings[swapIdx];
  const tmp = e.order; e.order = other.order; other.order = tmp;
  saveState();
  renderBoard();
  openDetail(entryId);
}

/* ============ QUICK ADD ============ */
$('#qaToday').addEventListener('click', () => { $('#qaDate').value = todayISO(); });

$('#qaAdd').addEventListener('click', () => {
  const projectId = $('#qaProject').value;
  const title = $('#qaTitle').value.trim();
  if(!projectId){ toast('Create a track first'); return; }
  if(!title){ toast('Type something to log'); return; }
  state.entries.push({
    id: uid(), projectId, kind: $('#qaKind').value, title,
    date: $('#qaDate').value || null,
    notes:'', code:null, links:[],
    order: nextOrder(projectId), createdAt: Date.now()
  });
  saveState();
  $('#qaTitle').value = '';
  $('#qaDate').value = '';
  renderAll();
  toast('Logged');
});
$('#qaTitle').addEventListener('keydown', (e) => { if(e.key === 'Enter') $('#qaAdd').click(); });

/* ============ VIEW TOGGLE ============ */
$('#btnList').addEventListener('click', () => {
  state.ui.view = state.ui.view === 'list' ? 'rails' : 'list';
  $('#btnList').textContent = state.ui.view === 'list' ? '▤ Rails' : '☰ List';
  saveState();
  renderBoard();
});

/* ============ SETTINGS ============ */
$('#btnSettings').addEventListener('click', () => {
  $('#tdToken').value = state.todoist.token || '';
  renderSourceRows();
  openModal('modalSettings');
});

function renderSourceRows(){
  const wrap = $('#tdSources');
  wrap.innerHTML = '';
  state.todoist.sources.forEach((s, i) => {
    const row = document.createElement('div');
    row.className = 'source-row';
    row.innerHTML = `
      <input type="text" placeholder="label (e.g. Olympiad)" class="src-label" value="${escapeHtml(s.label||'')}">
      <input type="text" placeholder="Todoist project name" class="src-project" value="${escapeHtml(s.projectName||'')}">
      <input type="text" placeholder="section (optional)" class="src-section" value="${escapeHtml(s.sectionName||'')}">
      <button class="btn btn-tiny btn-ghost src-remove" type="button">×</button>
    `;
    row.querySelector('.src-remove').addEventListener('click', () => { row.remove(); });
    row.dataset.idx = i;
    wrap.appendChild(row);
  });
}
$('#tdAddSource').addEventListener('click', () => {
  const wrap = $('#tdSources');
  const row = document.createElement('div');
  row.className = 'source-row';
  row.innerHTML = `
    <input type="text" placeholder="label (e.g. Olympiad)" class="src-label">
    <input type="text" placeholder="Todoist project name" class="src-project">
    <input type="text" placeholder="section (optional)" class="src-section">
    <button class="btn btn-tiny btn-ghost src-remove" type="button">×</button>
  `;
  row.querySelector('.src-remove').addEventListener('click', () => row.remove());
  wrap.appendChild(row);
});

$('#tdSave').addEventListener('click', () => {
  state.todoist.token = $('#tdToken').value.trim();
  state.todoist.sources = $$('.source-row', $('#tdSources')).map(row => ({
    label: row.querySelector('.src-label').value.trim(),
    projectName: row.querySelector('.src-project').value.trim(),
    sectionName: row.querySelector('.src-section').value.trim()
  })).filter(s => s.projectName);
  saveState();
  closeModal('modalSettings');
  toast('Settings saved');
});

/* ============ DATA: EXPORT / IMPORT / WIPE ============ */
$('#btnExport').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `trackline-backup-${todayISO()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});
$('#btnImportTrigger').addEventListener('click', () => $('#fileImport').click());
$('#fileImport').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const parsed = JSON.parse(reader.result);
      if(!parsed.projects || !parsed.entries) throw new Error('bad shape');
      if(!confirm('Import will replace all current data. Continue?')) return;
      state = Object.assign(defaultState(), parsed);
      saveState();
      renderAll();
      closeModal('modalSettings');
      toast('Data imported');
    }catch(err){
      toast('Could not read that file');
    }
  };
  reader.readAsText(file);
});
$('#btnWipe').addEventListener('click', () => {
  if(!confirm('This deletes everything permanently. Sure?')) return;
  if(!confirm('Really sure? Consider exporting a backup first.')) return;
  state = defaultState();
  saveState();
  renderAll();
  closeModal('modalSettings');
  toast('All data wiped');
});

/* ============ TODOIST INTEGRATION ============ */
// Todoist retired the old `rest/v2` API in favor of the unified `api/v1` API.
// Endpoints now return { results: [...], next_cursor } instead of a bare array,
// so every list call is paginated and needs to be drained with the cursor.
const TD_BASE = 'https://api.todoist.com/api/v1';
let todoistCache = { tasks: [] }; // [{source,label,content,description,date,url,taskId}]

async function todoistFetch(path, token){
  const res = await fetch(`${TD_BASE}/${path}`, { headers: { 'Authorization': `Bearer ${token}` } });
  if(!res.ok){
    let detail = '';
    try{ detail = (await res.json()).error || ''; }catch(e){ /* ignore */ }
    throw new Error(`Todoist API error ${res.status}${detail ? ' — ' + detail : ''}`);
  }
  return res.json();
}

// Drains a paginated api/v1 list endpoint (adds ?cursor=... across requests) and
// returns the combined `results` array.
async function todoistFetchAll(path, token){
  let cursor = null;
  let all = [];
  do{
    const sep = path.includes('?') ? '&' : '?';
    const pageUrl = cursor ? `${path}${sep}cursor=${encodeURIComponent(cursor)}` : path;
    const page = await todoistFetch(pageUrl, token);
    // Some api/v1 endpoints return { results, next_cursor }; guard for a bare array just in case.
    if(Array.isArray(page)){ all = all.concat(page); cursor = null; }
    else{ all = all.concat(page.results || []); cursor = page.next_cursor || null; }
  } while(cursor);
  return all;
}

$('#btnTodoist').addEventListener('click', () => {
  refreshTodoistImportList();
  openModal('modalTodoist');
  // Auto-refresh so the panel is never showing stale data without an extra click.
  if(state.todoist.token && state.todoist.sources.length){
    syncTodoist();
  }
});

$('#tdSync').addEventListener('click', syncTodoist);

$('#tdSelectAll').addEventListener('click', () => {
  const boxes = $$('.imp-check', $('#tdImportList'));
  if(!boxes.length) return;
  const allChecked = boxes.every(b => b.checked);
  boxes.forEach(b => { b.checked = !allChecked; });
  $('#tdSelectAll').textContent = allChecked ? '☑ Select all' : '☐ Select none';
});

async function syncTodoist(){
  const token = state.todoist.token;
  const statusEl = $('#tdImportStatus');
  if(!token){ statusEl.textContent = 'Add your Todoist API token in Settings first.'; return; }
  if(!state.todoist.sources.length){ statusEl.textContent = 'Add at least one source in Settings first.'; return; }

  statusEl.textContent = 'Syncing…';
  try{
    const projects = await todoistFetchAll('projects', token);
    const collected = [];

    for(const source of state.todoist.sources){
      const proj = projects.find(p => p.name.toLowerCase() === source.projectName.toLowerCase());
      if(!proj){
        collected.push({ source: source.label || source.projectName, error: `Project "${source.projectName}" not found` });
        continue;
      }
      let sectionId = null;
      if(source.sectionName){
        const sections = await todoistFetchAll(`sections?project_id=${proj.id}`, token);
        const sec = sections.find(s => s.name.toLowerCase() === source.sectionName.toLowerCase());
        if(!sec){
          collected.push({ source: source.label || source.projectName, error: `Section "${source.sectionName}" not found in "${source.projectName}"` });
          continue;
        }
        sectionId = sec.id;
      }
      const tasks = await todoistFetchAll(`tasks?project_id=${proj.id}`, token);
      const filtered = sectionId ? tasks.filter(t => t.section_id === sectionId) : tasks;
      filtered.forEach(t => {
        collected.push({
          source: source.label || source.projectName,
          taskId: t.id,
          content: t.content,
          description: t.description,
          date: t.due ? t.due.date : null,
          url: t.url || `https://todoist.com/app/task/${t.id}`
        });
      });
    }
    todoistCache.tasks = collected;
    statusEl.textContent = `Synced ${collected.filter(c=>!c.error).length} task(s) from ${state.todoist.sources.length} source(s).`;
    refreshTodoistImportList();
  }catch(err){
    console.error(err);
    statusEl.textContent = `Sync failed: ${err.message}. Double-check your token is still valid — tokens are also visible under Todoist → Settings → Integrations → Developer.`;
  }
}

function refreshTodoistImportList(){
  const wrap = $('#tdImportList');
  wrap.innerHTML = '';
  $('#tdSelectAll').textContent = '☑ Select all';
  if(!todoistCache.tasks.length){
    wrap.innerHTML = '<p class="hint">No synced tasks yet — hit "Sync now".</p>';
    return;
  }
  const groups = {};
  todoistCache.tasks.forEach(t => {
    groups[t.source] = groups[t.source] || [];
    groups[t.source].push(t);
  });
  Object.entries(groups).forEach(([source, items]) => {
    const label = document.createElement('div');
    label.className = 'import-group-label';
    label.textContent = source;
    wrap.appendChild(label);
    items.forEach(item => {
      if(item.error){
        const div = document.createElement('div');
        div.className = 'hint';
        div.textContent = '⚠ ' + item.error;
        wrap.appendChild(div);
        return;
      }
      const row = document.createElement('label');
      row.className = 'import-item';
      row.innerHTML = `
        <input type="checkbox" class="imp-check" data-task-id="${item.taskId}">
        <span class="imp-title">${escapeHtml(item.content)}</span>
        ${item.date ? `<span class="imp-date">${item.date}</span>` : ''}
      `;
      wrap.appendChild(row);
    });
  });

  // project target selector — reuse quick-add project select list at bottom via a select injected once
  if(!$('#tdTargetProject')){
    const sel = document.createElement('select');
    sel.id = 'tdTargetProject';
    sel.className = 'qa-select';
    sel.style.marginTop = '10px';
    wrap.parentElement.insertBefore(sel, wrap);
  }
  $('#tdTargetProject').innerHTML = state.projects.map(p => `<option value="${p.id}">→ ${escapeHtml(p.name)}</option>`).join('') || '<option disabled>No tracks yet</option>';
}

$('#tdImportSelected').addEventListener('click', () => {
  const targetSel = $('#tdTargetProject');
  const projectId = targetSel ? targetSel.value : null;
  if(!projectId){ toast('Create a track to import into first'); return; }
  const kind = $('#tdImportKind').value;
  const checked = $$('.imp-check:checked', $('#tdImportList'));
  if(!checked.length){ toast('Select at least one task'); return; }

  checked.forEach(chk => {
    const taskId = chk.dataset.taskId;
    const item = todoistCache.tasks.find(t => t.taskId === taskId);
    if(!item) return;
    state.entries.push({
      id: uid(), projectId, kind, title: item.content,
      date: item.date || null,
      notes: item.description || '',
      code: null,
      links: item.url ? [{ label:'Todoist task', url:item.url }] : [],
      order: nextOrder(projectId), createdAt: Date.now()
    });
  });
  saveState();
  renderAll();
  closeModal('modalTodoist');
  toast(`Imported ${checked.length} task(s)`);
});

/* ============ WHEEL → HORIZONTAL SCROLL (rails view) ============ */
$('#board').addEventListener('wheel', (e) => {
  if(state.ui.view === 'list') return; // list view scrolls vertically as normal
  const board = e.currentTarget;
  if(board.scrollWidth <= board.clientWidth) return; // nothing to scroll
  // Trackpads already send meaningful deltaX; only hijack when the gesture is
  // predominantly vertical (a plain mouse wheel).
  if(Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
  e.preventDefault();
  board.scrollLeft += e.deltaY;
}, { passive: false });

/* ============ INIT ============ */
$('#btnList').textContent = state.ui.view === 'list' ? '▤ Rails' : '☰ List';
renderAll();