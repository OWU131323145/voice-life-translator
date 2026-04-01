const HISTORY_KEY = "vlt_history_v5";

function loadHistory(){
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); }
  catch { return []; }
}
function saveHistory(items){
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
}
function isoToday(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function formatYen(n){ return `¥${Number(n||0).toLocaleString()}`; }

async function callApiText(prompt){
  const res = await fetch("/api/", {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify({ prompt })
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(txt);
  return JSON.parse(txt).data;
}

async function callApiVision(prompt, images){
  const res = await fetch("/api/vision", {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ prompt, images })
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(txt);
  return JSON.parse(txt).data;
}

function uniqPush(arr, v){
  if (!arr.includes(v)) arr.push(v);
}

// DOM
const entryDate = document.getElementById("entryDate");
const btnSync = document.getElementById("btnSync");

const btnVoice = document.getElementById("btnVoice");
const btnClean = document.getElementById("btnClean");
const rawText = document.getElementById("rawText");
const cleanText = document.getElementById("cleanText");
const cleanLoading = document.getElementById("cleanLoading");

const photoInput = document.getElementById("photoInput");
const btnVision = document.getElementById("btnVision");
const visionLoading = document.getElementById("visionLoading");

const sleepHours = document.getElementById("sleepHours");

const symptomChips = document.getElementById("symptomChips");
const symptomSelected = document.getElementById("symptomSelected");

const expenseLabel = document.getElementById("expenseLabel");
const expenseAmount = document.getElementById("expenseAmount");
const btnAddExpense = document.getElementById("btnAddExpense");
const expenseList = document.getElementById("expenseList");
const expenseSum = document.getElementById("expenseSum");

const btnSave = document.getElementById("btnSave");
const btnReset = document.getElementById("btnReset");
const saveStatus = document.getElementById("saveStatus");

// QR（PCだけ表示だが、要素は存在する前提）
const qrBox = document.getElementById("qr");
const qrText = document.getElementById("qrText");

// state
let expenses = [];
let symptoms = [];
let recognition = null;
let recognizing = false;

const SYMPTOMS = ["頭痛", "腹痛", "だるい", "眠い", "イライラ", "不安", "肩こり", "風邪っぽい", "発熱", "咳", "喉が痛い"];

function renderSymptoms(){
  symptomChips.innerHTML = "";
  SYMPTOMS.forEach(s=>{
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = s;
    b.addEventListener("click", ()=>{
      uniqPush(symptoms, s);
      renderSelectedSymptoms();
    });
    symptomChips.appendChild(b);
  });
}
function renderSelectedSymptoms(){
  symptomSelected.innerHTML = "";
  if (!symptoms.length){
    symptomSelected.innerHTML = `<div class="hint">未選択</div>`;
    return;
  }
  symptoms.forEach(s=>{
    const d = document.createElement("div");
    d.className = "badge";
    d.textContent = `${s} ×`;
    d.style.cursor = "pointer";
    d.addEventListener("click", ()=>{
      symptoms = symptoms.filter(x=>x!==s);
      renderSelectedSymptoms();
    });
    symptomSelected.appendChild(d);
  });
}

function renderExpenses(){
  expenseList.innerHTML = "";
  const sum = expenses.reduce((a,x)=>a+(Number(x.amount)||0),0);
  if (!expenses.length){
    expenseList.innerHTML = `<div class="hint">まだありません</div>`;
  } else {
    expenses.forEach((x, idx)=>{
      const b = document.createElement("div");
      b.className = "badge";
      b.textContent = `${x.label || "支出"} ${formatYen(x.amount)} ×`;
      b.style.cursor = "pointer";
      b.title = "タップで削除";
      // record.js の中の削除処理（例：支出の削除ボタン）
      b.addEventListener("click", () => {
        expenses.splice(idx, 1); // 削除実行
        renderExpenses();        // 画面更新

        if (window.VLT_SYNC) {
          const hist = loadHistory(); // 現在のローカル全データを取得
          window.VLT_SYNC.pushOnce(hist, "delete_item");
        }
      });
    });
  }
  expenseSum.textContent = `合計: ${formatYen(sum)}`;
}

btnAddExpense.addEventListener("click", ()=>{
  const label = (expenseLabel.value||"").trim();
  const amount = Number(expenseAmount.value||0);
  if (!amount || amount < 0){
    alert("金額を入力してください");
    return;
  }
  expenses.push({ label: label || "支出", amount });
  expenseLabel.value = "";
  expenseAmount.value = "";
  renderExpenses();
});

// ---- AI：整文＋抽出 ----
function buildCleanAndExtractPrompt(text){
  return `
あなたは日記の編集者です。入力文を「意味を変えずに」読みやすい日本語に整えつつ、
内容から「体調」「睡眠」「支出」を可能な範囲で抽出してください。

厳守:
- 捏造禁止（書かれていない具体的事実・金額を作らない）
- 抽出は推測ならnullにする
- 出力はJSONのみ

入力:
${text}

出力JSON:
{
  "clean": "整えた文章",
  "sleepHours": 6.5,               // 分かる場合のみ。分からなければ null
  "symptoms": ["頭痛","だるい"],     // それっぽい言葉があれば。なければ []
  "expenses": [                     // 金額が明確なときだけ
    {"label":"薬","amount":980}
  ]
}
`.trim();
}

function mergeExtracted(obj){
  // clean
  if (obj.clean && typeof obj.clean === "string") {
    cleanText.value = obj.clean.trim();
  }

  // sleepHours：未入力なら入れる
  if ((sleepHours.value === "" || sleepHours.value == null) && typeof obj.sleepHours === "number"){
    sleepHours.value = String(obj.sleepHours);
  }

  // symptoms：追加マージ
  if (Array.isArray(obj.symptoms)){
    obj.symptoms.forEach(s=>{
      if (typeof s === "string" && s.trim()) uniqPush(symptoms, s.trim());
    });
    renderSelectedSymptoms();
  }

  // expenses：追加マージ（amountが数値のみ）
  if (Array.isArray(obj.expenses)){
    obj.expenses.forEach(e=>{
      const amt = Number(e?.amount);
      const lab = (e?.label || "支出").toString();
      if (Number.isFinite(amt) && amt > 0){
        expenses.push({ label: lab, amount: amt });
      }
    });
    renderExpenses();
  }
}

btnClean.addEventListener("click", async ()=>{
  const t = (rawText.value || "").trim();
  if (!t){
    alert("本文を入力してください（音声でもOK）");
    return;
  }
  cleanLoading.classList.add("show");
  try{
    const obj = await callApiText(buildCleanAndExtractPrompt(t));
    mergeExtracted(obj);
  } catch(e){
    console.error(e);
    alert("AI処理に失敗しました（コンソール確認）");
  } finally {
    cleanLoading.classList.remove("show");
  }
});

// ---- 画像認識 ----
function fileToDataURL(file){
  return new Promise((resolve,reject)=>{
    const r = new FileReader();
    r.onload = ()=>resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function buildVisionPrompt(){
  return `
画像から読み取れる範囲で、家計（支出）と体調情報を抽出してください。
対象の例: レシート、体温計、薬の箱、メモ、健康アプリ画面の写真など。

厳守:
- 読み取れない場合は null/[] にする
- 捏造禁止
- 出力はJSONのみ

出力JSON:
{
  "sleepHours": 6.5,                 // 分かれば。分からなければ null
  "symptoms": ["発熱","頭痛"],        // 分かれば。なければ []
  "expenses": [
    {"label":"ドラッグストア","amount":1980}
  ]
}
`.trim();
}

btnVision.addEventListener("click", async ()=>{
  const files = Array.from(photoInput.files || []).slice(0,3);
  if (!files.length){
    alert("写真を選んでください");
    return;
  }
  visionLoading.classList.add("show");
  try{
    const images = [];
    for (const f of files){
      images.push(await fileToDataURL(f));
    }
    const obj = await callApiVision(buildVisionPrompt(), images);
    mergeExtracted(obj);
    alert("写真から取り込みました。必要なら直してください。");
  } catch(e){
    console.error(e);
    alert("画像の解析に失敗しました（コンソール確認）");
  } finally {
    visionLoading.classList.remove("show");
  }
});

// ---- 音声入力 ----
function setupSpeech(){
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR){
    btnVoice.disabled = true;
    btnVoice.textContent = "音声入力（非対応）";
    return;
  }
  recognition = new SR();
  recognition.lang = "ja-JP";
  recognition.interimResults = true;
  recognition.continuous = false;

  recognition.onstart = ()=>{ recognizing = true; btnVoice.textContent = "音声入力（停止）"; };
  recognition.onend = ()=>{ recognizing = false; btnVoice.textContent = "音声入力"; };
  recognition.onerror = (e)=>{ recognizing = false; btnVoice.textContent = "音声入力"; console.error(e); };

  recognition.onresult = (event)=>{
    let finalText = "";
    for (let i=event.resultIndex; i<event.results.length; i++){
      if (event.results[i].isFinal){
        finalText += event.results[i][0].transcript;
      }
    }
    if (finalText){
      const cur = rawText.value || "";
      rawText.value = (cur + (cur ? "\n" : "") + finalText).trim();
    }
  };
}

btnVoice.addEventListener("click", ()=>{
  if (!recognition) return;
  if (!recognizing) recognition.start();
  else recognition.stop();
});

// ---- 保存 ----
btnSave.addEventListener("click", async ()=>{
  const date = entryDate.value || isoToday();
  const raw = (rawText.value || "").trim();
  const clean = (cleanText.value || "").trim();
  if (!raw && !clean){
    alert("本文が空です。何か入力してください。");
    return;
  }

  const item = {
    id: (crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + "_" + Math.random()),
    type: "diary",
    date,
    savedAt: Date.now(),
    rawTranscript: raw,
    cleanTranscript: clean || raw,
    finance: { expenses: expenses.slice() },
    health: {
      sleepHours: sleepHours.value ? Number(sleepHours.value) : null,
      symptoms: symptoms.slice()
    }
  };

  const hist = loadHistory();
  hist.push(item);
  saveHistory(hist);

  if (window.VLT_SYNC) {
    await window.VLT_SYNC.pushOnce(hist, "record_save");
  }

  saveStatus.textContent = `保存しました（${date}）`;

  try{
    if (window.VLT_SYNC?.pushOnce) await window.VLT_SYNC.pushOnce("record_save");
  }catch(e){
    console.warn("pushOnce not available / failed:", e);
  }

  saveStatus.textContent = `保存しました（${date}）`;
  setTimeout(()=>{ saveStatus.textContent = ""; }, 2500);
});

btnReset.addEventListener("click", ()=>{
  if (!confirm("入力をクリアしますか？（保存済みデータは残ります）")) return;
  rawText.value = "";
  cleanText.value = "";
  sleepHours.value = "";
  expenses = [];
  symptoms = [];
  photoInput.value = "";
  renderExpenses();
  renderSelectedSymptoms();
});

btnSync.addEventListener("click", async ()=>{
  try{
    if (window.VLT_SYNC){
      window.VLT_SYNC.start();
      await window.VLT_SYNC.pullOnce("record_manual_sync");
    }
    saveStatus.textContent = "更新しました（同期）";
    setTimeout(()=>{ saveStatus.textContent = ""; }, 2000);
  }catch(e){
    console.error(e);
    alert("同期に失敗しました（コンソール確認）");
  }
});

// QR（PCだけ表示。要素が存在しない場合はスキップ）
function renderQR(){
  if (!qrBox || !qrText) return;
  qrBox.innerHTML = "";
  const url = location.href;
  try{
    new QRCode(qrBox, { text: url, width: 140, height: 140 });
    qrText.textContent = url;
  } catch {}
}


// record.js の (async () => { ... })(); の中身をこれに差し替え
(async () => {
  entryDate.value = isoToday();

  // 1. sync.js側の準備を待つ
  if (window.VLT_SYNC) {
    window.VLT_SYNC.start();
  }

  // 2. 確定したコードを取得（なければここで1回だけ作る）
  let code = window.VLT_SYNC.getCode();
  if (!code) {
    code = Math.random().toString(36).substring(2, 6).toUpperCase();
    window.VLT_SYNC.setCode(code);
    // URLを更新
    const url = new URL(window.location.href);
    url.searchParams.set("code", code);
    window.history.replaceState({}, '', url.href);
  }

  // 3. 【重要】全てのメニューリンクに今のコードを強制付与
  document.querySelectorAll('.nav-link').forEach(link => {
    const linkUrl = new URL(link.href, window.location.origin);
    linkUrl.searchParams.set("code", code);
    link.href = linkUrl.href;
  });

  renderSymptoms();
  renderSelectedSymptoms();
  renderExpenses();
  setupSpeech();
  
  // 4. 正しいコードでQRを出す
  if (typeof renderQR === "function") renderQR();

  if (window.VLT_SYNC) {
    await window.VLT_SYNC.pullOnce("record_init");
  }
})();