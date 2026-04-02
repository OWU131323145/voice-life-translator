// public/sync.js
/* =========================================
 * サーバー同期・リアルタイム通信モジュール
 * ========================================= */
window.VLT_SYNC = (() => {
  const HISTORY_KEY = "vlt_history_v5";
  const CODE_KEY = "vlt_sync_code_v5";
  const STATUS_KEY = "vlt_sync_status_v5";

  let busy = false;
  let timer = null;
  let es = null;

  function now(){ return Date.now(); }
  function normalizeCode(s){
    return String(s||"").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0,12);
  }
  function getCode(){ return normalizeCode(localStorage.getItem(CODE_KEY) || ""); }
  function setCode(code){ localStorage.setItem(CODE_KEY, normalizeCode(code)); }

  function loadHistory(){
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); }
    catch { return []; }
  }
  function saveHistory(list){ localStorage.setItem(HISTORY_KEY, JSON.stringify(list)); }

  /* --- ユーティリティ --- */
  function mergeById(a=[], b=[]){
    return [...b].sort((x, y) => (x.savedAt || 0) - (y.savedAt || 0));
  }

  function setStatus(s){
    localStorage.setItem(STATUS_KEY, s);
    const el = document.getElementById("syncTinyStatus");
    if (el) el.textContent = s;
  }

  /* --- 初期化・設定 --- */
  function initFromUrl(){
    try {
      const u = new URL(location.href);
      const c = normalizeCode(u.searchParams.get("code") || "");
      if (c && c.length >= 4){
        setCode(c); // localStorageに保存
        setStatus(`同期: ON（code=${c}）`);
      }
    } catch(e) {
      console.error("URLからのコード取得に失敗", e);
    }
}

  /* --- API通信・同期処理 --- */
  async function apiDownload(code){
    const res = await fetch(`/sync/${code}`);
    const t = await res.text();
    if (!res.ok) throw new Error(`GET /sync failed ${res.status}: ${t}`);
    return JSON.parse(t);
  }
  async function apiUpload(code, payload){
    const res = await fetch(`/sync/${code}`, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify(payload)
    });
    const t = await res.text();
    if (!res.ok) throw new Error(`POST /sync failed ${res.status}: ${t}`);
    return JSON.parse(t);
  }

  async function pullOnce(reason="pull"){
    const code = getCode();
    if (!code || code.length < 4) { setStatus("同期: code未設定（QRで設定）"); return; }
    if (busy) return;

    busy = true;
    try{
      setStatus("同期: 受信中…");
      const remote = await apiDownload(code);
      const incoming = remote?.data?.items;
      if (!Array.isArray(incoming)) throw new Error("remote items missing");

      const cur = loadHistory();
      const merged = mergeById(cur, incoming);
      saveHistory(merged);

      setStatus(`同期: ON（受信OK ${merged.length}件）`);
    }catch(e){
      console.error(e);
      setStatus(`同期: 受信失敗（${String(e.message).slice(0,60)}）`);
    }finally{
      busy = false;
    }
  }

  async function pushOnce(items, reason="push"){
    const code = getCode();
    if (!code || code.length < 4) { setStatus("同期: code未設定（QRで設定）"); return; }
    if (busy) return;

    busy = true;
    try{
      setStatus("同期: 送信中…");
      const payload = {
        version: "v5",
        items: items || loadHistory(),
        device: navigator.userAgent,
        exportedAt: now()
      };
      const r = await apiUpload(code, payload);
      setStatus(`同期: ON（送信OK 統合${r.mergedItems}件）`);
    }catch(e){
      console.error(e);
      setStatus(`同期: 送信失敗（${String(e.message).slice(0,60)}）`);
    }finally{
      busy = false;
    }
  }

  /* --- リアルタイム通信 (SSE) --- */
  function connectSSE(){
    const code = getCode();
    if (!code || code.length < 4) return;

    // 既存を閉じる
    if (es) { try{ es.close(); }catch{} es = null; }

    setStatus(`同期: ON（リアルタイム接続中…）`);
    es = new EventSource(`/events/${code}`);

    es.addEventListener("hello", () => {
      setStatus(`同期: ON（リアルタイム接続OK）`);
      pullOnce("sse_hello");
    });

    es.addEventListener("updated", () => {
      // サーバが「保存されたよ」と言ってきたら即受信
      pullOnce("sse_updated");
    });

    es.onerror = () => {
      // SSEが切れてもポーリングで復帰できる
      setStatus("同期: ON（リアルタイム切断→ポーリング）");
    };
  }

  /* --- メイン処理 --- */
  function start() {
  // 1. URLにコードがあればそれを最優先で保存
  const u = new URL(location.href);
  const urlCode = normalizeCode(u.searchParams.get("code") || "");
  if (urlCode && urlCode.length >= 4) {
    setCode(urlCode);
  }

  // 2. それでもなければ既存のものを読み込む
  const code = getCode();
  if (code) {
    setStatus(`同期: ON（code=${code}）`);
    // URLにコードがなければ付け足す
    if (u.searchParams.get("code") !== code) {
      u.searchParams.set("code", code);
      window.history.replaceState({}, '', u.href);
    }
  } else {
    setStatus("同期: code未設定（QRで設定）");
  }

  pullOnce("init");
  connectSSE();

  // 20秒おきにチェック（念のため）
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    if (document.visibilityState === "visible") pullOnce("interval");
  }, 20000);
}


  return { start, pullOnce, pushOnce, getCode, setCode, connectSSE };
})();
