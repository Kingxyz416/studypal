<div align="center">

# 📚 studypal

### Your local AI-powered study assistant — ask questions, get answers, never leave your machine.

![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688?style=flat-square&logo=fastapi&logoColor=white)
![Ollama](https://img.shields.io/badge/Ollama-llama3.2-black?style=flat-square)
![ChromaDB](https://img.shields.io/badge/ChromaDB-vector--db-orange?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-purple?style=flat-square)
![Offline](https://img.shields.io/badge/runs-100%25%20offline-green?style=flat-square)

</div>

---

## ✨ Features

- 📄 **Upload any PDF** — lecture notes, textbooks, past papers, anything
- 🔍 **Ask questions in natural language** — get detailed, structured answers from your own material
- 🧠 **RAG-powered** — answers are grounded in your actual notes, not hallucinated
- 🌊 **Streaming responses** — answers appear word by word in real time
- 📌 **Sticky notes board** — pin colour-coded notes directly on the interface
- 🕐 **Chat history** — every question you've asked is saved in the sidebar
- 🌠 **Shooting star background** — because studying should feel cool
- 🔒 **100% local & offline** — your data never leaves your machine

---

## 🛠 Tech Stack

### Frontend
| Technology | Purpose |
|---|---|
| React 18 + Vite | UI framework and dev server |
| react-markdown | Renders AI answers as formatted markdown |
| Custom CSS | Minimal dark UI with animations |

### Backend
| Technology | Purpose |
|---|---|
| FastAPI | REST API server with SSE streaming |
| Ollama + llama3.2 | Local LLM for generating answers |
| ChromaDB | Vector database for storing embeddings |
| sentence-transformers | Converts text to semantic vectors (all-MiniLM-L6-v2) |
| PyMuPDF | PDF text extraction |

---

## 🚀 Getting Started

### Prerequisites

Make sure you have these installed before running studypal:

- [Python 3.10+](https://www.python.org/downloads/)
- [Node.js 18+](https://nodejs.org/)
- [Ollama](https://ollama.com/) with llama3.2 pulled

```bash
# Pull the AI model (one time, ~2GB download)
ollama pull llama3.2
```

### Installation

**1. Clone the repository**
```bash
git clone https://github.com/Kingxyz416/studypal.git
cd studypal
```

**2. Install backend dependencies**
```bash
cd backend
pip install fastapi uvicorn pymupdf sentence-transformers chromadb ollama python-multipart
```

**3. Install frontend dependencies**
```bash
cd ../frontend
npm install
```

### Running studypal

#### Option A — One click (Windows)
Simply double-click `start.bat` in the root folder. It will:
- Start Ollama automatically
- Launch the FastAPI backend
- Launch the React frontend
- Open your browser at `http://localhost:5173`

#### Option B — Manual
```bash
# Terminal 1 — Backend
cd backend
uvicorn main:app --reload --port 8000

# Terminal 2 — Frontend
cd frontend
npm run dev
```

Then open **http://localhost:5173** in your browser.

---

## 🧠 How It Works

studypal uses a technique called **RAG — Retrieval Augmented Generation**.

Instead of training a model on your notes (slow, expensive), RAG does this at query time:

```
📄 You upload a PDF
        ↓
✂️  Text is extracted and split into smart sentence-aware chunks
        ↓
🔢  Each chunk is converted into a vector (a list of numbers capturing meaning)
        ↓
💾  Vectors are stored in ChromaDB on your local machine
        ↓
❓  You ask a question
        ↓
🔍  Your question is also converted to a vector
        ↓
📐  ChromaDB finds the chunks most similar in meaning (cosine similarity)
        ↓
🤖  The top chunks + your question are sent to Ollama (llama3.2)
        ↓
💬  llama3.2 reads your actual notes and answers your question
```

This means the AI is **reading your material**, not guessing. Every answer is grounded in what you uploaded.

---

## 📁 Project Structure

```
studypal/
├── backend/
│   ├── main.py          # FastAPI server — all API endpoints
│   ├── rag.py           # RAG engine — chunking, embedding, retrieval
│   ├── chroma_db/       # Local vector database (auto-generated)
│   └── stickies.json    # Sticky notes persistence (auto-generated)
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx      # Main app — layout, state, all components
│   │   └── index.css    # Global styles
│   ├── index.html
│   ├── package.json
│   └── vite.config.js   # Vite config + API proxy to backend
│
├── start.bat            # One-click launcher (Windows)
├── stop.bat             # Stops all services

```

---


## 📝 License

MIT — feel free to use, modify, and build on this.

---

<div align="center">
  Built with 🖤 in the honor of my late cat COCO you sure will be missed i dedicate this project to you buddy fligh high 
</div>
