# Generic Web API for LLM Integration

A flexible Node.js web API that allows you to create LLM-powered applications by simply editing a Markdown prompt file. No code changes required for different use cases.

## Features

- 🎯 **Generic Design**: One API endpoint for any LLM application
- 📝 **Markdown Prompts**: Define your application logic in `prompt.md`
- 🔄 **Variable Substitution**: Automatic replacement of `${variable}` placeholders
- 🤖 **Multi-Provider**: Supports OpenAI and Google Gemini
- ⚡ **No Code Changes**: Switch between applications by editing `prompt.md`

## Quick Start

### 1. Installation

```bash
npm install
```

### 2. Environment Setup

Copy `.env.example` to `.env` and set your API key:

```bash
cp .env.example .env
```

Edit `.env`:
```env
# For Gemini (default)
GEMINI_API_KEY=your_gemini_api_key_here

# For OpenAI (if switching)
OPENAI_API_KEY=your_openai_api_key_here

PORT=8080
```

### 3. Configure LLM Provider

Edit `server.js` lines 13-14:

```javascript
// For Gemini (default)
const PROVIDER = 'gemini';
const MODEL = 'gemini-2.5-flash';

// For OpenAI
// const PROVIDER = 'openai';
// const MODEL = 'gpt-4o-mini';
```

### 4. Start Server

```bash
npm start
```

Visit `http://localhost:8080`

## How It Works

### Architecture

```
Client (quiz.html) → POST /api/ → server.js → LLM → Response
                                     ↓
                              prompt.md (template)
```

### Variable Substitution

The API automatically replaces variables in `prompt.md` with request data:

**prompt.md:**
```markdown
Create ${count} questions about ${topic}.
Format: JSON array
```

**Request:**
```json
{
  "count": 5,
  "topic": "JavaScript"
}
```

**Result:** Variables `${count}` and `${topic}` are replaced with actual values.

### API Endpoint

**POST** `/api/`

**Request Body:**
```json
{
  "title": "My Quiz",
  "count": 5,
  "any_variable": "value"
}
```

**Response:**
```json
{
  "title": "My Quiz",
  "data": [...]
}
```

## Example Applications

### 1. IT Certification Quiz (Included)

**Files:**
- `prompt.md` - Defines IT quiz generation logic
- `public/quiz.html` - Quiz interface

**Usage:** Generate IT certification practice questions

### 2. Translation App (Example)

**prompt.md:**
```markdown
# Translation Service

Translate the following text to ${target_language}:

"${text}"

Return only the translated text.
```

**Request:**
```json
{
  "text": "Hello world",
  "target_language": "Japanese"
}
```

### 3. Code Review App (Example)

**prompt.md:**
```markdown
# Code Review Assistant

Review this ${language} code and provide feedback:

```${language}
${code}
```

Provide:
1. Issues found
2. Suggestions for improvement
3. Best practices
```

**Request:**
```json
{
  "language": "Python",
  "code": "def hello():\n    print('world')"
}
```

## File Structure

```
generic-webapi/
├── server.js          # Generic API server (no changes needed)
├── prompt.md          # Application-specific prompt template
├── package.json       # Dependencies
├── .env.example       # Environment variables template
├── public/            # Static files
│   ├── quiz.html     # IT quiz application
│   ├── style.css     # Styles
│   └── quiz.css      # Quiz-specific styles
└── README.md         # This file
```

## Creating New Applications

1. **Edit `prompt.md`** - Define your application logic and variables
2. **Create client HTML** - Build your user interface in `public/`
3. **Send requests** - Use any variables you defined in `prompt.md`

No server code changes required!

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GEMINI_API_KEY` | Google Gemini API key | Yes (if using Gemini) |
| `OPENAI_API_KEY` | OpenAI API key | Yes (if using OpenAI) |
| `PORT` | Server port | No (default: 8080) |

## LLM Provider Configuration

### Switch to OpenAI

1. Edit `server.js`:
```javascript
const PROVIDER = 'openai';
const MODEL = 'gpt-4o-mini';
```

2. Set OpenAI API key in `.env`:
```env
OPENAI_API_KEY=your_key_here
```

### Switch to Gemini

1. Edit `server.js`:
```javascript
const PROVIDER = 'gemini';
const MODEL = 'gemini-2.5-flash';
```

2. Set Gemini API key in `.env`:
```env
GEMINI_API_KEY=your_key_here
```

## Development

### Run with auto-restart:
```bash
npm run dev
```

### Supported Models

**OpenAI:**
- `gpt-4o-mini`
- `gpt-5-mini`

**Gemini:**
- `gemini-2.5-flash`
- `gemini-2.5-flash-lite`

## License

MIT

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request