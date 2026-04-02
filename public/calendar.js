/* =========================================
 * 1. データストア・ユーティリティ
 * ========================================= */
const HISTORY_KEY = "vlt_history_v5";

function loadHistory(){ try{return JSON.parse(localStorage.getItem(HISTORY_KEY)||"[]");}catch{return[];} }
function saveHistory(items){ localStorage.setItem(HISTORY_KEY, JSON.stringify(items)); }

function isoDate(d){
  const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,"0");
  const day=String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function parseISO(s){
  const [y,m,d] = String(s||"").split("-").map(Number);
  if(!y||!m||!d) return null;
  return new Date(y, m-1, d);
}
function formatYen(n){ return `¥${Number(n||0).toLocaleString()}`; }

function moneySumForDay(dayItems){
  let sum = 0;
  for (const it of dayItems){
    if (it.type === "diary"){
      const ex = it.finance?.expenses || [];
      sum += ex.reduce((a,x)=>a+(Number(x.amount)||0),0);
    }
  }
  return sum;
}
function sleepHoursForDay(dayItems){
  const diaryWithSleep = dayItems.find(x=>x.type==="diary" && typeof x.health?.sleepHours==="number");
  return diaryWithSleep ? diaryWithSleep.health.sleepHours : null;
}
function makeBadge(text){
  const div = document.createElement("div");
  div.className = "badge";
  div.textContent = text;
  return div;
}

/* =========================================
 * 2. DOM取得と状態管理
 * ========================================= */
const calBody = document.getElementById("calBody");
const yearSelect = document.getElementById("yearSelect");
const monthSelect = document.getElementById("monthSelect");
const btnPrev = document.getElementById("btnPrev");
const btnNext = document.getElementById("btnNext");
const btnToday = document.getElementById("btnToday");
const btnRefresh = document.getElementById("btnRefresh");

const selectedDateLabel = document.getElementById("selectedDateLabel");
const dayDetail = document.getElementById("dayDetail");

let history = [];
let byDate = new Map();
let cursor = new Date();
let selected = null;

/* =========================================
 * 3. インデックス作成と補助関数
 * ========================================= */
function rebuildIndex(){
  history = loadHistory().slice().sort((a,b)=>(b.savedAt||0)-(a.savedAt||0));
  byDate = new Map();
  for (const it of history){
    const d = it.date || null;
    if (!d) continue;
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d).push(it);
  }
}

function ensureSelectOptions(){
  const now = new Date();
  const yNow = now.getFullYear();
  yearSelect.innerHTML = "";
  for (let y = yNow - 5; y <= yNow + 5; y++){
    const opt = document.createElement("option");
    opt.value = String(y);
    opt.textContent = `${y}年`;
    yearSelect.appendChild(opt);
  }
  monthSelect.innerHTML = "";
  for (let m=1;m<=12;m++){
    const opt = document.createElement("option");
    opt.value = String(m);
    opt.textContent = `${m}月`;
    monthSelect.appendChild(opt);
  }
}

function setCursor(y, m1to12){
  cursor = new Date(y, m1to12-1, 1);
  yearSelect.value = String(y);
  monthSelect.value = String(m1to12);
}

/* =========================================
 * 4. データの削除とカレンダー描画
 * ========================================= */
async function deleteById(id){
  if (!confirm("この記録を削除しますか？")) return;
  
  // 1. 現在の履歴を取得し、対象を消す
  const hist = loadHistory();
  const next = hist.filter(x => x.id !== id);
  
  // 2. ローカルに保存
  saveHistory(next);
  
  if (window.VLT_SYNC) {
    try {
      // 第一引数に最新のデータリスト(next)を渡すのがポイント
      await window.VLT_SYNC.pushOnce(next, "calendar_delete");
    } catch(e) {
      console.warn("同期失敗:", e);
    }
  }
  
  // 4. 画面を再描画
  rebuildIndex();
  renderCalendar();
  if (selected) renderDayDetail(selected);
}

function renderCalendar(){
  const y = cursor.getFullYear();
  const m = cursor.getMonth();
  const first = new Date(y, m, 1);
  const last = new Date(y, m+1, 0);
  const startDow = first.getDay();
  const daysInMonth = last.getDate();

  const cells = [];
  const prevLast = new Date(y, m, 0).getDate();
  for (let i=0;i<startDow;i++){
    const day = prevLast - (startDow - 1 - i);
    const d = new Date(y, m-1, day);
    cells.push({ date: isoDate(d), dayNum: day, muted: true });
  }
  for (let day=1; day<=daysInMonth; day++){
    const d = new Date(y, m, day);
    cells.push({ date: isoDate(d), dayNum: day, muted: false });
  }
  while (cells.length % 7 !== 0) {
    const d = new Date(y, m, daysInMonth + (cells.length - (startDow + daysInMonth)) + 1);
    cells.push({ date: isoDate(d), dayNum: d.getDate(), muted: true });
  }

  calBody.innerHTML = "";
  const today = isoDate(new Date());

  for (let r=0; r < Math.ceil(cells.length / 7); r++){
    const tr = document.createElement("tr");
    for (let c=0;c<7;c++){
      const cell = cells[r*7+c];
      if (!cell) break;
      const td = document.createElement("td");
      if (cell.muted) td.classList.add("muted");
      if (cell.date === today) td.classList.add("today");
      if (selected && cell.date === selected) td.classList.add("selected");

      const items = byDate.get(cell.date) || [];
      if (items.length) td.classList.add("hasData");

      const dayNum = document.createElement("div");
      dayNum.className = "day-num";
      dayNum.textContent = String(cell.dayNum);

      const badges = document.createElement("div");
      badges.className = "badges";
      if (items.length){
        const diaryCount = items.filter(x=>x.type==="diary").length;
        const money = moneySumForDay(items);
        const sleepH = sleepHoursForDay(items);

        if (diaryCount) badges.appendChild(makeBadge(`日記 ${diaryCount}`));
        if (money > 0) badges.appendChild(makeBadge(`${formatYen(money)}`));
        if (sleepH != null) badges.appendChild(makeBadge(`${sleepH}h`));
      }

      td.appendChild(dayNum);
      td.appendChild(badges);
      td.addEventListener("click", ()=>{
        selected = cell.date;
        renderCalendar();
        renderDayDetail(cell.date);
      });
      tr.appendChild(td);
    }
    calBody.appendChild(tr);
  }
}

function renderDayDetail(dateStr){
  selectedDateLabel.textContent = dateStr;
  const items = (byDate.get(dateStr) || []).slice().sort((a,b)=>(b.savedAt||0)-(a.savedAt||0));

  if (!items.length){
    dayDetail.innerHTML = `<div class="hint">この日の記録はありません。</div>`;
    return;
  }

  dayDetail.innerHTML = "";
  items.forEach(it=>{
    const card = document.createElement("div");
    card.className = "card";
    
    const typeLabel = it.type === "profile" ? "要約" : "日記";
    const timeStr = it.savedAt ? new Date(it.savedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "";

    let contentHtml = "";
    if (it.type === "diary") {
      const money = (it.finance?.expenses || []).reduce((a,x)=>a+(Number(x.amount)||0),0);
      const sleepH = it.health?.sleepHours || "-";
      const sy = Array.isArray(it.health?.symptoms) ? it.health.symptoms.join(", ") : "";
      contentHtml = `
        <div class="card-title">${typeLabel} (${timeStr})</div>
        <div class="card-meta">支出: ${formatYen(money)} / 睡眠: ${sleepH}h</div>
        ${sy ? `<div class="card-meta">体調: ${sy}</div>` : ""}
        <div class="card-text">${(it.cleanTranscript || it.rawTranscript || "").trim()}</div>
      `;
    } else {
      contentHtml = `
        <div class="card-title">${typeLabel} (${timeStr})</div>
        <div class="card-text">${(it.profileText || "").trim()}</div>
      `;
    }

    card.innerHTML = contentHtml;

    const actions = document.createElement("div");
    actions.className = "row";
    actions.style.justifyContent = "flex-end";
    actions.style.marginTop = "10px";

    const del = document.createElement("button");
    del.className = "btn-ghost btn-danger";
    del.textContent = "削除";
    del.onclick = () => deleteById(it.id);

    actions.appendChild(del);
    card.appendChild(actions);
    dayDetail.appendChild(card);
  });
}

/* =========================================
 * 5. イベントリスナーと初期化
 * ========================================= */
btnPrev.addEventListener("click", ()=>{
  const d = new Date(cursor.getFullYear(), cursor.getMonth()-1, 1);
  setCursor(d.getFullYear(), d.getMonth()+1);
  renderCalendar();
});
btnNext.addEventListener("click", ()=>{
  const d = new Date(cursor.getFullYear(), cursor.getMonth()+1, 1);
  setCursor(d.getFullYear(), d.getMonth()+1);
  renderCalendar();
});
btnToday.addEventListener("click", ()=>{
  const d = new Date();
  setCursor(d.getFullYear(), d.getMonth()+1);
  selected = isoDate(d);
  renderCalendar();
  renderDayDetail(selected);
});
btnRefresh.addEventListener("click", async ()=>{
  if (window.VLT_SYNC) {
    await window.VLT_SYNC.pullOnce("calendar_refresh");
    rebuildIndex();
    renderCalendar();
    if (selected) renderDayDetail(selected);
  }
});

// 初期化
(async ()=>{
  ensureSelectOptions();
  if (window.VLT_SYNC){
    window.VLT_SYNC.start();
    await window.VLT_SYNC.pullOnce("calendar_init");
  }
  rebuildIndex();
  const d = new Date();
  setCursor(d.getFullYear(), d.getMonth()+1);
  selected = isoDate(d);
  renderCalendar();
  renderDayDetail(selected);
})();