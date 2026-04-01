const express = require('express');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// 設定
const PROVIDER = 'openai'; 
const MODEL = 'gpt-4o-mini'; 
const OPENAI_API_ENDPOINT = "https://openai-api-proxy-746164391621.us-west1.run.app";

// --- 同期用設定 ---
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function safeCode(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
}

// リアルタイム通知用
const clients = new Map();

// --- 1. テキスト解析API ---

// server.js の中
app.post('/sync/:code', (req, res) => {
  try {
    const code = safeCode(req.params.code);
    const file = path.join(DATA_DIR, `sync-${code}.json`);
    const incoming = req.body || {};

    // ★ 修正ポイント：
    // 「古いデータと混ぜる」のをやめて、送られてきた最新のリスト（削除後の状態）を
    // そのまま「正解」として保存するようにします。
    const payload = {
      savedAt: Date.now(),
      code,
      data: { 
        items: Array.isArray(incoming.items) ? incoming.items : [] 
      }
    };

    fs.writeFileSync(file, JSON.stringify(payload, null, 2));
    
    // 通知（これでスマホ側に「消えたよ」と伝わる）
    const clientSet = clients.get(code);
    if (clientSet) {
      clientSet.forEach(c => c.write(`event: updated\ndata: ${Date.now()}\n\n`));
    }

    res.json({ ok: true, mergedItems: payload.data.items.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- 4. 同期API (ダウンロード) ---

app.get('/sync/:code', (req, res) => {
  try {
    const code = safeCode(req.params.code);
    const file = path.join(DATA_DIR, `sync-${code}.json`);
    
    // ファイルがなければ空のデータを返す（404エラーにしないのがコツ）
    if (!fs.existsSync(file)) {
      return res.json({ data: { items: [] } });
    }
    
    const data = fs.readFileSync(file, 'utf8');
    res.json(JSON.parse(data));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- 5. リアルタイム通知 (SSE) ---

app.get('/events/:code', (req, res) => {
  const code = safeCode(req.params.code);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.write(`event: hello\ndata: ok\n\n`);

  if (!clients.has(code)) clients.set(code, new Set());
  clients.get(code).add(res);
  req.on('close', () => clients.get(code)?.delete(res));
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));