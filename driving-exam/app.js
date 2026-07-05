/* =========================================================
   汽車筆試題庫 · 練習頁面
   資料由 database.json / images.json 以 fetch() 載入
   （需以 http/https 提供，例如本機伺服器或 GitHub Pages）
   作答紀錄保存在瀏覽器 localStorage
   ========================================================= */

const STORAGE_KEY = "traffic_quiz_stats_v1";
const BOOKMARK_KEY = "traffic_quiz_bookmarks_v1";
const THEME_KEY = "quiz_theme_v1";

let DB = [];
let DB_BY_ID = {};
let IMAGE_DATA = {};
let STRUCTURES = [];
let CATEGORIES = [];
let stats = loadStats();
let bookmarks = loadBookmarks();
let currentQuestion = null;
let listViewIds = [];
let listViewType = null;
let quizWasOpenBeforeList = false;

const el = (id) => document.getElementById(id);

/* ---------------- localStorage：作答紀錄 ---------------- */
function loadStats() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
  catch (e) { return {}; }
}
function saveStats() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
}

/* ---------------- localStorage：收藏題目 ---------------- */
function loadBookmarks() {
  try { return JSON.parse(localStorage.getItem(BOOKMARK_KEY)) || {}; }
  catch (e) { return {}; }
}
function saveBookmarks() {
  localStorage.setItem(BOOKMARK_KEY, JSON.stringify(bookmarks));
}
function isBookmarked(id) { return !!bookmarks[id]; }
function toggleBookmark(id) {
  if (bookmarks[id]) delete bookmarks[id];
  else bookmarks[id] = true;
  saveBookmarks();
}
function bookmarkCount() { return Object.keys(bookmarks).filter(id => bookmarks[id]).length; }

/* ---------------- 小工具 ---------------- */
function uniqueInOrder(arr) {
  const seen = new Set(), out = [];
  for (const v of arr) if (!seen.has(v)) { seen.add(v); out.push(v); }
  return out;
}
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
function reviewCount() {
  return DB.filter(q => stats[q.id] && stats[q.id].needsReview).length;
}
function poolForValue(value) {
  if (value === "all") return DB;
  if (value === "review") return DB.filter(q => stats[q.id] && stats[q.id].needsReview);
  if (value === "bookmark") return DB.filter(q => isBookmarked(q.id));
  const [type, ...rest] = value.split(":");
  const name = rest.join(":");
  if (type === "structure") return DB.filter(q => q.structure === name);
  if (type === "category") return DB.filter(q => q.category === name);
  return DB;
}

/* =========================================================
   載入資料
   ========================================================= */
async function init() {
  try {
    const [dbRes, imgRes] = await Promise.all([fetch("database.json"), fetch("images.json")]);
    if (!dbRes.ok) throw new Error("database.json 載入失敗 (HTTP " + dbRes.status + ")");
    if (!imgRes.ok) throw new Error("images.json 載入失敗 (HTTP " + imgRes.status + ")");
    DB = await dbRes.json();
    IMAGE_DATA = await imgRes.json();
    DB_BY_ID = Object.fromEntries(DB.map(q => [q.id, q]));
    STRUCTURES = uniqueInOrder(DB.map(q => q.structure));
    CATEGORIES = uniqueInOrder(DB.map(q => q.category));

    el("stat-total").textContent = DB.length;
    buildScopeSelect();
    renderLifetimeBar();
    el("app").classList.remove("hidden");
  } catch (err) {
    console.error(err);
    el("load-message").textContent =
      "題庫載入失敗：" + err.message + "。若你是直接雙擊開啟 index.html，瀏覽器會擋下本機檔案的讀取；" +
      "請改用簡易本機伺服器開啟（在此資料夾執行 python3 -m http.server，再開啟 http://localhost:8000），" +
      "或把整個資料夾放到 GitHub Pages 之類的網頁空間。";
  }
}

function buildScopeSelect() {
  const sel = el("scope-select");
  const previousValue = sel.value || "all";
  sel.innerHTML = "";

  const optAll = document.createElement("option");
  optAll.value = "all";
  optAll.textContent = `全部題目（${DB.length} 題）`;
  sel.appendChild(optAll);

  const gStruct = document.createElement("optgroup");
  gStruct.label = "依架構";
  STRUCTURES.forEach(name => {
    const n = DB.filter(q => q.structure === name).length;
    const opt = document.createElement("option");
    opt.value = "structure:" + name;
    opt.textContent = `${name}（${n} 題）`;
    gStruct.appendChild(opt);
  });
  sel.appendChild(gStruct);

  const gCat = document.createElement("optgroup");
  gCat.label = "依分類";
  CATEGORIES.forEach(name => {
    const n = DB.filter(q => q.category === name).length;
    const opt = document.createElement("option");
    opt.value = "category:" + name;
    opt.textContent = `${name}（${n} 題）`;
    gCat.appendChild(opt);
  });
  sel.appendChild(gCat);

  const gReview = document.createElement("optgroup");
  gReview.label = "複習與收藏";

  const optReview = document.createElement("option");
  optReview.value = "review";
  const rc = reviewCount();
  optReview.textContent = `只考答錯過的題目（${rc} 題）`;
  if (rc === 0) optReview.disabled = true;
  gReview.appendChild(optReview);

  const optBookmark = document.createElement("option");
  optBookmark.value = "bookmark";
  const bc = bookmarkCount();
  optBookmark.textContent = `只練習已收藏的題目（${bc} 題）`;
  if (bc === 0) optBookmark.disabled = true;
  gReview.appendChild(optBookmark);

  sel.appendChild(gReview);

  const stillExists = Array.from(sel.options).some(o => o.value === previousValue && !o.disabled);
  sel.value = stillExists ? previousValue : "all";
}

function renderLifetimeBar() {
  const ids = Object.keys(stats);
  const attempted = ids.filter(id => stats[id].seen > 0).length;
  let correct = 0, wrong = 0;
  ids.forEach(id => { correct += stats[id].correct || 0; wrong += stats[id].wrong || 0; });
  const acc = (correct + wrong) > 0 ? Math.round((correct / (correct + wrong)) * 100) + "%" : "--";
  el("lt-attempted").textContent = attempted;
  el("lt-accuracy").textContent = acc;
  el("lt-review").textContent = reviewCount();
  el("lt-bookmarks").textContent = bookmarkCount();
  el("wrong-count").textContent = reviewCount();
  el("bookmark-count").textContent = bookmarkCount();
}

el("reset-btn").addEventListener("click", () => {
  if (confirm("確定要清除全部作答紀錄嗎？此動作無法復原。")) {
    stats = {};
    saveStats();
    renderLifetimeBar();
    buildScopeSelect();
  }
});

/* =========================================================
   測驗流程（在同一頁面切換區塊，不做整頁畫面切換）
   ========================================================= */
let session = null;
let answered = false;

function startSession(idsOverride) {
  let ids;
  if (idsOverride) {
    ids = shuffle(idsOverride);
  } else {
    const value = el("scope-select").value;
    const pool = poolForValue(value).map(q => q.id);
    if (pool.length === 0) {
      alert("這個範圍目前沒有題目可以練習。");
      return;
    }
    const countValue = el("count-select").value;
    const n = countValue === "all" ? pool.length : Math.min(Number(countValue), pool.length);
    ids = shuffle(pool).slice(0, n);
  }
  session = { queue: ids, index: 0, correct: 0, wrong: 0, wrongIds: [] };
  el("summary").classList.add("hidden");
  el("quiz").classList.remove("hidden");
  renderQuestion();
  el("quiz").scrollIntoView({ behavior: "smooth", block: "start" });
}

el("start-btn").addEventListener("click", () => startSession());

function renderQuestion() {
  const q = DB_BY_ID[session.queue[session.index]];
  currentQuestion = q;
  answered = false;

  el("q-index").textContent = session.index + 1;
  el("q-total").textContent = session.queue.length;
  el("progress-fill").style.width = Math.round((session.index / session.queue.length) * 100) + "%";
  el("score-correct").textContent = session.correct;
  el("score-wrong").textContent = session.wrong;
  el("q-category").textContent = q.category;

  const wasWrong = stats[q.id] && stats[q.id].needsReview;
  el("q-review-flag").classList.toggle("hidden", !wasWrong);

  const bookmarkBtn = el("bookmark-toggle");
  const isBm = isBookmarked(q.id);
  bookmarkBtn.textContent = isBm ? "★" : "☆";
  bookmarkBtn.setAttribute("aria-pressed", String(isBm));

  const imgWrap = el("q-image-wrap");
  if (q.has_image) {
    el("q-image").src = IMAGE_DATA[q.image_file] || "";
    el("q-image").alt = "第 " + q.id + " 題附圖";
    imgWrap.classList.remove("hidden");
  } else {
    imgWrap.classList.add("hidden");
  }

  const qtext = el("q-text");
  qtext.textContent = q.question;

  const choicesWrap = el("choices");
  choicesWrap.innerHTML = "";
  ["1", "2", "3"].forEach(num => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "choice-btn";
    btn.dataset.num = num;
    const text = q.choices[num] || (q.has_image ? "（如圖所示）" : "");
    btn.innerHTML = `<span class="choice-num">${num}</span><span>${escapeHtml(text)}</span>`;
    btn.addEventListener("click", () => handleAnswer(q, Number(num)));
    choicesWrap.appendChild(btn);
  });

  el("next-btn").disabled = true;
  el("next-btn").textContent = (session.index === session.queue.length - 1) ? "查看結果" : "下一題";
}

function handleAnswer(q, selectedNum) {
  if (answered) return;
  answered = true;
  const correctNum = q.answer;
  const isCorrect = selectedNum === correctNum;

  document.querySelectorAll(".choice-btn").forEach(b => {
    b.disabled = true;
    const n = Number(b.dataset.num);
    if (n === correctNum) b.classList.add("is-correct");
    else if (n === selectedNum) b.classList.add("is-wrong");
    else b.classList.add("is-muted");
  });

  if (!stats[q.id]) stats[q.id] = { seen: 0, correct: 0, wrong: 0, needsReview: false };
  stats[q.id].seen += 1;
  if (isCorrect) {
    stats[q.id].correct += 1;
    stats[q.id].needsReview = false;
    session.correct += 1;
  } else {
    stats[q.id].wrong += 1;
    stats[q.id].needsReview = true;
    session.wrong += 1;
    session.wrongIds.push(q.id);
  }
  saveStats();

  el("score-correct").textContent = session.correct;
  el("score-wrong").textContent = session.wrong;
  el("next-btn").disabled = false;
}

el("next-btn").addEventListener("click", () => {
  if (el("next-btn").disabled) return;
  if (session.index < session.queue.length - 1) {
    session.index += 1;
    renderQuestion();
  } else {
    el("progress-fill").style.width = "100%";
    showSummary();
  }
});

document.addEventListener("keydown", (e) => {
  if (el("quiz").classList.contains("hidden")) return;
  if (["1", "2", "3"].includes(e.key) && !answered) {
    const btn = document.querySelector(`.choice-btn[data-num="${e.key}"]`);
    if (btn) btn.click();
  } else if ((e.key === "Enter" || e.key === "ArrowRight" || e.key === " ") && !el("next-btn").disabled) {
    e.preventDefault();
    el("next-btn").click();
  }
});

function showSummary() {
  const total = session.queue.length;
  el("summary-score").textContent = `${session.correct} / ${total}`;
  const acc = total > 0 ? Math.round((session.correct / total) * 100) : 0;
  el("summary-sub").textContent = "正確率 " + acc + "%";
  el("summary-title").textContent = acc === 100 ? "本回合結束・全對！" : "本回合結束";

  const wrongList = el("wrong-list");
  wrongList.innerHTML = "";
  if (session.wrongIds.length === 0) {
    wrongList.innerHTML = `<span class="wrong-empty">這回合沒有答錯的題目 🎉</span>`;
    el("review-wrong-btn").classList.add("hidden");
  } else {
    el("review-wrong-btn").classList.remove("hidden");
    session.wrongIds.forEach(id => {
      const chip = document.createElement("span");
      chip.className = "wrong-chip";
      chip.textContent = "#" + id;
      wrongList.appendChild(chip);
    });
  }

  el("quiz").classList.add("hidden");
  el("summary").classList.remove("hidden");
  renderLifetimeBar();
  buildScopeSelect();
  el("summary").scrollIntoView({ behavior: "smooth", block: "start" });
}

el("review-wrong-btn").addEventListener("click", () => {
  startSession(session.wrongIds.slice());
});
el("restart-btn").addEventListener("click", () => {
  el("summary").classList.add("hidden");
  document.querySelector(".toolbar").scrollIntoView({ behavior: "smooth", block: "start" });
});

el("bookmark-toggle").addEventListener("click", () => {
  if (!currentQuestion) return;
  toggleBookmark(currentQuestion.id);
  const isBm = isBookmarked(currentQuestion.id);
  el("bookmark-toggle").textContent = isBm ? "★" : "☆";
  el("bookmark-toggle").setAttribute("aria-pressed", String(isBm));
  el("lt-bookmarks").textContent = bookmarkCount();
  el("bookmark-count").textContent = bookmarkCount();
});

/* =========================================================
   深色模式
   ========================================================= */
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_KEY, theme);
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.setAttribute("content", theme === "dark" ? "#15171a" : "#1e7b45");
}
el("theme-toggle").addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
  applyTheme(current === "dark" ? "light" : "dark");
});

/* =========================================================
   清單瀏覽：答錯待複習 ／ 已收藏題目
   ========================================================= */
function currentListPool() {
  if (listViewType === "wrong") return DB.filter(q => stats[q.id] && stats[q.id].needsReview);
  if (listViewType === "bookmark") return DB.filter(q => isBookmarked(q.id));
  return [];
}

function openListView(type) {
  listViewType = type;
  quizWasOpenBeforeList = !el("quiz").classList.contains("hidden");
  el("quiz").classList.add("hidden");
  el("summary").classList.add("hidden");
  el("list-view-title").textContent = type === "wrong" ? "答錯待複習" : "已收藏題目";
  renderListView();
  el("list-view").classList.remove("hidden");
  el("list-view").scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderListView() {
  const pool = currentListPool();
  listViewIds = pool.map(q => q.id);
  const wrap = el("list-view-items");
  wrap.innerHTML = "";

  el("list-view-empty").classList.toggle("hidden", pool.length > 0);
  el("list-view-practice-btn").classList.toggle("hidden", pool.length === 0);

  pool.forEach(q => {
    const card = document.createElement("div");
    card.className = "list-item";

    const head = document.createElement("div");
    head.className = "list-item-head";
    head.innerHTML = `<span class="quiz-category">${escapeHtml(q.category)}</span><span>#${q.id}</span>`;
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "list-item-remove";
    removeBtn.textContent = listViewType === "wrong" ? "標記已掌握" : "取消收藏";
    removeBtn.addEventListener("click", () => {
      if (listViewType === "wrong") {
        if (stats[q.id]) stats[q.id].needsReview = false;
        saveStats();
      } else {
        toggleBookmark(q.id);
      }
      renderListView();
      renderLifetimeBar();
      buildScopeSelect();
    });
    head.appendChild(removeBtn);
    card.appendChild(head);

    if (q.has_image) {
      const fig = document.createElement("div");
      fig.className = "list-item-image";
      const img = document.createElement("img");
      img.src = IMAGE_DATA[q.image_file] || "";
      img.alt = "第 " + q.id + " 題附圖";
      fig.appendChild(img);
      card.appendChild(fig);
    }

    if (q.question) {
      const p = document.createElement("p");
      p.className = "list-item-text";
      p.textContent = q.question;
      card.appendChild(p);
    }

    const choicesWrap = document.createElement("div");
    choicesWrap.className = "list-item-choices";
    ["1", "2", "3"].forEach(num => {
      const row = document.createElement("div");
      row.className = "list-item-choice" + (Number(num) === q.answer ? " is-answer" : "");
      const text = q.choices[num] || (q.has_image ? "（如圖所示）" : "");
      row.textContent = `${num}. ${text}`;
      choicesWrap.appendChild(row);
    });
    card.appendChild(choicesWrap);

    wrap.appendChild(card);
  });
}

el("open-wrong-btn").addEventListener("click", () => openListView("wrong"));
el("open-bookmarks-btn").addEventListener("click", () => openListView("bookmark"));
el("list-view-close").addEventListener("click", () => {
  el("list-view").classList.add("hidden");
  if (quizWasOpenBeforeList) el("quiz").classList.remove("hidden");
});
el("list-view-practice-btn").addEventListener("click", () => {
  if (listViewIds.length === 0) return;
  el("list-view").classList.add("hidden");
  startSession(listViewIds.slice());
});

init();