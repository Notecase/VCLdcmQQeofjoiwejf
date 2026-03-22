# Ollama Cloud Research Summary

**Date**: 2026-03-18
**Purpose**: Research Ollama Cloud capabilities for planning AI system support (Gemini paid + open-source models via Ollama local/cloud)

---

## 1. What Is Ollama Cloud?

Ollama Cloud lets users run larger models without requiring powerful local GPUs. Cloud models are automatically offloaded to Ollama's cloud infrastructure while offering the same API as local models. The service acts as a remote Ollama host.

**Key distinction**: Ollama is primarily a local-first tool. "Cloud" is an extension that lets you run bigger models (120B+ params) when your hardware can't handle them locally.

---

## 2. Available Models

Models with **Cloud** capability can run on Ollama's cloud infrastructure. Notable models (as of March 2026):

| Model            | Sizes                 | Capabilities                   |
| ---------------- | --------------------- | ------------------------------ |
| qwen3.5          | 0.8b - 122b           | Vision, Tools, Thinking, Cloud |
| nemotron-3-super | 120b                  | Tools, Thinking, Cloud         |
| qwen3-coder-next | Multiple              | Tools, Cloud                   |
| qwen3-vl         | 2b - 235b             | Vision, Tools, Thinking, Cloud |
| devstral-small-2 | 24b                   | Vision, Tools, Cloud           |
| ministral-3      | 3b - 14b              | Vision, Tools, Cloud           |
| minimax-m2.5     | -                     | Cloud                          |
| glm-5            | 744b (40b active MoE) | Cloud                          |
| qwen3-next       | 80b                   | Tools, Thinking, Cloud         |
| kimi-k2.5        | -                     | Cloud                          |
| rnj-1            | 8b                    | Tools, Cloud                   |
| nemotron-3-nano  | 4b, 30b               | Tools, Thinking, Cloud         |
| gpt-oss          | 120b                  | Cloud (referenced in docs)     |

**Non-cloud popular models** (local only): gemma3, deepseek-r1, llama3.2, phi4, etc.

The full searchable catalog is at `ollama.com/search`.

---

## 3. API Format

### Native Ollama API

Two main endpoints:

**POST /api/generate** - Text completion

- Request: `{ model, prompt, suffix?, images?, format?, system?, stream?, think?, options?, keep_alive? }`
- Response: `{ model, created_at, response, thinking?, done, done_reason, total_duration, eval_count, ... }`

**POST /api/chat** - Chat completion (primary for agents)

- Request: `{ model, messages[], tools?, format?, stream?, think?, options?, keep_alive? }`
- Messages: `{ role: "system"|"user"|"assistant"|"tool", content, images?, tool_calls? }`
- Response: `{ model, created_at, message: { role, content, thinking?, tool_calls? }, done, ... }`

Streaming: Enabled by default in REST API. Returns `application/x-ndjson` (newline-delimited JSON). Each chunk has partial content until `done: true`.

### OpenAI-Compatible API (CRITICAL for our integration)

**Base URL**: `http://localhost:11434/v1/` (local) or `https://ollama.com/v1/` (cloud, presumably)

**Supported endpoints**:

- `/v1/chat/completions` - Full support: streaming, JSON mode, vision, tool use, thinking
- `/v1/completions` - Text completions
- `/v1/models` and `/v1/models/{model}` - Model listing
- `/v1/embeddings` - Embedding generation
- `/v1/images/generations` - Image gen (experimental)
- `/v1/responses` - OpenAI Responses API (v0.13.3+, non-stateful)

**Supported parameters for /v1/chat/completions**: model, messages (text + base64 images), temperature, top_p, max_tokens, frequency_penalty, presence_penalty, stop, stream, response_format, seed, tools, reasoning_effort

**NOT supported**: logprobs, tool_choice

**SDK usage**:

```python
from openai import OpenAI
client = OpenAI(base_url='http://localhost:11434/v1/', api_key='ollama')
```

```javascript
import OpenAI from 'openai'
const client = new OpenAI({ baseURL: 'http://localhost:11434/v1/', apiKey: 'ollama' })
```

API key is **required but ignored** for local. For cloud, use real API key.

### Anthropic-Compatible API

**Endpoint**: `/v1/messages` (Anthropic Messages API format)

- Supports: messages, streaming, system prompts, vision (base64), tool calling, thinking blocks
- **Not supported**: tool_choice, metadata, prompt caching, batches, citations, PDF content blocks
- Token counts are approximations
- Config: `ANTHROPIC_BASE_URL=http://localhost:11434`, `ANTHROPIC_AUTH_TOKEN=ollama`

---

## 4. Authentication

### Local Access

- **No authentication needed** for `http://localhost:11434`
- API key field is "required but ignored" for OpenAI-compatible endpoints

### Cloud Access - Method 1: CLI Sign-in

- Run `ollama signin` (creates account at ollama.com)
- Ollama automatically authenticates requests to cloud models
- Works for both CLI (`ollama run gpt-oss:120b-cloud`) and local API calls

### Cloud Access - Method 2: API Keys (Direct API)

- Create API key at `ollama.com/settings/keys`
- Set `OLLAMA_API_KEY` environment variable
- Include `Authorization: Bearer $OLLAMA_API_KEY` header
- API keys have **no expiration** but can be revoked
- Used for direct access to `https://ollama.com/api/*` endpoints

---

## 5. Endpoint URLs

| Context                  | Base URL                             | Auth Required  |
| ------------------------ | ------------------------------------ | -------------- |
| Local (native)           | `http://localhost:11434/api/`        | No             |
| Local (OpenAI compat)    | `http://localhost:11434/v1/`         | No (dummy key) |
| Local (Anthropic compat) | `http://localhost:11434/v1/messages` | No (dummy key) |
| Cloud (native)           | `https://ollama.com/api/`            | Yes (API key)  |
| Cloud (OpenAI compat)    | `https://ollama.com/v1/` (inferred)  | Yes (API key)  |

---

## 6. Pricing

| Plan     | Price   | Cloud Concurrency   | Cloud Usage        | Key Features                                               |
| -------- | ------- | ------------------- | ------------------ | ---------------------------------------------------------- |
| **Free** | $0      | 1 model at a time   | Light usage        | Run models locally, access cloud models, 40K+ integrations |
| **Pro**  | $20/mo  | 3 models at a time  | 50x more than Free | Upload/share private models, coding automation             |
| **Max**  | $100/mo | 10 models at a time | 5x more than Pro   | Continuous agent tasks, multiple concurrent agents         |

**Usage measurement**: GPU time and actual infrastructure utilization (NOT fixed token counts).
**Reset schedule**: Session limits reset every 5 hours; weekly limits reset every 7 days.
**Notification**: At 90% of plan limit.
**Future**: Additional per-token usage pricing "coming soon."
**Data privacy**: Prompts/responses never logged or trained on. Infrastructure via NVIDIA Cloud Providers with zero data retention.

---

## 7. Streaming Details

- **Default**: Streaming ON in REST API, OFF in SDKs (must explicitly set `stream: true`)
- **Format**: `application/x-ndjson` (newline-delimited JSON)
- **Chat streaming**: Partial assistant messages with `content` field
- **Thinking streaming**: `thinking` field alongside content in each chunk
- **Tool call streaming**: `tool_calls` appear in chunks; must accumulate all chunks before executing
- **Accumulation required**: Developers must accumulate partial fields to maintain conversation history

---

## 8. Tool Calling

**Supported by**: qwen3.5, qwen3-vl, qwen3-coder-next, qwen3-next, nemotron-3-super, nemotron-3-nano, devstral-small-2, ministral-3, rnj-1, granite4, lfm2, lfm2.5-thinking, glm-4.7-flash, glm-ocr (models with "Tools" capability)

**API format**: OpenAI-compatible tool definitions

```json
{
  "type": "function",
  "function": {
    "name": "get_temperature",
    "description": "Get the current temperature for a city",
    "parameters": {
      "type": "object",
      "properties": { "city": { "type": "string" } },
      "required": ["city"]
    }
  }
}
```

**Response**: Assistant message contains `tool_calls` array with `{ type: "function", function: { name, arguments, index } }`
**Tool results**: Send as `{ role: "tool", tool_name: "...", content: "..." }`

**Patterns supported**:

- Single-shot tool call
- Parallel tool calls
- Agent loop (multi-turn iterative)
- Streaming tool calls (accumulate chunks, then execute)

**Limitation**: `tool_choice` parameter is NOT supported (neither native nor OpenAI-compat)

---

## 9. Vision

**Supported by**: qwen3.5, qwen3-vl, devstral-small-2, ministral-3, gemma3, translategemma, deepseek-ocr, glm-ocr (models with "Vision" capability)

**Image input methods**:

- File paths (SDKs only)
- URLs (SDKs only -- but OpenAI-compat does NOT support URLs, only base64)
- Raw bytes (SDKs)
- Base64-encoded data (REST API)

**API**: Images go in `images` array within messages (native) or as base64 `image_url` content blocks (OpenAI-compat)

---

## 10. Web Search (Bonus capability)

**API**: `POST https://ollama.com/api/web_search` - requires API key

- Parameters: `query` (required), `max_results` (optional, default 5, max 10)
- Returns: array of `{ title, url, content }` results

**Web Fetch API**: `POST https://ollama.com/api/web_fetch`

- Parameters: `url` (required)
- Returns: page title, main content, extracted links

---

## 11. Additional Capabilities

- **Structured outputs**: `format: "json"` for JSON mode, or full JSON schema objects
- **Thinking/reasoning**: `think: true` or `think: "high"|"medium"|"low"` for extended reasoning
- **Embeddings**: `/api/embed` (native) or `/v1/embeddings` (OpenAI-compat)
- **Context length**: Configurable via `num_ctx` option or Modelfile
- **Keep alive**: `keep_alive` parameter controls how long model stays loaded in memory

---

## 12. Integration Implications for Inkdown/Noteshell

### Current State

The existing Ollama provider in `packages/ai/src/providers/openai.ts` (or a dedicated `ollama.ts`) likely uses the OpenAI-compatible endpoint.

### Key Findings for Architecture

1. **OpenAI-compatible API is the best integration path** -- Works for both local and cloud Ollama, same SDK as other providers
2. **Cloud is just a different base URL + auth** -- Switch from `http://localhost:11434/v1/` to `https://ollama.com/v1/` and add Bearer token
3. **No `tool_choice` support** -- Must handle this gracefully in agent code (cannot force tool use)
4. **Vision only supports base64** -- No URL-based image inputs via API
5. **Free tier is generous for testing** -- But only 1 concurrent cloud model
6. **GPU-time billing, not tokens** -- Makes cost prediction harder than Gemini's token-based pricing
7. **Streaming format identical to OpenAI** -- ndjson chunks with delta content
8. **`think` parameter** -- Useful for reasoning models, maps loosely to OpenAI's `reasoning_effort`
9. **Anthropic compatibility exists** -- Could theoretically route through Ollama for local model testing

### Recommended Provider Architecture

```
OllamaProvider
  ├── mode: "local" | "cloud"
  ├── baseURL: localhost:11434/v1 OR ollama.com/v1
  ├── apiKey: "ollama" (local) OR real key (cloud)
  ├── Uses OpenAI SDK internally
  ├── Strips tool_choice from requests (unsupported)
  └── Handles base64-only image encoding
```

This can potentially share code with the existing OpenAI provider since the API is compatible.
