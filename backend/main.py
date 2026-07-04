from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import ollama, json, os, uuid, asyncio
from rag import index_document, retrieve, get_stats, clear_collection, delete_chat_chunks, delete_file_chunks

app = FastAPI(title="studypal API", version="3.0")
app.add_middleware(CORSMiddleware,
  allow_origins=["http://localhost:5173","http://localhost:3000"],
  allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

OLLAMA_MODEL  = "llama3.2"
STICKIES_FILE = "stickies.json"
CHATS_FILE    = "chats.json"

class ChatRequest(BaseModel):
  chat_id: str
  question: str
  n_context: int = 6

class CreateChatRequest(BaseModel):
  title: str = "New Chat"

class UpdateChatRequest(BaseModel):
  title: str

class StickyNote(BaseModel):
  id: str = ""
  text: str = ""
  color: str = "yellow"
  x: float = 0
  y: float = 0
  rotation: float = 0

# ── Loaders & Savers ──
def load_stickies():
  if os.path.exists(STICKIES_FILE):
    with open(STICKIES_FILE) as f: return json.load(f)
  return []

def save_stickies(notes):
  with open(STICKIES_FILE,"w") as f: json.dump(notes, f, indent=2)

def load_chats():
  if os.path.exists(CHATS_FILE):
    try:
      with open(CHATS_FILE) as f: return json.load(f)
    except:
      pass
  return []

def save_chats(chats):
  with open(CHATS_FILE,"w") as f: json.dump(chats, f, indent=2)


@app.get("/") 
def root(): return {"status":"studypal running"}


# ── Chats Endpoints ──
@app.get("/chats")
def get_chats():
  return load_chats()

@app.post("/chats")
def create_chat(req: CreateChatRequest = None):
  chats = load_chats()
  new_id = str(uuid.uuid4())
  new_chat = {
    "id": new_id,
    "title": req.title if req else "New Chat",
    "files": [],
    "messages": []
  }
  chats.append(new_chat)
  save_chats(chats)
  return new_chat

@app.patch("/chats/{chat_id}")
def update_chat(chat_id: str, req: UpdateChatRequest):
  chats = load_chats()
  for c in chats:
    if c["id"] == chat_id:
      c["title"] = req.title
      save_chats(chats)
      return c
  raise HTTPException(404, "Chat not found")

@app.delete("/chats/{chat_id}")
def delete_chat(chat_id: str):
  chats = load_chats()
  new_chats = [c for c in chats if c["id"] != chat_id]
  save_chats(new_chats)
  delete_chat_chunks(chat_id)
  return {"message": "Chat deleted"}

@app.delete("/chats/{chat_id}/files")
def delete_chat_file(chat_id: str, filename: str):
  chats = load_chats()
  chat_index = -1
  for idx, c in enumerate(chats):
    if c["id"] == chat_id:
      chat_index = idx
      break
  if chat_index == -1:
    raise HTTPException(404, "Chat not found")
  
  chats[chat_index]["files"] = [f for f in chats[chat_index].get("files", []) if f["name"] != filename]
  save_chats(chats)
  delete_file_chunks(chat_id, filename)
  return {"message": f"File {filename} deleted successfully"}



# ── Chat & RAG Endpoints ──
@app.post("/upload")
async def upload(chat_id: str, file: UploadFile = File(...)):
  if not file.filename.endswith(".pdf"):
    raise HTTPException(400,"Only PDFs supported")
  
  chats = load_chats()
  chat_index = -1
  for idx, c in enumerate(chats):
    if c["id"] == chat_id:
      chat_index = idx
      break
  if chat_index == -1:
    raise HTTPException(404, "Chat not found")

  pdf_bytes = await file.read()
  result = index_document(pdf_bytes, file.filename, chat_id)
  if "error" in result: raise HTTPException(422, result["error"])
  
  existing_files = chats[chat_index].get("files", [])
  if not any(f["name"] == file.filename for f in existing_files):
    existing_files.append({
      "name": file.filename,
      "pages": result["pages_extracted"],
      "chunks": result["chunks_created"]
    })
    chats[chat_index]["files"] = existing_files
    save_chats(chats)
    
  return result

@app.post("/chat")
async def chat(req: ChatRequest):
  chats = load_chats()
  chat_index = -1
  for idx, c in enumerate(chats):
    if c["id"] == req.chat_id:
      chat_index = idx
      break
  if chat_index == -1:
    raise HTTPException(404, "Chat not found")

  chunks = retrieve(req.question, req.chat_id, req.n_context)

  if not chunks:
    async def no_docs():
      yield 'data: {"token": "No documents loaded yet in this chat — upload a PDF first."}\n\n'
      yield 'data: [DONE]\n\n'
    return StreamingResponse(no_docs(), media_type="text/event-stream")

  context_parts = [f"[Source: {c['source']}, Page {c['page']}]\n{c['text']}" for c in chunks]
  context = "\n\n---\n\n".join(context_parts)
  sources = [{"file":c["source"],"page":c["page"],"relevance":c["relevance"]} for c in chunks]

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

  # Build Ollama message array including history for conversational context
  ollama_messages = [{"role": "system", "content": system_prompt}]
  # Add up to 10 past messages for context
  for pm in chats[chat_index]["messages"][-10:]:
    ollama_messages.append({"role": pm["role"], "content": pm["content"]})
  # Append current user prompt with context
  ollama_messages.append({"role": "user", "content": user_prompt})

  # Append user message to history immediately
  chats[chat_index]["messages"].append({"role": "user", "content": req.question})
  save_chats(chats)

  async def stream():
    yield f'data: {json.dumps({"sources": sources})}\n\n'
    full_response = ""
    try:
      stream = ollama.chat(
        model=OLLAMA_MODEL,
        messages=ollama_messages,
        stream=True,
        options={"temperature":0.4, "num_predict":2048}  # longer answers
      )
      for chunk in stream:
        token = chunk["message"]["content"]
        if token:
          full_response += token
          yield f'data: {json.dumps({"token":token})}\n\n'
          await asyncio.sleep(0)
      
      # Append completed AI response to persistent history
      chats_latest = load_chats()
      for c in chats_latest:
        if c["id"] == req.chat_id:
          c["messages"].append({"role": "ai", "content": full_response})
          save_chats(chats_latest)
          break
    except Exception as e:
      yield f'data: {json.dumps({"error":str(e)})}\n\n'
    yield 'data: [DONE]\n\n'

  return StreamingResponse(stream(), media_type="text/event-stream",
    headers={"Cache-Control":"no-cache","X-Accel-Buffering":"no"})


@app.post("/summarize")
async def summarize(chat_id: str, file: UploadFile = File(...)):
  import fitz
  chats = load_chats()
  chat_index = -1
  for idx, c in enumerate(chats):
    if c["id"] == chat_id:
      chat_index = idx
      break
  if chat_index == -1:
    raise HTTPException(404, "Chat not found")

  pdf_bytes = await file.read()
  result = index_document(pdf_bytes, file.filename, chat_id)
  if "error" in result: raise HTTPException(422, result["error"])
  
  existing_files = chats[chat_index].get("files", [])
  if not any(f["name"] == file.filename for f in existing_files):
    existing_files.append({
      "name": file.filename,
      "pages": result["pages_extracted"],
      "chunks": result["chunks_created"]
    })
    chats[chat_index]["files"] = existing_files
    save_chats(chats)

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

  chats[chat_index]["messages"].append({"role": "user", "content": f"Summarize {file.filename}"})
  save_chats(chats)

  async def stream_summary():
    s = ollama.chat(model=OLLAMA_MODEL, messages=[{"role":"user","content":prompt}],
      stream=True, options={"temperature":0.3,"num_predict":2048})
    full_summary = ""
    for chunk in s:
      token = chunk["message"]["content"]
      if token:
        full_summary += token
        yield f'data: {json.dumps({"token":token})}\n\n'
        await asyncio.sleep(0)

    # Save summary to persistent history
    chats_latest = load_chats()
    for c in chats_latest:
      if c["id"] == chat_id:
        c["messages"].append({"role": "ai", "content": full_summary})
        save_chats(chats_latest)
        break

    yield 'data: [DONE]\n\n'

  return StreamingResponse(stream_summary(), media_type="text/event-stream")


@app.get("/stats")
def stats(chat_id: str = None): 
  return get_stats(chat_id)

@app.delete("/clear")
def clear(chat_id: str = None):
  if chat_id:
    # Clear only messages for this chat
    chats = load_chats()
    for c in chats:
      if c["id"] == chat_id:
        c["messages"] = []
        save_chats(chats)
        break
    delete_chat_chunks(chat_id)
  else:
    # Clear everything
    clear_collection()
    if os.path.exists(CHATS_FILE):
      os.remove(CHATS_FILE)
  return {"message":"Cleared"}


# ── Stickies Endpoints ──
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
