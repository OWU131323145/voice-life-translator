const HISTORY_KEY = "vlt_history_v5";
const CHAT_KEY = "vlt_chat_v1";
const PROFILE_KEY = "vlt_profile_v1";

function loadHistory(){ try{return JSON.parse(localStorage.getItem(HISTORY_KEY)||"[]");}catch{return[];} }
function saveChat(messages){ localStorage.setItem(CHAT_KEY, JSON.stringify(messages)); }
function loadChat(){ try{return JSON.parse(localStorage.getItem(CHAT_KEY)||"[]");}catch{return[];} }
function saveProfile(text){ localStorage.setItem(PROFILE_KEY, text || ""); }
function loadProfile(){ return localStorage.getItem(PROFILE_KEY) || ""; }

function uniqDays(items){
  const s = new Set();
  items.forEach(it => { if (it.date) s.add(it.date); });
  return s.size;
}
function lastDate(items){
  const d = items.map(it => it.date).filter(Boolean).sort().slice(-1)[0];
  return d || "-";
}
function tokenize(q){
  return (q||"").replace(/[？?。、「」]/g," ").split(/\s+/).filter(Boolean).filter(w => w.length>=2);
}

async function callApi(prompt){
  const res = await fetch("/api/", {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ prompt })
  });
  const txt = await res.text();
  if(!res.ok) throw new Error(txt);
  return JSON.parse(txt).data;
}

// DOM
const chatLog = document.getElementById("chatLog");
const suggestChips = document.getElementById("suggestChips");
const userInput = document.getElementById("userInput");
const btnSend = document.getElementById("btnSend");
const btnClearChat = document.getElementById("btnClearChat");
const chatLoading = document.getElementById("chatLoading");

const btnSync = document.getElementById("btnSync");
const kpiEntries = document.getElementById("kpiEntries");
const kpiDays = document.getElementById("kpiDays");
const kpiLast = document.getElementById("kpiLast");

const profileText = document.getElementById("profileText");
const btnUpdateProfile = document.getElementById("btnUpdateProfile");
const btnSaveProfile = document.getElementById("btnSaveProfile");
const profileLoading = document.getElementById("profileLoading");

const btnVoice = document.getElementById("btnVoice");
const voiceState = document.getElementById("voiceState");

// state
let history = [];
let chat = [];
let recognizing = false;
let recognition = null;

function refreshKPIs(){
  history = loadHistory().slice().sort((a,b)=>(b.savedAt||0)-(a.savedAt||0));
  kpiEntries.textContent = `記録: ${history.length}`;
  kpiDays.textContent = `日数: ${uniqDays(history)}`;
  kpiLast.textContent = `最新: ${lastDate(history)}`;
}

function addBubble(role, text){
  const div = document.createElement("div");
  div.className = `bubble ${role === "user" ? "me" : "ai"}`;

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = role === "user" ? "あなた" : "AI";

  const body = document.createElement("div");
  body.textContent = text;

  div.appendChild(meta);
  div.appendChild(body);
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
}
function renderChat(){
  chatLog.innerHTML = "";
  chat.forEach(m => addBubble(m.role, m.text));
}
function setChips(chips){
  suggestChips.innerHTML = "";
  (chips||[]).slice(0,6).forEach(t=>{
    const b = document.createElement("button");
    b.className = "chip";
    b.type = "button";
    b.textContent = t;
    b.addEventListener("click", ()=>{
      userInput.value = t;
      userInput.focus();
    });
    suggestChips.appendChild(b);
  });
}

function pickCandidates(question){
  const tokens = tokenize(question);
  const items = loadHistory();
  const scored = items.map(it=>{
    const parts = [];
    if (it.type==="diary"){
      parts.push(it.cleanTranscript || it.rawTranscript || "");
      const sum = (it.finance?.expenses||[]).reduce((a,x)=>a+(Number(x.amount)||0),0);
      if (sum>0) parts.push(`支出合計 ${sum}円`);
      if (typeof it.health?.sleepHours==="number") parts.push(`睡眠 ${it.health.sleepHours}時間`);
      if (Array.isArray(it.health?.symptoms) && it.health.symptoms.length) parts.push(`体調 ${it.health.symptoms.join(",")}`);
    } else if (it.type==="sleep"){
      parts.push(`睡眠モード ${it.sleepHours ?? "?"}時間`);
    }
    const blob = parts.join("\n");
    let s = 0;
    for (const t of tokens) if (blob.includes(t)) s += 2;
    if (it.date && question.includes(it.date)) s += 4;
    if (it.type==="diary") s += 0.5;
    return { it, s, blob };
  }).filter(x=>x.s>0);

  scored.sort((a,b)=>b.s-a.s);
  return scored.slice(0,12).map(x=>({ date:x.it.date, type:x.it.type, text:x.blob.slice(0,650) }));
}

function buildChatPrompt({ profile, question, candidates, chatTail }){
  return `
あなたは「日記の振り返りAI」です。ユーザーの過去ログ（候補）とプロフィールを参照して、短く分かりやすく答えてください。

ルール:
- 捏造禁止（候補ログにない具体的事実を作らない）
- 推測は「推測」と明記
- 可能なら根拠の日付を出す（1〜3個まで）
- 高齢者にも分かる文章（短文＋箇条書き）

プロフィール:
${profile ? profile : "（未設定）"}

直近の会話:
${JSON.stringify(chatTail, null, 2)}

候補ログ:
${JSON.stringify(candidates, null, 2)}

質問:
${question}

出力JSON:
{
  "reply": "返答本文（短く）",
  "evidence_dates": ["YYYY-MM-DD"],
  "evidence_quotes": [{"date":"YYYY-MM-DD","quote":"短い抜粋"}],
  "followups": ["次に聞く質問1","質問2","質問3"]
}
`.trim();
}

async function ask(question){
  chatLoading.classList.add("show");
  try{
    if (window.VLT_SYNC) await window.VLT_SYNC.pullOnce("chat_before_ask");
    refreshKPIs();

    const profile = loadProfile();
    const candidates = pickCandidates(question);
    const chatTail = chat.slice(-6);

    const safeCandidates = candidates.length ? candidates : [{ date:"-", type:"none", text:"該当ログが見つかりません。キーワードを変えてください。" }];
    const obj = await callApi(buildChatPrompt({ profile, question, candidates: safeCandidates, chatTail }));

    let finalText = (obj.reply || "（回答なし）").trim();
    const dates = Array.isArray(obj.evidence_dates) ? obj.evidence_dates : [];
    const quotes = Array.isArray(obj.evidence_quotes) ? obj.evidence_quotes : [];

    if (dates.length) finalText += `\n\n根拠日: ${dates.join(", ")}`;
    if (quotes.length){
      finalText += `\n根拠:`;
      quotes.slice(0,3).forEach(q=>{ finalText += `\n- ${q.date}: ${q.quote}`; });
    }

    chat.push({ role:"assistant", text: finalText, at: Date.now() });
    saveChat(chat);
    addBubble("assistant", finalText);

    setChips(Array.isArray(obj.followups)? obj.followups : defaultChips());
  } finally {
    chatLoading.classList.remove("show");
  }
}

function buildProfilePrompt(items){
  const diaries = items.filter(x=>x.type==="diary").slice(0, 20).map(it=>({
    date: it.date,
    text: (it.cleanTranscript || it.rawTranscript || "").slice(0, 400)
  }));
  return `
あなたはユーザー理解の要約編集者です。以下のログから「短いプロフィール」を作ってください。
捏造禁止。断定しすぎない。読みやすい箇条書き。

出力はJSONのみ。

ログ:
${JSON.stringify(diaries, null, 2)}

出力JSON:
{
  "profile": "- 生活リズム(推測): ...\n- 気分が落ちやすい条件(推測): ...\n- 元気が出る条件(推測): ...\n- 大事にしてそうなこと(推測): ...\n- よく出る体調(あれば): ...\n- 一言: ..."
}
`.trim();
}

btnUpdateProfile.addEventListener("click", async ()=>{
  profileLoading.classList.add("show");
  try{
    if (window.VLT_SYNC) await window.VLT_SYNC.pullOnce("chat_profile_update");
    refreshKPIs();
    const items = loadHistory().slice().sort((a,b)=>(b.savedAt||0)-(a.savedAt||0));
    if (items.length < 3){
      alert("要約を作るには、記録がもう少し必要です（3件以上）。");
      return;
    }
    const obj = await callApi(buildProfilePrompt(items));
    const p = (obj.profile || "").trim();
    profileText.value = p;
    saveProfile(p);
  } catch(e){
    console.error(e);
    alert("要約の作成に失敗しました（コンソール確認）");
  } finally {
    profileLoading.classList.remove("show");
  }
});

btnSaveProfile.addEventListener("click", ()=>{
  saveProfile(profileText.value || "");
  alert("保存しました。");
});

// voice input
function setupSpeech(){
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR){
    btnVoice.disabled = true;
    voiceState.textContent = "音声入力はこのブラウザでは使えません";
    return;
  }
  recognition = new SR();
  recognition.lang = "ja-JP";
  recognition.interimResults = true;
  recognition.continuous = false;

  recognition.onstart = ()=>{ recognizing = true; voiceState.textContent = "録音中…"; };
  recognition.onend = ()=>{ recognizing = false; voiceState.textContent = ""; };
  recognition.onerror = (e)=>{ recognizing = false; voiceState.textContent = "音声入力エラー"; console.error(e); };
  recognition.onresult = (event)=>{
    let finalText = "";
    for (let i=event.resultIndex; i<event.results.length; i++){
      if (event.results[i].isFinal) finalText += event.results[i][0].transcript;
    }
    if (finalText){
      const cur = userInput.value || "";
      userInput.value = (cur + (cur ? "\n" : "") + finalText).trim();
    }
  };
}
btnVoice.addEventListener("click", ()=>{
  if (!recognition) return;
  if (!recognizing) recognition.start();
  else recognition.stop();
});

btnSend.addEventListener("click", async ()=>{
  const q = (userInput.value||"").trim();
  if (!q) return;
  chat.push({ role:"user", text:q, at:Date.now() });
  saveChat(chat);
  addBubble("user", q);
  userInput.value = "";
  setChips([]);
  try{ await ask(q); }
  catch(e){ console.error(e); addBubble("assistant", "すみません。エラーで答えられませんでした。"); }
});

btnClearChat.addEventListener("click", ()=>{
  if (!confirm("会話を消しますか？（日記データは残ります）")) return;
  chat = [];
  saveChat(chat);
  renderChat();
  setChips(defaultChips());
});

btnSync.addEventListener("click", async ()=>{
  try{
    if (window.VLT_SYNC) await window.VLT_SYNC.pullOnce("chat_manual_sync");
    refreshKPIs();
    alert("更新しました（同期）。");
  }catch(e){
    console.error(e);
    alert("同期に失敗しました（コンソール確認）");
  }
});

function defaultChips(){
  return [
    "最近の調子を短くまとめて",
    "疲れやすい原因の候補を教えて",
    "頭痛が出た日があれば教えて",
    "支出が増えがちなパターンはある？",
    "睡眠が足りていない日が多い？"
  ];
}

// init
(function init(){
  if (window.VLT_SYNC) window.VLT_SYNC.start();
  profileText.value = loadProfile();

  chat = loadChat();
  renderChat();
  setChips(defaultChips());

  refreshKPIs();
  setupSpeech();

  if (chat.length === 0){
    const welcome =
`こんにちは。日記をもとに、一緒に振り返ります。
まずは「最近の調子」「体調」「お金」「睡眠」など、気になることを聞いてください。`;
    chat.push({ role:"assistant", text: welcome, at: Date.now() });
    saveChat(chat);
    renderChat();
  }
})();
