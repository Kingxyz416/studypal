import fitz, hashlib, re
from sentence_transformers import SentenceTransformer
import chromadb
from chromadb.config import Settings

EMBED_MODEL   = "all-MiniLM-L6-v2"
CHROMA_PATH   = "./chroma_db"
COLLECTION    = "studypal_v2"
CHUNK_TARGET  = 1000
CHUNK_OVERLAP = 150

print("Loading embedding model...")
_embed_model = SentenceTransformer(EMBED_MODEL)
_chroma_client = chromadb.PersistentClient(path=CHROMA_PATH, settings=Settings(anonymized_telemetry=False))
_collection = _chroma_client.get_or_create_collection(name=COLLECTION, metadata={"hnsw:space":"cosine"})
print("RAG engine ready.")

def extract_text_from_pdf(pdf_bytes):
  doc = fitz.open(stream=pdf_bytes, filetype="pdf")
  pages = []
  for i, page in enumerate(doc):
    blocks = page.get_text("blocks")
    text = "\n".join(b[4].strip() for b in sorted(blocks, key=lambda b:(b[1],b[0])) if b[6]==0 and b[4].strip())
    if text.strip(): pages.append({"page":i+1,"text":text})
  doc.close()
  return pages

def chunk_pages(pages):
  chunks = []
  for pd in pages:
    sentences = re.split(r'(?<=[.!?])\s+(?=[A-Z])', pd["text"])
    sentences = [s.strip() for s in sentences if s.strip()]
    if not sentences: continue
    cur, cur_len = [], 0
    for s in sentences:
      if cur_len + len(s) > CHUNK_TARGET and cur:
        chunks.append({"text":" ".join(cur),"page":pd["page"],"char_count":len(" ".join(cur))})
        overlap, ol = [], 0
        for ss in reversed(cur):
          if ol + len(ss) <= CHUNK_OVERLAP: overlap.insert(0,ss); ol+=len(ss)
          else: break
        cur, cur_len = overlap, ol
      cur.append(s); cur_len += len(s)
    if cur: chunks.append({"text":" ".join(cur),"page":pd["page"],"char_count":len(" ".join(cur))})
  return chunks

def index_document(pdf_bytes, filename):
  pages = extract_text_from_pdf(pdf_bytes)
  if not pages: return {"error":"No text found. PDF may be scanned."}
  chunks = chunk_pages(pages)
  if not chunks: return {"error":"Chunking failed."}
  texts = [c["text"] for c in chunks]
  embeddings = _embed_model.encode(texts, batch_size=32, show_progress_bar=False, normalize_embeddings=True).tolist()
  ids = [hashlib.md5(f"{filename}::chunk::{i}".encode()).hexdigest() for i in range(len(chunks))]
  metadatas = [{"source":filename,"page":c["page"],"chunk_index":i,"char_count":c["char_count"]} for i,c in enumerate(chunks)]
  _collection.upsert(ids=ids, documents=texts, embeddings=embeddings, metadatas=metadatas)
  return {"filename":filename,"pages_extracted":len(pages),"chunks_created":len(chunks),"avg_chunk_size":int(sum(c["char_count"] for c in chunks)/len(chunks))}

def retrieve(query, n_results=6):
  if _collection.count()==0: return []
  qe = _embed_model.encode(query, normalize_embeddings=True).tolist()
  results = _collection.query(query_embeddings=[qe], n_results=min(n_results,_collection.count()), include=["documents","metadatas","distances"])
  chunks = [{"text":doc,"source":meta["source"],"page":meta["page"],"relevance":round(1-dist,3)}
    for doc,meta,dist in zip(results["documents"][0],results["metadatas"][0],results["distances"][0])]
  chunks.sort(key=lambda x:x["relevance"],reverse=True)
  return chunks

def get_stats():
  count = _collection.count()
  if count==0: return {"total_chunks":0,"sources":[]}
  all_meta = _collection.get(include=["metadatas"])["metadatas"]
  sources = {}
  for m in all_meta:
    src = m["source"]
    if src not in sources: sources[src]={"chunks":0,"pages":set()}
    sources[src]["chunks"]+=1; sources[src]["pages"].add(m["page"])
  return {"total_chunks":count,"sources":[{"filename":k,"chunks":v["chunks"],"pages":len(v["pages"])} for k,v in sources.items()]}

def clear_collection():
  global _collection
  _chroma_client.delete_collection(COLLECTION)
  _collection = _chroma_client.get_or_create_collection(name=COLLECTION, metadata={"hnsw:space":"cosine"})
