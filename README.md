# Voice Life Translator (VLT)

スマートフォンで「話すだけ」で記録できる、AI搭載ライフログアプリです。  
音声・テキストから日記を自動生成し、体調・睡眠・支出を抽出・蓄積・可視化します。

---

## Overview

本プロジェクトは「継続できる記録体験」と「データの活用」をテーマに開発しました。

従来の日記アプリは「書く手間」が障壁となり、継続が難しいという課題があります。  
本アプリでは、音声入力とAIによる自動整理を組み合わせることで、

- 入力のハードルを下げる
- 記録を自動で構造化する
- 後から活用できる形で蓄積する

という体験を実現しています。

---

## Features

### 音声・テキスト記録

- Web Speech APIによる音声入力  
- 短いメモでも記録可能  
- スマートフォン最適UI  

---

### AIによる自動整理

- 入力内容を自然な文章に整形  
- 以下の情報を自動抽出  
  - 体調（例：頭痛、疲れ）  
  - 睡眠時間  
  - 支出（内容・金額）  

---

### カレンダー表示

- 日付ごとの記録を一覧表示  
- 過去の出来事を直感的に確認可能  

---

### 対話機能（Chat）

- 過去の記録をもとにAIと対話  
- 例：  
  - 「最近体調悪い日多い？」  
  - 「支出が多いのはいつ？」  

---

### データ可視化

- p5.jsによるグラフ表示  
  - 支出（棒グラフ）  
  - 睡眠（折れ線グラフ）  
- 期間別（7日 / 30日 / 全体）で切替  

---

### 睡眠記録

- シンプルな入力UI  
- 記録と分離し、操作性を向上  

---

## Quick Start

### 1. Install

```bash
npm install
```

### 2. Run Server

```bash
node server.js
```

### 3. Access

```text
http://localhost:8080/quiz.html
```

---

## Architecture

### データフロー

```text
[ User Input (Voice/Text) ]
        ↓
[ Frontend (JS) ]
        ↓
[ Node.js API ]
        ↓
[ OpenAI API ]
        ↓
[ JSON Response ]
        ↓
[ UI / Storage / Visualization ]
```

---

### 各役割

| コンポーネント      | 役割          |
|-------------------|--------------|
| フロントエンド      | 入力・表示・グラフ描画 |
| Node.js           | API中継       |
| OpenAI            | 整形・抽出・対話 |
| localStorage      | データ保存     |

---

## Technical Details

### JSONベース設計

AIの出力は構造化されたJSON形式で扱います。

```json
{
  "cleanText": "今日は体調が悪く、薬を購入した。",
  "symptoms": ["頭痛"],
  "sleepHours": 6,
  "expenses": [
    { "label": "薬", "amount": 980 }
  ]
}
```

---

### データ構造

```js
{
  id,
  date,
  type: "diary" | "sleep",
  text,
  health,
  finance
}
```

---

### データ管理

- localStorageに配列として保存  
- カレンダー・対話・グラフで共通利用  

---

### 可視化（p5.js）

- 日別にデータを集計  
- Canvas上にグラフ描画  
- 軽量で安定した描画処理  

---

## Tech Stack

| Category      | Technology            |
|--------------|----------------------|
| Frontend     | HTML, CSS, JavaScript |
| Backend      | Node.js, Express      |
| AI           | OpenAI API            |
| Visualization| p5.js                 |
| Voice Input  | Web Speech API        |
| Storage      | localStorage          |

---

## Project Structure

```text
voice-life-translator/
├── server.js
├── package.json
├── public/
│   ├── record.html
│   ├── calendar.html
│   ├── chat.html
│   ├── sleep.html
│   ├── data.html
│   ├── style.css
│   ├── voice.css
│   ├── record.css
│   ├── calendar.js
│   ├── record.js
│   ├── sleep.js
│   ├── chat.js
│   ├── data.js
│   └── sync.js
└── README.md
```

---

## Highlights

### UX設計

- 入力の手間を極限まで削減  
- 必須項目なしの自由入力  
- 高齢者でも使えるシンプルUI  

---

### LLM活用設計

- 自由生成ではなく「構造化処理」に限定  
- JSON出力で安全にデータ処理  
- 対話機能でデータ活用まで実現  

---

### データ活用

- 記録 → 蓄積 → 可視化 → 対話  
- 単なる日記ではなく「分析可能なログ」  

---

## Future Improvements

- クラウド同期（Firebase等）  
- 画像認識（レシート・体温計）  
- 睡眠自動検知（センサー連携）  
- 週次・月次レポート  
- 家族共有・見守り機能  

---

## License

MIT License
