import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import './index.css'

// ── Constants ──
const COLORS = [
  { id:'yellow', hex:'#fef08a' }, { id:'pink',   hex:'#fbcfe8' },
  { id:'green',  hex:'#a7f3d0' }, { id:'blue',   hex:'#bfdbfe' },
  { id:'orange', hex:'#fed7aa' }, { id:'purple', hex:'#ddd6fe' },
]
const SUGGESTIONS = [
  'Summarize key topics', 'Create quiz questions',
  'Explain the main concepts in depth', 'What should I focus on for exams?'
]

// ── Shooting stars canvas ──
function StarCanvas() {
  const ref = useRef()
  useEffect(() => {
    const c = ref.current
    const ctx = c.getContext('2d')
    let raf

    const resize = () => { c.width = c.offsetWidth; c.height = c.offsetHeight }
    resize()
    window.addEventListener('resize', resize)

    const stars = Array.from({length:120}, () => ({
      x: Math.random()*c.width, y: Math.random()*c.height,
      r: Math.random()*1+0.2, o: Math.random()*0.5+0.1,
      phase: Math.random() * Math.PI * 2,
      speed: 0.015 + Math.random()*0.025
    }))

    let shoots = []
    let nextShoot = Date.now() + 1500

    const spawnShoot = () => {
      shoots.push({
        x: Math.random() * c.width * 0.8,
        y: Math.random() * c.height * 0.5,
        len: 100 + Math.random()*80,
        speed: 8 + Math.random()*5,
        progress: 0,
        angle: Math.PI/5 + (Math.random()-0.5)*0.3,
        alpha: 1,
      })
      nextShoot = Date.now() + 5000
    }

    const draw = () => {
      ctx.clearRect(0,0,c.width,c.height)

      // stars
      stars.forEach(s => {
        s.phase += s.speed
        const op = s.o + Math.sin(s.phase)*0.25
        const finalOp = Math.max(0.05, Math.min(0.8, op))
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r, 0, Math.PI*2)
        ctx.fillStyle = `rgba(200,215,255,${finalOp})`
        ctx.fill()
      })

      // spawn
      if (Date.now() > nextShoot) spawnShoot()

      // draw shoots
      shoots = shoots.filter(s => s.progress < s.len + c.width)
      shoots.forEach(s => {
        s.progress += s.speed
        const tx = s.x + Math.cos(s.angle)*s.progress
        const ty = s.y + Math.sin(s.angle)*s.progress
        const tx0 = tx - Math.cos(s.angle)*Math.min(s.len, s.progress)
        const ty0 = ty - Math.sin(s.angle)*Math.min(s.len, s.progress)
        const g = ctx.createLinearGradient(tx0,ty0,tx,ty)
        g.addColorStop(0,'rgba(180,160,255,0)')
        g.addColorStop(0.7,'rgba(200,180,255,0.6)')
        g.addColorStop(1,'rgba(220,210,255,0.95)')
        ctx.beginPath()
        ctx.moveTo(tx0,ty0)
        ctx.lineTo(tx,ty)
        ctx.strokeStyle = g
        ctx.lineWidth = 1.2
        ctx.stroke()
        // head glow
        ctx.beginPath()
        ctx.arc(tx, ty, 1.8, 0, Math.PI*2)
        ctx.fillStyle = 'rgba(240,230,255,0.9)'
        ctx.fill()
      })

      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize) }
  }, [])
  return <canvas ref={ref} style={{position:'absolute',inset:0,width:'100%',height:'100%'}} />
}

// ── Main App ──
export default function App() {
  // Chat state
  const [messages, setMessages]   = useState([])
  const [input, setInput]         = useState('')
  const [streaming, setStreaming] = useState(false)
  const [history, setHistory]     = useState([])

  // Upload state
  const [files, setFiles]         = useState([])
  const [dragOver, setDragOver]   = useState(false)
  const [uploading, setUploading] = useState(false)

  // Sticky notes state
  const [notes, setNotes]         = useState([])
  const [selColor, setSelColor]   = useState('yellow')

  // Stats
  const [stats, setStats]         = useState({ total_chunks:0, sources:[] })

  const bottomRef  = useRef()
  const taRef      = useRef()
  const fileInputRef = useRef()

  // Load stickies + stats on mount
  useEffect(() => {
    fetch('/api/stickies').then(r=>r.json()).then(setNotes).catch(()=>{})
    fetch('/api/stats').then(r=>r.json()).then(setStats).catch(()=>{})
  }, [])

  // Auto scroll
  useEffect(() => { bottomRef.current?.scrollIntoView({behavior:'smooth'}) }, [messages])

  // Auto resize textarea
  useEffect(() => {
    const ta = taRef.current; if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 100) + 'px'
  }, [input])

  // ── Send message ──
  const sendMessage = async (q) => {
    const question = (q || input).trim()
    if (!question || streaming) return
    setInput('')
    setStreaming(true)

    // Add to history
    setHistory(prev => [{q: question, time: 'just now'}, ...prev.slice(0,19)])
    setMessages(prev => [...prev, {role:'user', content:question}])

    const aiId = Date.now()
    setMessages(prev => [...prev, {id:aiId, role:'ai', content:'', sources:[], streaming:true}])

    try {
      const res = await fetch('/api/chat', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({question, n_context:6})
      })
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const {done, value} = await reader.read()
        if (done) break
        buf += decoder.decode(value, {stream:true})
        const lines = buf.split('\n'); buf = lines.pop()
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') break
          try {
            const p = JSON.parse(data)
            if (p.sources) {
              setMessages(prev => prev.map(m => m.id===aiId ? {...m, sources:p.sources} : m))
            } else if (p.token) {
              setMessages(prev => prev.map(m => m.id===aiId ? {...m, content:m.content+p.token} : m))
            }
          } catch {}
        }
      }
    } catch(e) {
      setMessages(prev => prev.map(m => m.id===aiId ? {...m, content:'Error: '+e.message} : m))
    } finally {
      setMessages(prev => prev.map(m => m.id ? {...m, streaming:false} : m))
      setStreaming(false)
      fetch('/api/stats').then(r=>r.json()).then(setStats).catch(()=>{})
    }
  }

  const onKey = (e) => {
    if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  // ── Upload ──
  const uploadFile = async (file) => {
    if (!file.name.endsWith('.pdf')) return
    setFiles(prev => [...prev, {name:file.name, status:'loading', chunks:0, pages:0}])
    setUploading(true)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch('/api/upload', {method:'POST', body:fd})
      const data = await res.json()
      if (res.ok) {
        setFiles(prev => prev.map(f => f.name===file.name
          ? {...f, status:'ok', chunks:data.chunks_created, pages:data.pages_extracted} : f))
        fetch('/api/stats').then(r=>r.json()).then(setStats).catch(()=>{})
      }
    } catch {}
    finally { setUploading(false) }
  }

  const onDrop = (e) => { e.preventDefault(); setDragOver(false); Array.from(e.dataTransfer.files).forEach(uploadFile) }
  const onFileInput = (e) => { Array.from(e.target.files).forEach(uploadFile); e.target.value='' }

  // ── Sticky notes ──
  const addNote = async () => {
    const n = {text:'', color:selColor, x:0, y:0, rotation:(Math.random()-0.5)*4}
    const res = await fetch('/api/stickies', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(n)})
    const created = await res.json()
    setNotes(prev => [...prev, created])
  }

  const deleteNote = async (id) => {
    await fetch(`/api/stickies/${id}`, {method:'DELETE'})
    setNotes(prev => prev.filter(n => n.id !== id))
  }

  const updateNote = (id, text) => {
    setNotes(prev => prev.map(n => n.id===id ? {...n, text} : n))
    clearTimeout(window._nt)
    window._nt = setTimeout(async () => {
      const note = notes.find(n=>n.id===id)
      if (note) await fetch(`/api/stickies/${id}`, {method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({...note, text})})
    }, 800)
  }

  // ── Render ──
  return (
    <div className="app">

      {/* Topbar */}
      <header className="topbar">
        <div className="topbar-logo">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
          </svg>
          studypal
        </div>
        <div className="topbar-right">
          <div className="status-dot" />
          llama3.2 · {stats.total_chunks} chunks
        </div>
      </header>

      {/* Left panel */}
      <aside className="left-panel">
        {/* Upload */}
        <div className="upload-section">
          <div className="panel-label">Upload</div>
          <div
            className={`upload-zone ${dragOver ? 'drag' : ''}`}
            onDragOver={e=>{e.preventDefault();setDragOver(true)}}
            onDragLeave={()=>setDragOver(false)}
            onDrop={onDrop}
          >
            <input ref={fileInputRef} type="file" accept=".pdf" multiple onChange={onFileInput} />
            <div className="upload-icon">📄</div>
            <div className="upload-text">
              {uploading ? 'Processing…' : <><b>Click or drag</b> PDFs here</>}
            </div>
          </div>
          {files.length > 0 && (
            <div className="file-list">
              {files.map((f,i) => (
                <div key={i} className="file-chip">
                  <div className={`chip-dot ${f.status}`} />
                  <span className="file-chip-name">{f.name}</span>
                  {f.status==='ok' && <span className="file-chip-meta">{f.pages}p</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* History */}
        <div className="history-section">
          <div className="panel-label">History</div>
          {history.length === 0
            ? <div style={{fontSize:11,color:'var(--text-3)',opacity:0.5}}>No chats yet</div>
            : history.map((h,i) => (
              <div key={i} className="hist-item" onClick={()=>sendMessage(h.q)}>
                <div className="hist-q">{h.q}</div>
                <div className="hist-time">{h.time}</div>
              </div>
            ))
          }
        </div>
      </aside>

      {/* Center */}
      <main className="center">
        <StarCanvas />

        <div className="chat-messages">
          {messages.length === 0 ? (
            <div className="chat-empty">
              <div style={{fontSize:32,marginBottom:8}}>✦</div>
              <div className="chat-empty-title">Ask your notes anything</div>
              <div className="chat-empty-sub">Upload a PDF, then ask questions, get summaries, or generate quizzes.</div>
              <div className="suggestions">
                {SUGGESTIONS.map((s,i) => (
                  <button key={i} className="suggestion-pill" onClick={()=>sendMessage(s)}>{s}</button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg,i) => (
                <div key={i} className={`message ${msg.role}`}>
                  <div className={`msg-avatar ${msg.role}`}>
                    {msg.role==='user' ? '↑' : '✦'}
                  </div>
                  <div className={`msg-bubble ${msg.role} ${msg.streaming ? 'typing-cursor' : ''}`}>
                    {msg.role==='ai' ? (
                      <>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content || ' '}</ReactMarkdown>

                      </>
                    ) : msg.content}
                  </div>
                </div>
              ))}
              {!streaming && (
                <div style={{textAlign:'center'}}>
                  <button className="clear-btn" onClick={()=>setMessages([])}>clear chat</button>
                </div>
              )}
            </>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="chat-input-area">
          <div className="chat-input-row">
            <textarea
              ref={taRef}
              className="chat-textarea"
              value={input}
              onChange={e=>setInput(e.target.value)}
              onKeyDown={onKey}
              placeholder="Ask anything about your notes…"
              disabled={streaming}
              rows={1}
            />
            <button className="send-btn" onClick={()=>sendMessage()} disabled={!input.trim()||streaming}>
              ↑
            </button>
          </div>
        </div>
      </main>

      {/* Right panel — sticky notes */}
      <aside className="right-panel">
        <div className="right-panel-header">
          <div className="panel-label" style={{marginBottom:0}}>Notes</div>
          <button className="add-note-btn" onClick={addNote}>+ Add</button>
        </div>

        <div className="color-row">
          {COLORS.map(c => (
            <div
              key={c.id}
              className={`swatch ${selColor===c.id ? 'sel' : ''}`}
              style={{background:c.hex}}
              onClick={()=>setSelColor(c.id)}
            />
          ))}
        </div>

        <div className="sticky-list">
          {notes.length === 0
            ? <div className="sticky-empty">Pin a note →</div>
            : notes.map(n => (
              <div key={n.id} className={`sticky-card ${n.color}`} style={{transform:`rotate(${n.rotation||0}deg)`}}>
                <button className="sticky-del" onClick={()=>deleteNote(n.id)}>✕</button>
                <textarea
                  className="sticky-ta"
                  value={n.text}
                  onChange={e=>updateNote(n.id, e.target.value)}
                  placeholder="Type your note…"
                />
              </div>
            ))
          }
        </div>
      </aside>
    </div>
  )
}
