const HISTORY_KEY = "vlt_history_v5";

function loadHistory(){ try{return JSON.parse(localStorage.getItem(HISTORY_KEY)||"[]");}catch{return[];} }
function saveHistory(items){ localStorage.setItem(HISTORY_KEY, JSON.stringify(items)); }
function isoDate(d){
  const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,"0");
  const day=String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}

const sleepDate = document.getElementById("sleepDate");
const btnSync = document.getElementById("btnSync");

const btnStart = document.getElementById("btnStart");
const btnStop = document.getElementById("btnStop");
const timerEl = document.getElementById("timer");
const stateText = document.getElementById("stateText");
const moveCountEl = document.getElementById("moveCount");
const saveMsg = document.getElementById("saveMsg");

let startAt = null;
let timerId = null;

let moveCount = 0;
let lastMoveAt = 0;

// 閾値（簡易）：大きく動いたら1回
const THRESHOLD = 14;      // 加速度の目安（環境で差あり）
const COOLDOWN_MS = 1200;  // 連続カウント抑制

function fmtTime(ms){
  const s = Math.max(0, Math.floor(ms/1000));
  const hh = String(Math.floor(s/3600)).padStart(2,"0");
  const mm = String(Math.floor((s%3600)/60)).padStart(2,"0");
  const ss = String(s%60).padStart(2,"0");
  return `${hh}:${mm}:${ss}`;
}

function onMotion(e){
  const a = e.accelerationIncludingGravity;
  if (!a) return;
  const x = a.x || 0, y = a.y || 0, z = a.z || 0;
  const mag = Math.sqrt(x*x + y*y + z*z);
  const now = Date.now();
  if (mag >= THRESHOLD && (now - lastMoveAt) > COOLDOWN_MS){
    moveCount += 1;
    lastMoveAt = now;
    moveCountEl.textContent = String(moveCount);
  }
}

function start(){
  if (startAt) return;
  startAt = Date.now();
  moveCount = 0;
  lastMoveAt = 0;
  moveCountEl.textContent = "0";
  saveMsg.textContent = "";

  stateText.textContent = "計測中（スマホを置いて寝てください）";
  btnStart.disabled = true;
  btnStop.disabled = false;

  timerId = setInterval(()=>{
    timerEl.textContent = fmtTime(Date.now() - startAt);
  }, 500);

  // iOS等は許可が必要な場合あり
  window.addEventListener("devicemotion", onMotion, { passive:true });
}

async function stopAndSave(){
  if (!startAt) return;
  const endAt = Date.now();
  const durationMs = endAt - startAt;
  const sleepHours = Math.round((durationMs / 3600000) * 10) / 10; // 小数1桁

  clearInterval(timerId);
  timerId = null;

  window.removeEventListener("devicemotion", onMotion);

  const date = sleepDate.value || isoDate(new Date(startAt));
  const item = {
    id: (crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + "_" + Math.random()),
    type: "sleep",
    date,
    savedAt: Date.now(),
    startAt,
    endAt,
    sleepHours,
    moveCount
  };

  const hist = loadHistory();
  hist.push(item);
  saveHistory(hist);

  try{
    if (window.VLT_SYNC?.pushOnce) await window.VLT_SYNC.pushOnce("sleep_save");
  }catch(e){
    console.warn("pushOnce not available / failed:", e);
  }

  startAt = null;
  stateText.textContent = "停止中";
  timerEl.textContent = "00:00:00";
  btnStart.disabled = false;
  btnStop.disabled = true;

  saveMsg.textContent = `保存しました（${date} / ${sleepHours}h）`;
}

btnStart.addEventListener("click", async ()=>{
  // iOS向け：許可要求
  if (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function"){
    try{
      const res = await DeviceMotionEvent.requestPermission();
      if (res !== "granted"){
        alert("加速度の許可が必要です。設定で許可してから再度お試しください。");
        return;
      }
    }catch(e){
      console.error(e);
      alert("加速度の許可に失敗しました。");
      return;
    }
  }
  start();
});
btnStop.addEventListener("click", stopAndSave);

btnSync.addEventListener("click", async ()=>{
  try{
    if (window.VLT_SYNC) await window.VLT_SYNC.pullOnce("sleep_manual_sync");
    alert("更新しました（同期）。");
  }catch(e){
    console.error(e);
    alert("同期に失敗しました（コンソール確認）");
  }
});

// init
(async ()=>{
  sleepDate.value = isoDate(new Date());
  if (window.VLT_SYNC){
    window.VLT_SYNC.start();
    await window.VLT_SYNC.pullOnce("sleep_init");
  }
})();
