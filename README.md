# VoiceQuery AI — Real-Time Multi-Lingual PDF Voice RAG Agent

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-5.6-blue?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/React-18.3-61dafb?logo=react" alt="React" />
  <img src="https://img.shields.io/badge/Python-3.11-3776ab?logo=python" alt="Python" />
  <img src="https://img.shields.io/badge/LiveKit-Agents%201.0-orange?logo=livekit" alt="LiveKit" />
  <img src="https://img.shields.io/badge/Qdrant-Vector%20DB-dc2626?logo=qdrant" alt="Qdrant" />
  <img src="https://img.shields.io/badge/Groq-Fast%20LLM-f59e0b" alt="Groq" />
  <img src="https://img.shields.io/badge/Sarvam%20AI-Indian%20Voice-purple" alt="Sarvam" />
  <img src="https://img.shields.io/badge/Vitest-Passing-success?logo=vitest" alt="Vitest" />
</p>

**VoiceQuery AI** is an ultra-low latency, production-grade conversational Voice RAG (Retrieval-Augmented Generation) system. Users upload complex PDF documents and speak naturally in real time (in English or 10+ Indian languages). The AI agent retrieves grounded excerpts from the document, cites page numbers with synchronized bounding-box highlight overlays, supports side-by-side multi-document comparison, and automatically synthesizes post-call interactive knowledge graphs.

---

## Table of Contents

- [System Architecture](#system-architecture)
- [Key Features](#key-features)
- [Monorepo Structure](#monorepo-structure)
- [Prerequisites & Environment Variables](#prerequisites--environment-variables)
- [Quickstart & Local Development](#quickstart--local-development)
- [REST API Reference](#rest-api-reference)
- [RAG Retrieval & Evaluation Benchmarks](#rag-retrieval--evaluation-benchmarks)
- [Telemetry & Observability](#telemetry--observability)
- [Testing](#testing)
- [Production Deployment](#production-deployment)

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                 REACT FRONTEND                                  │
│  - LiveKit Client (WebRTC Audio Stream & Data Channel)                          │
│  - PDF.js Dual Viewer with Real-Time Bounding-Box Coordinate Highlighting      │
│  - Document Comparison Switcher Bar & Live Telemetry HUD                        │
│  - ReactFlow Interactive Post-Call Knowledge Graph & Mermaid Recap Export       │
└────────────┬───────────────────────────────────────▲────────────────────────────┘
             │ 1. Upload PDF                         │ 3. Room Token & Dispatch
             ▼                                       │
┌─────────────────────────┐             ┌────────────┴────────────────────────────┐
│      NODE.JS BACKEND    │             │              LIVEKIT CLOUD              │
│ (Express + TypeScript)  │             │   - Ultra-low latency WebRTC server     │
│ - Multer Upload Handler │             │   - Audio track pub/sub                 │
│ - BullMQ Async Ingestion│             │   - Data channel telemetry broadcasts   │
│ - LangChain Chunking    │             └────────────┬────────────────────────────┘
│ - Prisma ORM (Postgres) │                          │
└────────────┬────────────┘                          │ 4. Worker Joins Dispatched Room
             │                                       ▼
             │ 2. Embeddings & Chunks  ┌──────────────────────────────────────────┐
             ▼                         │         LIVEKIT PYTHON AGENT             │
┌─────────────────────────┐            │ - Sarvam Saaras STT (Speech-to-Text)     │
│      QDRANT VECTOR DB   │ ◀──────────┤ - Groq LLM (gpt-oss-120b / 20b)          │
│ - Dense Embeddings      │  Retrieval │ - Sarvam Bulbul TTS (Text-to-Speech)     │
│ - Payload Page Filtering│            │ - Hybrid BM25 + BGE Reranker             │
└─────────────────────────┘            │ - Upstash / Redis Semantic Caching       │
                                       │ - OpenTelemetry Tracing Spans            │
                                       └──────────────────────────────────────────┘
```

### End-to-End Data Flow
1. **Document Ingestion**:
   - The user uploads one or more PDF files via the React interface.
   - The Express backend parses pages and coordinates using LangChain JS / PDF parser, generates dense embeddings using `BAAI/bge-small-en-v1.5` via the HuggingFace Inference API, and stores them in isolated Qdrant vector collections (`doc_<uuid>`).
   - Job queues are managed asynchronously via BullMQ on Redis.
2. **Session Initialization**:
   - The client requests a voice session with active document IDs.
   - The backend creates a LiveKit WebRTC room, sets document metadata in the room payload, dispatches the dedicated Python agent worker (`pdf-rag-agent`), and returns an access token to the client.
3. **Conversational Turn**:
   - The caller speaks. Audio is streamed over WebRTC to the Python agent.
   - **Sarvam Saaras STT** transcribes the speech with Indian accent optimization.
   - The agent checks the **Semantic Cache** (Redis) for an existing query vector match. On a miss, it executes hybrid search against Qdrant (dense vector + lexical BM25) and re-ranks candidate passages using `BAAI/bge-reranker-large`.
   - The grounded context and strict anti-hallucination prompt are passed to **Groq LLM** (`openai/gpt-oss-120b` or `20b`).
   - Groq streams response tokens into **Sarvam Bulbul TTS**, which streams natural synthesized speech back over WebRTC.
4. **Visual Synchronization & Bounding-Box Highlights**:
   - Concurrently, citation payloads containing exact page numbers and bounding box coordinates are published over the LiveKit data channel.
   - The frontend automatically navigates the PDF viewer to the relevant page and overlays glowing bounding-box highlights on the cited text.
5. **Post-Call Synthesis**:
   - Upon ending the call, the frontend compiles conversation turns and citations into an interactive ReactFlow Knowledge Graph and Mermaid mindmap detailing topics, referenced document sections, and actionable next steps.

---

## Key Features

### 1. Streaming Voice WebRTC Pipeline
- **Sub-Second Voice Turns**: Streamed end-to-end via WebRTC without waiting for complete audio file uploads.
- **Native Indian Language Support**: Seamless understanding and synthesis of Indian English, Hindi, Tamil, Telugu, Kannada, Bengali, and other regional languages via Sarvam AI.
- **Barge-in / Interruption Handling**: Turn detection built into the Sarvam STT pipeline automatically cancels ongoing agent TTS playback the moment the user begins speaking.

### 2. Precise Grounding & Bounding-Box Highlighting
- **Zero Hallucination Policy**: If the answer is not in the uploaded document, the agent states it explicitly rather than speculating.
- **Synchronized Viewport**: Citations emitted over LiveKit data channels include page number and coordinate rectangles (`x, y, width, height`), causing the client PDF viewer to pan and render visual highlight badges instantly.

### 3. Multi-Document Comparison Mode
- Compare clauses, technical specifications, or pricing across 2 or more PDFs simultaneously.
- Dual-viewer grid with an interactive document switcher bar and unified cross-collection vector retrieval.

### 4. Hybrid Retrieval + Cross-Encoder Reranker
- Combines dense vector similarity (`BAAI/bge-small-en-v1.5`) with BM25 keyword matching to capture technical abbreviations, part numbers, and semantic meaning.
- Candidate chunks are re-scored using `BAAI/bge-reranker-large` for precision context injection.

### 5. Semantic Caching (< 5ms Latency)
- Utilizes Redis vector cosine similarity caching. Repeated or paraphrased queries are answered in under 5ms, bypassing LLM generation entirely while preserving token quotas.

### 6. Interactive Post-Call Knowledge Graph
- Built with **ReactFlow** featuring customizable nodes (Document Hub, Topics, Document Sections, Action Items, Decisions).
- **Interactive Checklist**: Toggle completion states on extracted action items.
- **Inspector Drawer**: Click any node to inspect detailed excerpts, confidence tags, and source metadata.
- **Mermaid Export & Markdown Recap**: Export the entire conversation summary with embedded Mermaid flowchart code or download/print as a formatted PDF.

### 7. Full-Stack Telemetry & Observability
- OpenTelemetry spans record execution times for STT transcription, Qdrant retrieval, LLM Time-to-First-Token (TTFT), and TTS chunk generation.
- Real-time latency HUD visible during the call on the client.

---

## Monorepo Structure

```
voiceQueryAi/
├── agent/                         # Python 3.11 LiveKit Agent Worker
│   ├── app/
│   │   ├── main.py                # Entrypoint & room dispatch handler
│   │   ├── config.py              # Environment configuration & Pydantic settings
│   │   ├── session_builder.py     # Voice pipeline assembly (STT + LLM + TTS)
│   │   ├── rag/                   # Hybrid retrieval, Qdrant client & semantic cache
│   │   ├── prompts/               # System instructions & anti-hallucination prompts
│   │   ├── tools/                 # RAG search_document function tool
│   │   └── telemetry/             # OpenTelemetry tracing & latency tracking
│   ├── evaluation/                # RAGAS 50 QA pair benchmark suite & results
│   ├── Dockerfile
│   └── requirements.txt
├── backend/                       # Express + TypeScript + Prisma API
│   ├── src/
│   │   ├── app.ts                 # Express app configuration & middleware
│   │   ├── server.ts              # Server bootstrap & WebSocket setup
│   │   ├── config/                # LiveKit SDK, Qdrant, Redis & HF configs
│   │   ├── db/                    # Prisma client & schema.prisma
│   │   ├── middleware/            # Auth, file upload (Multer), rate limiters
│   │   ├── modules/
│   │   │   ├── documents/         # Upload, status, streaming, deletion
│   │   │   └── sessions/          # Room creation, agent dispatch, knowledge graph
│   │   ├── services/              # BullMQ ingestion queue & chunking worker
│   │   └── utils/
│   ├── tests/                     # Vitest unit & integration tests
│   ├── Dockerfile
│   └── package.json
├── frontend/                      # React 18 + Vite + TypeScript Client
│   ├── src/
│   │   ├── components/
│   │   │   ├── call/              # CallRoom, SessionSummaryModal, PostCallKnowledgeGraph
│   │   │   ├── documents/         # DocumentList, UploadZone, MultiDocComparison
│   │   │   └── pdf/               # PdfViewer with bounding box overlays
│   │   ├── hooks/                 # WebRTC & telemetry hooks
│   │   ├── utils/                 # knowledgeGraphBuilder.ts (Mermaid synthesis)
│   │   ├── index.css              # Custom styling & dark-theme design system
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   └── vite.config.ts
├── docker-compose.yml             # Local Postgres, Qdrant, and Redis services
├── .env.example                   # Master environment template
├── voiceQuery-Ai.md               # Architecture design & build history
└── README.md                      # Project documentation
```

---

## Prerequisites & Environment Variables

### Required Services & API Keys
1. **LiveKit Cloud** (or self-hosted LiveKit Server) — WebRTC media server and Agent worker dispatch.
2. **Groq API Key** — High-speed LLM inference (`openai/gpt-oss-120b` or `openai/gpt-oss-20b`).
3. **Sarvam AI API Key** — Indian voice STT (`saaras:v2`) and TTS (`bulbul:v3`).
4. **HuggingFace Inference API Token** — Vector embeddings via `router.huggingface.co`.
5. **Qdrant Vector Database** — Local Docker container (`:6333`) or Qdrant Cloud.
6. **PostgreSQL** — Relational database for documents and session metadata.
7. **Redis** — Backing store for BullMQ background ingestion and semantic cache.

### Master `.env` Configuration

Copy `.env.example` to `.env` in the root directory:

```bash
cp .env.example .env
```

| Variable | Description | Example / Default |
| :--- | :--- | :--- |
| `LIVEKIT_URL` | LiveKit WebRTC server WebSocket URL | `wss://your-project.livekit.cloud` |
| `LIVEKIT_API_KEY` | LiveKit API Key | `APIxxxxxxxxx` |
| `LIVEKIT_API_SECRET` | LiveKit API Secret | `secretxxxxxxxxx` |
| `GROQ_API_KEY` | Groq Cloud API Key | `gsk_xxxxxxxxx` |
| `SARVAM_API_KEY` | Sarvam AI API Key | `your-sarvam-key` |
| `HUGGINGFACE_API_KEY` | Hugging Face User Access Token | `hf_xxxxxxxxx` |
| `QDRANT_URL` | Qdrant Vector DB REST endpoint | `http://localhost:6333` |
| `QDRANT_API_KEY` | Qdrant API Key (optional for local) | `""` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:postgres@localhost:5432/pdf_voice_rag` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `PORT` | Backend HTTP Port | `4000` |
| `VITE_API_URL` | Frontend API Base URL | `http://localhost:4000/api` |

---

## Quickstart & Local Development

### Step 1: Start Infrastructure Services
Launch PostgreSQL, Qdrant, and Redis using Docker Compose:

```bash
docker compose up -d postgres qdrant redis
```

Verify services are running:
- PostgreSQL on port `5432`
- Qdrant on port `6333` (Web UI at `http://localhost:6333/dashboard`)
- Redis on port `6379`

---

### Step 2: Setup and Start the Backend

```bash
cd backend

# 1. Install dependencies
npm install

# 2. Run Prisma migrations
npx prisma migrate dev

# 3. Start development server
npm run dev
```

The Express API will be running on `http://localhost:4000`.

---

### Step 3: Setup and Start the Python Voice Agent

```bash
cd agent

# 1. Create and activate Python 3.11 virtual environment
python3.11 -m venv venv
source venv/bin/activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Start the agent worker in dev mode
python app/main.py dev
```

The agent process connects to LiveKit and listens for worker dispatch events with `agentName="pdf-rag-agent"`.

---

### Step 4: Setup and Start the Frontend

```bash
cd frontend

# 1. Install dependencies
npm install

# 2. Start Vite development server
npm run dev
```

Open your browser at `http://localhost:5173`.

---

## REST API Reference

All backend routes are prefixed with `/api`.

### Documents

#### 1. Upload Document(s)
- **Endpoint**: `POST /api/documents/upload`
- **Content-Type**: `multipart/form-data`
- **Body**: `files`: PDF file(s)
- **Response** (`202 Accepted`):
```json
{
  "documents": [
    {
      "id": "e43b18d2-5a21-4f91-88df-6f6eb8383f12",
      "filename": "SystemArchitecture.pdf",
      "status": "processing",
      "totalChunks": 0
    }
  ]
}
```

#### 2. Get Document Status
- **Endpoint**: `GET /api/documents/:id/status`
- **Response** (`200 OK`):
```json
{
  "id": "e43b18d2-5a21-4f91-88df-6f6eb8383f12",
  "status": "ready",
  "totalChunks": 42
}
```

#### 3. Stream Document File
- **Endpoint**: `GET /api/documents/:id/file`
- **Response**: Binary PDF stream (`application/pdf`)

#### 4. List Documents
- **Endpoint**: `GET /api/documents`
- **Response** (`200 OK`): Array of uploaded document records.

#### 5. Delete Document
- **Endpoint**: `DELETE /api/documents/:id`
- **Response** (`200 OK`): Deletes PostgreSQL row, Qdrant collection, and local file storage.

---

### Sessions & Voice Call

#### 1. Create Call Session & Dispatch Agent
- **Endpoint**: `POST /api/sessions`
- **Body**:
```json
{
  "documentId": "e43b18d2-5a21-4f91-88df-6f6eb8383f12",
  "documentIds": ["e43b18d2-5a21-4f91-88df-6f6eb8383f12"]
}
```
- **Response** (`200 OK`):
```json
{
  "roomName": "call-e43b18d2-5a21",
  "token": "eyJhbGciOi...",
  "livekitUrl": "wss://your-project.livekit.cloud"
}
```

#### 2. Generate Post-Call Knowledge Graph
- **Endpoint**: `POST /api/sessions/knowledge-graph`
- **Body**:
```json
{
  "documentTitle": "SystemArchitecture.pdf",
  "conversationPairs": [
    { "question": "What is the cache policy?", "answer": "Redis caches with 1-hour TTL." }
  ],
  "citations": [
    { "id": "cite-1", "page": 4, "section": "Caching", "snippet": "Redis key eviction policy..." }
  ]
}
```
- **Response** (`200 OK`): Structured topics, section mapping, action items, and decisions for visualization.

---

## RAG Retrieval & Evaluation Benchmarks

The retrieval architecture was rigorously evaluated across a **50 QA pair benchmark suite** representing complex real-world queries, multi-turn dialogue, table parsing, and technical specifications.

### Benchmark Results (RAG Triad)

| Metric | Baseline (Dense Search) | Optimized (Hybrid + Reranker + Semantic Cache) | Impact |
| :--- | :---: | :---: | :---: |
| **Faithfulness** | **100.00%** | **100.00%** | Zero hallucinations; strict grounding |
| **Answer Relevance** | 63.76% | **65.42%** | **+1.66%** higher query-response semantic alignment |
| **Context Recall** | 94.00% | **98.00%** | **+4.00%** boost via hybrid BM25 lexical recall |
| **Uncached Latency (p50)** | 566.7 ms | 1412.6 ms | Cross-encoder precision trade-off on cold queries |
| **Uncached Latency (p95)** | 941.2 ms | 1777.7 ms | Deep multi-stage candidate scoring |
| **Cached Query Latency** | N/A | **< 5.0 ms** | **99.6% latency reduction** on repeated queries |

Evaluation scripts and per-query telemetry are recorded in [`agent/evaluation/benchmark_results.json`](file:///Users/rajanayak/Desktop/Projects/voiceQueryAi/agent/evaluation/benchmark_results.json).

---

## Telemetry & Observability

Every conversational turn emits structured OpenTelemetry tracing spans:

1. `stt.transcription`: Audio frame ingestion to transcribed text.
2. `rag.retrieval`: Vector embedding generation, Qdrant hybrid retrieval, and cross-encoder re-ranking.
3. `llm.ttft`: Time until the first token emerges from the LLM.
4. `tts.synthesis`: Time taken to synthesize and begin streaming audio chunks back to the client.

Metrics are broadcasted over the LiveKit Data Channel and visualized in real time on the frontend **Call Metrics HUD**.

---

## Testing

### Backend Unit & Integration Tests
Uses [Vitest](https://vitest.dev/) for high-speed testing of controllers, chunking functions, and knowledge graph synthesis:

```bash
cd backend
npm test
```

### Frontend Typechecking & Production Build Validation

```bash
cd frontend
npm run build
```

---

## Production Deployment

### 1. Docker Compose (Full Stack)
The provided `docker-compose.yml` supports containerized deployment for PostgreSQL, Qdrant, Redis, Backend, and Agent:

```bash
docker compose up --build -d
```

### 2. Cloud Architecture Recommendations
- **Media & Voice Server**: LiveKit Cloud (managed WebRTC, global edge routing).
- **Relational DB**: Neon or Supabase (managed PostgreSQL).
- **Vector DB**: Qdrant Cloud cluster.
- **Cache & Queue**: Upstash Redis or AWS ElastiCache.
- **Frontend**: Vercel, Netlify, or Cloudflare Pages.
- **Backend & Agent Worker**: Fly.io, Railway, or AWS ECS/Fargate (agent must run as a persistent worker process).

---

## License

MIT License. Developed with ❤️ for next-generation multi-lingual Voice AI.
