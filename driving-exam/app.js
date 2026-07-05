/* =========================================================
   汽車筆試題庫 · 練習頁面
   資料由 database.json / images.json 以 fetch() 載入
   （需以 http/https 提供，例如本機伺服器或 GitHub Pages）
   作答紀錄保存在瀏覽器 localStorage
   ========================================================= */

const STORAGE_KEY = "traffic_quiz_stats_v1";

let DB = [];
let DB_BY_ID = {};
let IMAGE_DATA = {};
let STRUCTURES = [];
let CATEGORIES = [];
let stats = loadStats();

const el = (id) => document.getElementById(id);

/* ---------------- localStorage ---------------- */
function loadStats() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
  catch (e) { return {}; }
}
function saveStats() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
}

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
  gReview.label = "複習";
  const optReview = document.createElement("option");
  optReview.value = "review";
  const rc = reviewCount();
  optReview.textContent = `只考答錯過的題目（${rc} 題）`;
  if (rc === 0) optReview.disabled = true;
  gReview.appendChild(optReview);
  sel.appendChild(gReview);
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
  answered = false;

  el("q-index").textContent = session.index + 1;
  el("q-total").textContent = session.queue.length;
  el("progress-fill").style.width = Math.round((session.index / session.queue.length) * 100) + "%";
  el("score-correct").textContent = session.correct;
  el("score-wrong").textContent = session.wrong;
  el("q-category").textContent = q.category;

  const wasWrong = stats[q.id] && stats[q.id].needsReview;
  el("q-review-flag").classList.toggle("hidden", !wasWrong);

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

init();
