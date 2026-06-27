from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import ollama, json, os, uuid, asyncio
from rag import index_document, retrieve, get_stats, clear_collection

app = FastAPI(title="studypal API", version="2.0")
app.add_middleware(CORSMiddleware,
  allow_origins=["http://localhost:5173","http://localhost:3000"],
  allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

OLLAMA_MODEL  = "llama3.2"
STICKIES_FILE = "stickies.json"

class ChatRequest(BaseModel):
  question: str
  n_context: int = 6

class StickyNote(BaseModel):
  id: str = ""
  text: str = ""
  color: str = "yellow"
  x: float = 0
  y: float = 0
  rotation: float = 0

def load_stickies():
  if os.path.exists(STICKIES_FILE):
    with open(STICKIES_FILE) as f: return json.load(f)
  return []

def save_stickies(notes):
  with open(STICKIES_FILE,"w") as f: json.dump(notes, f, indent=2)

@app.get("/") 
def root(): return {"status":"studypal running"}

@app.post("/upload")
async def upload(file: UploadFile = File(...)):
  if not file.filename.endswith(".pdf"):
    raise HTTPException(400,"Only PDFs supported")
  pdf_bytes = await file.read()
  result = index_document(pdf_bytes, file.filename)
  if "error" in result: raise HTTPException(422, result["error"])
  return result

@app.post("/chat")
async def chat(req: ChatRequest):
  chunks = retrieve(req.question, req.n_context)

  if not chunks:
    async def no_docs():
      yield 'data: {"token": "No documents loaded yet — upload a PDF first."}\n\n'
      yield 'data: [DONE]\n\n'
    return StreamingResponse(no_docs(), media_type="text/event-stream")

  context_parts = [f"[Source: {c['source']}, Page {c['page']}]\n{c['text']}" for c in chunks]
  context = "\n\n---\n\n".join(context_parts)
  sources = [{"file":c["source"],"page":c["page"],"relevance":c["relevance"]} for c in chunks]

  # ── Upgraded prompt — forces long, detailed, structured answers ──
  system_prompt = """You are an expert study tutor and teacher. Your job is to give thorough, detailed, well-structured answers that genuinely help a student understand and remember the material.

RULES:
- Always answer in depth. Never give short or vague answers.
- Use the provided context from the student's notes as your primary source.
- Structure your answers clearly: use headers, bullet points, numbered steps, and examples wherever they help.
- After explaining a concept, always add a "Key Takeaway" or "Why This Matters" section.
- If the question asks for a summary, cover ALL major topics — don't skip anything.
- If asked for quiz questions, generate at least 5-8 varied questions (MCQ, short answer, true/false) with answers.
- If the answer involves a process or steps, always number them.
- Explain technical terms in simple language immediately after using them.
- If something is NOT in the notes, say so clearly — but still explain what you know about the topic generally.
- Never truncate. Always complete your answer fully."""

  user_prompt = f"""Here are the relevant sections from the student's uploaded notes:

{context}

Student's question: {req.question}

Give a thorough, detailed answer. Use markdown formatting with headers and bullet points. Be comprehensive — the student needs to understand this topic deeply."""

  async def stream():
    yield f'data: {json.dumps({"sources": sources})}\n\n'
    try:
      stream = ollama.chat(
        model=OLLAMA_MODEL,
        messages=[
          {"role":"system","content":system_prompt},
          {"role":"user","content":user_prompt}
        ],
        stream=True,
        options={"temperature":0.4, "num_predict":2048}  # longer answers
      )
      for chunk in stream:
        token = chunk["message"]["content"]
        if token:
          yield f'data: {json.dumps({"token":token})}\n\n'
          await asyncio.sleep(0)
    except Exception as e:
      yield f'data: {json.dumps({"error":str(e)})}\n\n'
    yield 'data: [DONE]\n\n'

  return StreamingResponse(stream(), media_type="text/event-stream",
    headers={"Cache-Control":"no-cache","X-Accel-Buffering":"no"})

@app.post("/summarize")
async def summarize(file: UploadFile = File(...)):
  import fitz
  pdf_bytes = await file.read()
  doc = fitz.open(stream=pdf_bytes, filetype="pdf")
  text = "".join(page.get_text() for page in doc)[:6000]
  doc.close()

  prompt = f"""Create a comprehensive, detailed study guide from this material.

Structure it as:
## 📌 Main Topic
## 🔑 Core Concepts (explain each one fully)
## 📝 Key Details & Facts
## 🔗 How Concepts Connect
## ❓ Likely Exam Questions (with answers)
## ⚡ Quick Review Bullets

Be thorough. Cover everything. Don't skip any important idea.

MATERIAL:
{text}"""

  async def stream_summary():
    s = ollama.chat(model=OLLAMA_MODEL, messages=[{"role":"user","content":prompt}],
      stream=True, options={"temperature":0.3,"num_predict":2048})
    for chunk in s:
      token = chunk["message"]["content"]
      if token:
        yield f'data: {json.dumps({"token":token})}\n\n'
        await asyncio.sleep(0)
    yield 'data: [DONE]\n\n'

  return StreamingResponse(stream_summary(), media_type="text/event-stream")

@app.get("/stats")
def stats(): return get_stats()

@app.delete("/clear")
def clear(): clear_collection(); return {"message":"Cleared"}

@app.get("/stickies")
def get_stickies(): return load_stickies()

@app.post("/stickies")
def create_sticky(note: StickyNote):
  notes = load_stickies()
  note.id = str(uuid.uuid4())
  notes.append(note.dict())
  save_stickies(notes)
  return note

@app.patch("/stickies/{note_id}")
def update_sticky(note_id: str, note: StickyNote):
  notes = load_stickies()
  for i,n in enumerate(notes):
    if n["id"] == note_id:
      updated = {**n, **note.dict(exclude_unset=True), "id":note_id}
      notes[i] = updated
      save_stickies(notes)
      return updated
  raise HTTPException(404,"Not found")

@app.delete("/stickies/{note_id}")
def delete_sticky(note_id: str):
  notes = [n for n in load_stickies() if n["id"] != note_id]
  save_stickies(notes)
  return {"message":"Deleted"}
