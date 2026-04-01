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
  const sleepRec = dayItems.find(x=>x.type==="sleep" && typeof x.sleepHours==="number");
  if (sleepRec) return sleepRec.sleepHours;
  const diaryWithSleep = dayItems.find(x=>x.type==="diary" && typeof x.health?.sleepHours==="number");
  return diaryWithSleep ? diaryWithSleep.health.sleepHours : null;
}
function makeBadge(text){
  const div = document.createElement("div");
  div.className = "badge";
  div.textContent = text;
  return div;
}

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

async function deleteById(id){
  if (!confirm("この記録を削除しますか？")) return;
  const hist = loadHistory();
  const next = hist.filter(x=>x.id !== id);
  saveHistory(next);
  try{
    if (window.VLT_SYNC?.pushOnce) await window.VLT_SYNC.pushOnce("calendar_delete");
  }catch(e){
    console.warn(e);
  }
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
  while (cells.length < 42){
    const lastCellDate = parseISO(cells[cells.length-1].date);
    const d = new Date(lastCellDate.getFullYear(), lastCellDate.getMonth(), lastCellDate.getDate()+1);
    cells.push({ date: isoDate(d), dayNum: d.getDate(), muted: true });
  }

  calBody.innerHTML = "";
  const today = isoDate(new Date());

  for (let r=0;r<6;r++){
    const tr = document.createElement("tr");
    for (let c=0;c<7;c++){
      const cell = cells[r*7+c];
      const td = document.createElement("td");
      if (cell.muted) td.classList.add("muted");
      if (cell.date === today) td.classList.add("today");
      if (selected && cell.date === selected) td.classList.add("selected");

      const items = byDate.get(cell.date) || [];
      if (items.length) td.classList.add("hasData");

      const dayNum = document.createElement("div");
      dayNum.className = "day-num";
      dayNum.textContent = String(cell.dayNum);

      const dot = document.createElement("div");
      dot.className = "dot";

      const badges = document.createElement("div");
      badges.className = "badges";
      if (items.length){
        const diaryCount = items.filter(x=>x.type==="diary").length;
        const sleepCount = items.filter(x=>x.type==="sleep").length;
        const profileCount = items.filter(x=>x.type==="profile").length;
        const money = moneySumForDay(items);
        const sleepH = sleepHoursForDay(items);

        if (diaryCount) badges.appendChild(makeBadge(`日記 ${diaryCount}`));
        if (sleepCount) badges.appendChild(makeBadge(`睡眠 ${sleepCount}`));
        if (profileCount) badges.appendChild(makeBadge(`要約 ${profileCount}`));
        if (money > 0) badges.appendChild(makeBadge(`支出 ${formatYen(money)}`));
        if (sleepH != null) badges.appendChild(makeBadge(`睡眠 ${sleepH}h`));
      }

      td.appendChild(dayNum);
      td.appendChild(dot);
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
    dayDetail.className = "hint";
    dayDetail.textContent = "この日の記録はありません。";
    return;
  }

  const wrap = document.createElement("div");

  items.forEach(it=>{
    const card = document.createElement("div");
    card.className = "card";
    card.style.marginTop = "10px";

    const meta = document.createElement("div");
    meta.className = "card-meta";
    const left = document.createElement("div");
    left.textContent = it.type === "sleep" ? "睡眠" : (it.type==="profile" ? "要約" : "日記");
    const right = document.createElement("div");
    right.textContent = it.savedAt ? new Date(it.savedAt).toLocaleString() : "";
    meta.appendChild(left);
    meta.appendChild(right);

    const title = document.createElement("div");
    title.className = "card-title";

    if (it.type === "sleep"){
      title.textContent = `睡眠：${it.sleepHours ?? "?"}h（動き:${it.moveCount ?? 0}）`;
    } else if (it.type === "profile"){
      title.textContent = `あなたの要約（この時点）`;
    } else {
      const money = (it.finance?.expenses || []).reduce((a,x)=>a+(Number(x.amount)||0),0);
      const sleepH = (typeof it.health?.sleepHours==="number") ? it.health.sleepHours : null;
      const sy = Array.isArray(it.health?.symptoms) ? it.health.symptoms.join(" / ") : "";
      title.textContent = `支出 ${formatYen(money)} / 睡眠 ${sleepH!=null? sleepH+"h":"未入力"} ${sy? " / 体調: "+sy:""}`;
    }

    const text = document.createElement("div");
    text.className = "card-text";
    if (it.type === "sleep"){
      text.textContent = `開始: ${it.startAt ? new Date(it.startAt).toLocaleString() : "?"}\n終了: ${it.endAt ? new Date(it.endAt).toLocaleString() : "?"}`;
    } else if (it.type === "profile"){
      text.textContent = (it.profileText || "").trim() || "（本文なし）";
    } else {
      text.textContent = (it.cleanTranscript || it.rawTranscript || "").trim() || "（本文なし）";
    }

    const actions = document.createElement("div");
    actions.className = "row";
    actions.style.justifyContent = "flex-end";
    actions.style.marginTop = "10px";

    const del = document.createElement("button");
    del.className = "btn-ghost btn-danger";
    del.type = "button";
    del.textContent = "削除";
    del.addEventListener("click", (ev)=>{
      ev.stopPropagation();
      deleteById(it.id);
    });

    actions.appendChild(del);

    card.appendChild(meta);
    card.appendChild(title);
    card.appendChild(text);
    card.appendChild(actions);

    wrap.appendChild(card);
  });

  dayDetail.className = "";
  dayDetail.innerHTML = "";
  dayDetail.appendChild(wrap);
}

// controls
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
  if (window.VLT_SYNC) await window.VLT_SYNC.pullOnce("calendar_refresh");
  rebuildIndex();
  renderCalendar();
  if (selected) renderDayDetail(selected);
});
yearSelect.addEventListener("change", ()=>{
  setCursor(Number(yearSelect.value), Number(monthSelect.value));
  renderCalendar();
});
monthSelect.addEventListener("change", ()=>{
  setCursor(Number(yearSelect.value), Number(monthSelect.value));
  renderCalendar();
});

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
