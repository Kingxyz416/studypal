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
  // Multi-Chat States
  const [chats, setChats]         = useState([])
  const [activeChatId, setActiveChatId] = useState(null)
  const [input, setInput]         = useState('')
  const [streaming, setStreaming] = useState(false)

  // Upload state
  const [dragOver, setDragOver]   = useState(false)
  const [uploading, setUploading] = useState(false)

  // Sticky notes state
  const [notes, setNotes]         = useState([])
  const [selColor, setSelColor]   = useState('yellow')

  // Chat title rename states
  const [editingTitle, setEditingTitle] = useState(false)
  const [tempTitle, setTempTitle] = useState('')

  const bottomRef  = useRef()
  const taRef      = useRef()
  const fileInputRef = useRef()
  const notesRef = useRef([])

  useEffect(() => {
    notesRef.current = notes
  }, [notes])

  // Derive active chat properties
  const activeChat = chats.find(c => c.id === activeChatId) || null
  const messages   = activeChat ? activeChat.messages : []
  const files      = activeChat ? activeChat.files || [] : []

  // Load stickies + chats on mount
  useEffect(() => {
    fetchChats()
    fetch('/api/stickies').then(r=>r.json()).then(setNotes).catch(()=>{})
  }, [])

  // Auto scroll
  useEffect(() => { bottomRef.current?.scrollIntoView({behavior:'smooth'}) }, [messages])

  // Auto resize textarea
  useEffect(() => {
    const ta = taRef.current; if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 100) + 'px'
  }, [input])

  const fetchChats = async () => {
    try {
      const res = await fetch('/api/chats')
      const data = await res.json()
      setChats(data)
      if (data.length > 0 && !activeChatId) {
        setActiveChatId(data[0].id)
      }
    } catch {}
  }

  const createChat = async () => {
    const defaultTitle = `Chat ${chats.length + 1}`
    const title = window.prompt("Enter a name for your new chat:", defaultTitle)
    if (title === null) return // User clicked Cancel
    const finalTitle = title.trim() || defaultTitle

    try {
      const res = await fetch('/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: finalTitle })
      })
      const newChat = await res.json()
      setChats(prev => [...prev, newChat])
      setActiveChatId(newChat.id)
      setEditingTitle(false)
    } catch {}
  }

  const deleteChat = async (id, e) => {
    e.stopPropagation()
    try {
      await fetch(`/api/chats/${id}`, { method: 'DELETE' })
      setChats(prev => {
        const nextChats = prev.filter(c => c.id !== id)
        if (activeChatId === id) {
          setActiveChatId(nextChats.length > 0 ? nextChats[0].id : null)
        }
        return nextChats
      })
    } catch {}
  }

  const deleteFile = async (filename, e) => {
    e.stopPropagation()
    if (!activeChatId) return
    try {
      await fetch(`/api/chats/${activeChatId}/files?filename=${encodeURIComponent(filename)}`, {
        method: 'DELETE'
      })
      fetchChats()
    } catch {}
  }

  const startRename = () => {
    if (!activeChat) return
    setTempTitle(activeChat.title)
    setEditingTitle(true)
  }

  const saveRename = async () => {
    if (!tempTitle.trim() || !activeChatId) {
      setEditingTitle(false)
      return
    }
    try {
      const res = await fetch(`/api/chats/${activeChatId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: tempTitle.trim() })
      })
      const updated = await res.json()
      setChats(prev => prev.map(c => c.id === activeChatId ? updated : c))
      setEditingTitle(false)
    } catch {}
  }

  const handleRenameKey = (e) => {
    if (e.key === 'Enter') saveRename()
    if (e.key === 'Escape') setEditingTitle(false)
  }

  // ── Send message ──
  const sendMessage = async (q) => {
    const question = (q || input).trim()
    if (!question || streaming || !activeChatId) return
    setInput('')
    setStreaming(true)

    const aiId = Date.now()

    // Add user & placeholder AI message locally
    setChats(prev => prev.map(c => {
      if (c.id === activeChatId) {
        return {
          ...c,
          messages: [
            ...c.messages,
            { role: 'user', content: question },
            { id: aiId, role: 'ai', content: '', sources: [], streaming: true }
          ]
        }
      }
      return c
    }))

    try {
      const res = await fetch('/api/chat', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({question, chat_id: activeChatId, n_context:6})
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
              setChats(prev => prev.map(c => {
                if (c.id === activeChatId) {
                  return {
                    ...c,
                    messages: c.messages.map(m => m.id===aiId ? {...m, sources:p.sources} : m)
                  }
                }
                return c
              }))
            } else if (p.token) {
              setChats(prev => prev.map(c => {
                if (c.id === activeChatId) {
                  return {
                    ...c,
                    messages: c.messages.map(m => m.id===aiId ? {...m, content:m.content+p.token} : m)
                  }
                }
                return c
              }))
            }
          } catch {}
        }
      }
    } catch(e) {
      setChats(prev => prev.map(c => {
        if (c.id === activeChatId) {
          return {
            ...c,
            messages: c.messages.map(m => m.id===aiId ? {...m, content:'Error: '+e.message} : m)
          }
        }
        return c
      }))
    } finally {
      setChats(prev => prev.map(c => {
        if (c.id === activeChatId) {
          return {
            ...c,
            messages: c.messages.map(m => m.id===aiId ? {...m, streaming:false} : m)
          }
        }
        return c
      }))
      setStreaming(false)
      fetchChats()
    }
  }

  const onKey = (e) => {
    if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  // ── Upload ──
  const uploadFile = async (file) => {
    if (!file.name.endsWith('.pdf') || !activeChatId) return
    
    // Add placeholder file chip to active chat
    setChats(prev => prev.map(c => {
      if (c.id === activeChatId) {
        return {
          ...c,
          files: [...(c.files || []), {name:file.name, status:'loading', chunks:0, pages:0}]
        }
      }
      return c
    }))
    setUploading(true)
    
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch(`/api/upload?chat_id=${activeChatId}`, {method:'POST', body:fd})
      const data = await res.json()
      if (res.ok) {
        setChats(prev => prev.map(c => {
          if (c.id === activeChatId) {
            return {
              ...c,
              files: (c.files || []).map(f => f.name===file.name
                ? {...f, status:'ok', chunks:data.chunks_created, pages:data.pages_extracted} : f)
            }
          }
          return c
        }))
      }
    } catch {}
    finally {
      setUploading(false)
      fetchChats()
    }
  }

  const onDrop = (e) => { e.preventDefault(); setDragOver(false); Array.from(e.dataTransfer.files).forEach(uploadFile) }
  const onFileInput = (e) => { Array.from(e.target.files).forEach(uploadFile); e.target.value='' }

  // ── Clear Chat History ──
  const handleClearChat = async () => {
    if (!activeChatId) return
    try {
      await fetch(`/api/clear?chat_id=${activeChatId}`, { method:'DELETE' })
      fetchChats()
    } catch {}
  }

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
      const note = notesRef.current.find(n=>n.id===id)
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
          <span>studypal</span>

          {activeChat && (
            <>
              <div className="topbar-separator" />
              <div className="chat-title-container">
                {editingTitle ? (
                  <input
                    type="text"
                    className="chat-title-input"
                    value={tempTitle}
                    onChange={e => setTempTitle(e.target.value)}
                    onBlur={saveRename}
                    onKeyDown={handleRenameKey}
                    autoFocus
                  />
                ) : (
                  <div className="chat-title-display" onClick={startRename} title="Click to rename chat">
                    {activeChat.title}
                    <span className="chat-title-edit-icon">✏️</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        <div className="topbar-right">
          <div className="status-dot" />
          llama3.2 · {files.reduce((sum, f) => sum + (f.chunks || 0), 0)} chunks
        </div>
      </header>

      {/* Left panel */}
      <aside className="left-panel">
        {/* Chats list (replacing old history) */}
        <div className="history-section">
          <div className="panel-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Chats</span>
            <button className="add-chat-btn" onClick={createChat}>+ New</button>
          </div>
          {chats.length === 0 ? (
            <div style={{fontSize:11,color:'var(--text-3)',opacity:0.5,padding:'8px 0'}}>
              No chats yet. Create one!
            </div>
          ) : (
            chats.map(c => (
              <div
                key={c.id}
                className={`hist-item ${c.id === activeChatId ? 'active-chat' : ''}`}
                onClick={() => {
                  setActiveChatId(c.id)
                  setEditingTitle(false)
                }}
              >
                <div className="hist-q" style={{ flex: 1 }}>{c.title}</div>
                <button
                  className="chat-delete-btn"
                  onClick={(e) => deleteChat(c.id, e)}
                  title="Delete Chat"
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>

        {/* Upload (scoped to active chat) */}
        <div className="upload-section" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="panel-label">Upload PDFs</div>
          <div
            className={`upload-zone ${dragOver ? 'drag' : ''} ${!activeChatId ? 'disabled' : ''}`}
            onDragOver={e=>{e.preventDefault(); if (activeChatId) setDragOver(true)}}
            onDragLeave={()=>setDragOver(false)}
            onDrop={onDrop}
            style={{ opacity: activeChatId ? 1 : 0.4, pointerEvents: activeChatId ? 'auto' : 'none' }}
          >
            <input ref={fileInputRef} type="file" accept=".pdf" multiple onChange={onFileInput} disabled={!activeChatId} />
            <div className="upload-icon">📄</div>
            <div className="upload-text">
              {uploading ? 'Processing…' : activeChatId ? <><b>Click or drag</b> PDFs here</> : <>Create a chat first</>}
            </div>
          </div>
          {files.length > 0 && (
            <div className="file-list">
              {files.map((f,i) => (
                <div key={i} className="file-chip" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flex: 1, minWidth: 0 }}>
                    <div className={`chip-dot ${f.status || 'ok'}`} />
                    <span className="file-chip-name" title={f.name}>{f.name}</span>
                    {f.status==='ok' && f.pages > 0 && <span className="file-chip-meta">{f.pages}p</span>}
                  </div>
                  <button
                    className="chat-delete-btn"
                    onClick={(e) => deleteFile(f.name, e)}
                    title="Delete PDF"
                    style={{ marginLeft: '4px' }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* Center */}
      <main className="center">
        <StarCanvas />

        <div className="chat-messages">
          {!activeChatId ? (
            <div className="chat-empty">
              <div style={{fontSize:32,marginBottom:8}}>✦</div>
              <div className="chat-empty-title">Select or Create a Chat</div>
              <div className="chat-empty-sub">Create a chat thread on the left to begin uploading files and starting study sessions.</div>
            </div>
          ) : messages.length === 0 ? (
            <div className="chat-empty">
              <div style={{fontSize:32,marginBottom:8}}>✦</div>
              <div className="chat-empty-title">Ask your notes anything</div>
              <div className="chat-empty-sub">Upload one or more PDFs to this chat, then ask questions, get summaries, or generate quizzes.</div>
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
                        {msg.sources && msg.sources.length > 0 && (
                          <div className="sources-bar">
                            {msg.sources.map((s, idx) => (
                              <div key={idx} className="source-chip" title={`Relevance: ${s.relevance || 'N/A'}`}>
                                {s.file} (p. {s.page})
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    ) : msg.content}
                  </div>
                </div>
              ))}
              {!streaming && (
                <div style={{textAlign:'center'}}>
                  <button className="clear-btn" onClick={handleClearChat}>clear chat history</button>
                </div>
              )}
            </>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="chat-input-area">
          <div className="chat-input-row" style={{ opacity: activeChatId ? 1 : 0.5 }}>
            <textarea
              ref={taRef}
              className="chat-textarea"
              value={input}
              onChange={e=>setInput(e.target.value)}
              onKeyDown={onKey}
              placeholder={activeChatId ? "Ask anything about your notes…" : "Select a chat first…"}
              disabled={streaming || !activeChatId}
              rows={1}
            />
            <button className="send-btn" onClick={()=>sendMessage()} disabled={!input.trim()||streaming||!activeChatId}>
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
