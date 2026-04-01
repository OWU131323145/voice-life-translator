const HISTORY_KEY = "vlt_history_v5";

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); }
  catch { return []; }
}
function formatYen(n) { return `¥${Number(n || 0).toLocaleString()}`; }

function buildDailySeries(history) {
  const map = new Map();
  for (const it of history) {
    if (!it.date) continue;

    if (!map.has(it.date)) {
      map.set(it.date, { date: it.date, spend: 0, sleep: null, count: 0 });
    }
    const row = map.get(it.date);
    row.count += 1;

    if (it.type === "diary") {
      const ex = it.finance?.expenses || [];
      row.spend += ex.reduce((a, x) => a + (Number(x.amount) || 0), 0);
      if (typeof it.health?.sleepHours === "number" && row.sleep == null) {
        row.sleep = it.health.sleepHours;
      }
    }

    if (it.type === "sleep" && typeof it.sleepHours === "number") {
      row.sleep = it.sleepHours; // sleep記録優先
    }
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function avg(nums) {
  const v = nums.filter(x => typeof x === "number" && !Number.isNaN(x));
  if (!v.length) return null;
  return v.reduce((a, x) => a + x, 0) / v.length;
}

// DOM
const btnSync = document.getElementById("btnSync");
const btnAll = document.getElementById("btnAll");
const btn90 = document.getElementById("btn90");
const btn30 = document.getElementById("btn30");
const btn7 = document.getElementById("btn7");

const kpiDays = document.getElementById("kpiDays");
const kpiEntries = document.getElementById("kpiEntries");
const kpiSpend = document.getElementById("kpiSpend");
const kpiSleep = document.getElementById("kpiSleep");

const rangeHint = document.getElementById("rangeHint");
const noDataHint = document.getElementById("noDataHint");

let full = [];
let view = [];
let viewDays = 30;

function applyViewDays(n) {
  viewDays = n;
  if (full.length === 0) {
    view = [];
  } else if (n === Infinity) {
    view = full.slice();
  } else {
    view = full.slice(Math.max(0, full.length - n));
  }
  updateUI();
  if (sketch) sketch.redraw();
}

function updateUI() {
  if (full.length === 0) {
    rangeHint.textContent = "";
    noDataHint.textContent = "データがありません。まず「記録」または「睡眠」で入力してください。";
    kpiDays.textContent = "-";
    kpiEntries.textContent = "-";
    kpiSpend.textContent = "-";
    kpiSleep.textContent = "-";
    return;
  }

  noDataHint.textContent = "";
  const start = view[0]?.date;
  const end = view[view.length - 1]?.date;
  rangeHint.textContent = `${start} 〜 ${end}（${view.length}日）`;

  const days = view.length;
  const entries = view.reduce((a, x) => a + (x.count || 0), 0);
  const spend = view.reduce((a, x) => a + (x.spend || 0), 0);
  const sleepAvg = avg(view.map(x => x.sleep));

  kpiDays.textContent = String(days);
  kpiEntries.textContent = String(entries);
  kpiSpend.textContent = formatYen(spend);
  kpiSleep.textContent = sleepAvg == null ? "-" : sleepAvg.toFixed(1) + "h";
}

async function syncAndReload() {
  if (window.VLT_SYNC) {
    window.VLT_SYNC.start();
    await window.VLT_SYNC.pullOnce("data_sync");
  }
  const hist = loadHistory().slice().sort((a, b) => (a.savedAt || 0) - (b.savedAt || 0));
  full = buildDailySeries(hist);
  applyViewDays(viewDays);
}

// ---- p5 グラフ（確実描画）----
const holder = document.getElementById("p5canvasHolder");
let sketch = null;

function safeMinMax(vals, fallbackMin = 0, fallbackMax = 1) {
  const v = vals.filter(x => typeof x === "number" && !Number.isNaN(x));
  if (!v.length) return { min: fallbackMin, max: fallbackMax };
  let mn = Math.min(...v);
  let mx = Math.max(...v);
  if (mn === mx) { mn -= 1; mx += 1; }
  return { min: mn, max: mx };
}

function initP5() {
  sketch = new p5((p) => {
    p.setup = () => {
      const w = holder.clientWidth || 320;
      const h = Math.min(520, Math.max(360, Math.floor(window.innerHeight * 0.55)));
      const cnv = p.createCanvas(w, h);
      cnv.parent(holder);
      p.noLoop();
    };

    p.windowResized = () => {
      const w = holder.clientWidth || 320;
      const h = Math.min(520, Math.max(360, Math.floor(window.innerHeight * 0.55)));
      p.resizeCanvas(w, h);
      p.redraw();
    };

    function xAt(i, x0, x1) {
      if (view.length <= 1) return x0;
      return p.map(i, 0, view.length - 1, x0, x1);
    }

    p.draw = () => {
      p.background(255);

      const padL = 56, padR = 16, padT = 18, padB = 44;
      const x0 = padL, y0 = padT, x1 = p.width - padR, y1 = p.height - padB;

      // axes + grid
      p.stroke(230);
      for (let i = 1; i < 5; i++) {
        const y = p.lerp(y1, y0, i / 5);
        p.line(x0, y, x1, y);
      }
      p.stroke(200);
      p.line(x0, y1, x1, y1);
      p.line(x0, y0, x0, y1);

      if (view.length === 0) {
        p.noStroke();
        p.fill(80);
        p.textSize(16);
        p.textStyle(p.BOLD);
        p.text("データがありません", x0, y0 + 30);
        return;
      }

      const spends = view.map(d => d.spend);
      const sleeps = view.map(d => (typeof d.sleep === "number" ? d.sleep : null));

      const mmSpend = safeMinMax(spends, 0, 1000);
      const mmSleep = safeMinMax(sleeps, 0, 10);

      // 支出：棒
      const barW = Math.max(3, ((x1 - x0) / view.length) * 0.65);
      p.noStroke();
      p.fill(220);
      for (let i = 0; i < view.length; i++) {
        const v = spends[i];
        const x = xAt(i, x0, x1) - barW / 2;
        const y = p.map(v, mmSpend.min, mmSpend.max, y1, y0);
        p.rect(x, y, barW, y1 - y, 4);
      }

      // 睡眠：線
      p.noFill();
      p.stroke(60);
      p.strokeWeight(2);
      p.beginShape();
      for (let i = 0; i < view.length; i++) {
        const v = sleeps[i];
        if (typeof v !== "number") continue;
        const x = xAt(i, x0, x1);
        const y = p.map(v, mmSleep.min, mmSleep.max, y1, y0);
        p.vertex(x, y);
      }
      p.endShape();

      // 点
      p.strokeWeight(0);
      p.fill(60);
      for (let i = 0; i < view.length; i++) {
        const v = sleeps[i];
        if (typeof v !== "number") continue;
        const x = xAt(i, x0, x1);
        const y = p.map(v, mmSleep.min, mmSleep.max, y1, y0);
        p.circle(x, y, 6);
      }

      // labels
      p.noStroke();
      p.fill(70);
      p.textSize(12);
      p.textStyle(p.BOLD);
      const first = view[0].date;
      const last = view[view.length - 1].date;
      p.text(first, x0, y1 + 28);
      p.text(last, x1 - 92, y1 + 28);

      // legend
      p.fill(30);
      p.text("支出（棒） / 睡眠（線）", x0, y0 - 2);
    };
  });
}

// events
btn7.addEventListener("click", () => applyViewDays(7));
btn30.addEventListener("click", () => applyViewDays(30));
btn90.addEventListener("click", () => applyViewDays(90));
btnAll.addEventListener("click", () => applyViewDays(Infinity));

btnSync.addEventListener("click", async () => {
  try {
    await syncAndReload();
    alert("更新しました（同期）。");
  } catch (e) {
    console.error(e);
    alert("同期に失敗しました（コンソール確認）");
  }
});

// init
(async () => {
  if (!sketch) initP5();
  await syncAndReload();
})();
