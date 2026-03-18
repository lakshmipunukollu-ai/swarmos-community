'use client'
import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { api } from '@/lib/api'
import { useStudyTimer } from '@/hooks/useStudyTimer'

const PROJECTS = [
  { id: 'fsp-agentic-scheduler', name: 'FSP Scheduler', company: 'Flight Schedule Pro' },
  { id: 'replicated-k8s-analyzer', name: 'K8s Analyzer', company: 'Replicated' },
  { id: 'servicecore-timetracking', name: 'Time Tracking', company: 'ServiceCore' },
  { id: 'zapier-triggers-api', name: 'Triggers API', company: 'Zapier' },
  { id: 'st6-weekly-commit', name: 'Weekly Commit', company: 'ST6' },
  { id: 'zeropath-security-scanner', name: 'Security Scanner', company: 'ZeroPath' },
  { id: 'medbridge-health-coach', name: 'Health Coach', company: 'Medbridge' },
  { id: 'companycam-content-detection', name: 'Content Detection', company: 'CompanyCam' },
  { id: 'upstream-ecommerce', name: 'E-commerce', company: 'Upstream Literacy' },
]

const TYPES = ['architecture', 'code', 'system_design', 'flashcard']
const LEVELS = [1, 2, 3, 4, 5]
const LEVEL_LABELS = ['What was built', 'Why decisions', 'How code works', 'What breaks', 'How to extend']

interface Question {
  id: number
  question: string
  correct_answer: string
  wrong_answers: string[]
  explanation: string
  level: number
  type: string
}

function QuizContent() {
  const searchParams = useSearchParams()
  const [projectId, setProjectId] = useState(searchParams.get('project') || PROJECTS[0].id)
  const [allProjects, setAllProjects] = useState<{ id: string; name: string }[]>([])
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set())
  const [shuffleMode, setShuffleMode] = useState(false)
  const [showProjectFilter, setShowProjectFilter] = useState(false)
  const [qtype, setQtype] = useState('architecture')
  const [level, setLevel] = useState(1)
  const [questions, setQuestions] = useState<Question[]>([])
  const [shuffledOptions, setShuffledOptions] = useState<string[]>([])
  const [current, setCurrent] = useState(0)
  const [answered, setAnswered] = useState<Record<number, string>>({})
  const [score, setScore] = useState({ correct: 0, total: 0 })
  const [generating, setGenerating] = useState(false)
  const [feedback, setFeedback] = useState<any>(null)
  const [quizMode, setQuizMode] = useState<'standard' | 'code'>('standard')
  const [projectFiles, setProjectFiles] = useState<{ path: string; size: number }[]>([])
  const [selectedFile, setSelectedFile] = useState('')
  const [walkthroughQuestions, setWalkthroughQuestions] = useState<any[]>([])
  const [walkthroughLoading, setWalkthroughLoading] = useState(false)
  const [walkthroughIndex, setWalkthroughIndex] = useState(0)
  const [fileContent, setFileContent] = useState<{ lines: string[]; language: string; file_path: string; line_count?: number } | null>(null)
  const [highlightedLines, setHighlightedLines] = useState<number[]>([])
  const codeRef = useRef<HTMLDivElement>(null)
  const highlightRef = useRef<HTMLDivElement>(null)
  const [errorAnalysis, setErrorAnalysis] = useState<any>(null)
  const [showErrorAnalysis, setShowErrorAnalysis] = useState(false)
  const [selectedTerm, setSelectedTerm] = useState('')
  const [termExplanation, setTermExplanation] = useState<any>(null)
  const [termLoading, setTermLoading] = useState(false)
  const [termPosition, setTermPosition] = useState({ x: 0, y: 0 })
  const [showTermPopup, setShowTermPopup] = useState(false)
  const [chatMessages, setChatMessages] = useState<{ role: string; content: string }[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [quizWorthyTopics, setQuizWorthyTopics] = useState<string[]>([])
  const [defendMode, setDefendMode] = useState(false)
  const [defendQuestion, setDefendQuestion] = useState<any>(null)
  const [defendAnswer, setDefendAnswer] = useState('')
  const [defendEval, setDefendEval] = useState<any>(null)
  const [defendLoading, setDefendLoading] = useState(false)
  const [defendFocus, setDefendFocus] = useState('what')

  useStudyTimer(projectId, 'quiz', questions.length > 0, score.total, score.correct)

  const loadFiles = useCallback(async (pid: string) => {
    const result = await api.listProjectFiles(pid)
    setProjectFiles(result.files || [])
  }, [])

  useEffect(() => {
    if (projectId) loadFiles(projectId)
  }, [projectId, loadFiles])

  useEffect(() => {
    api.getProjects().then(data => {
      const ps = data.map((p: any) => ({ id: p.id, name: p.name }))
      setAllProjects(ps)
      setSelectedProjects(new Set(ps.map((p: any) => p.id)))
    }).catch(() => {})
  }, [])

  const startWalkthrough = async () => {
    if (!projectId || !selectedFile) return
    setWalkthroughLoading(true)
    try {
      const [result, content] = await Promise.all([
        api.codeWalkthrough(projectId, selectedFile),
        api.getFileContent(projectId, selectedFile),
      ])
      setWalkthroughQuestions(result.questions || [])
      setWalkthroughIndex(0)
      if (!content.detail) {
        setFileContent(content)
      }
    } finally {
      setWalkthroughLoading(false)
    }
  }

  useEffect(() => {
    if (!walkthroughQuestions[walkthroughIndex]?.line_reference || !fileContent) return
    const ref = walkthroughQuestions[walkthroughIndex].line_reference
    const rangeMatch = ref.match(/lines?\s+(\d+)[-–](\d+)/i)
    const singleMatch = ref.match(/lines?\s+(\d+)/i)
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1]) - 1
      const end = parseInt(rangeMatch[2]) - 1
      const lines = Array.from({ length: end - start + 1 }, (_, i) => start + i)
      setHighlightedLines(lines)
      setTimeout(() => {
        if (highlightRef.current) {
          highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }, 100)
    } else if (singleMatch) {
      const line = parseInt(singleMatch[1]) - 1
      setHighlightedLines([line])
      setTimeout(() => {
        if (highlightRef.current) {
          highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }, 100)
    }
  }, [walkthroughIndex, walkthroughQuestions, fileContent])

  const q = questions[current]

  useEffect(() => {
    if (q) {
      const opts = [...(q.wrong_answers || []), q.correct_answer].sort(() => Math.random() - 0.5)
      setShuffledOptions(opts)
    }
  }, [current, questions])

  const getActiveProjectId = () => {
    if (shuffleMode && selectedProjects.size > 0) {
      const ids = Array.from(selectedProjects)
      return ids[Math.floor(Math.random() * ids.length)]
    }
    return projectId
  }

  const generate = useCallback(async (count = 5) => {
    setGenerating(true)
    try {
      const activeId = getActiveProjectId()
      const result = await api.generateQuiz(activeId, qtype, level, count)
      setQuestions(prev => [...prev, ...(result.questions || [])])
    } finally {
      setGenerating(false)
    }
  }, [projectId, qtype, level, shuffleMode, selectedProjects])

  const startFresh = async () => {
    setQuestions([])
    setAnswered({})
    setScore({ correct: 0, total: 0 })
    setCurrent(0)
    setFeedback(null)
    setGenerating(true)
    try {
      const activeId = getActiveProjectId()
      const result = await api.generateQuiz(activeId, qtype, level, 5)
      setQuestions(result.questions || [])
    } finally {
      setGenerating(false)
    }
  }

  const loadErrorAnalysis = async () => {
    const result = await api.getErrorAnalysis(projectId)
    setErrorAnalysis(result)
    setShowErrorAnalysis(true)
  }

  const handleCodeSelection = (e: React.MouseEvent) => {
    const selection = window.getSelection()
    const selected = selection?.toString().trim()
    if (selected && selected.length > 0 && selected.length < 100) {
      setSelectedTerm(selected)
      setTermPosition({ x: e.clientX, y: e.clientY })
      setShowTermPopup(true)
      setTermExplanation(null)
    } else {
      setShowTermPopup(false)
    }
  }

  const explainTerm = async (depth: string) => {
    if (!selectedTerm || !projectId) return
    setTermLoading(true)
    try {
      const contextCode = fileContent?.lines.slice(
        Math.max(0, (highlightedLines[0] ?? 0) - 5),
        (highlightedLines[highlightedLines.length - 1] ?? 0) + 5
      ).join('\n') ?? ''
      const result = await api.explainTerm(selectedTerm, contextCode, projectId, depth)
      setTermExplanation(result)
    } finally {
      setTermLoading(false)
    }
  }

  const sendChatMessage = async () => {
    if (!chatInput.trim() || !projectId || !selectedFile || !fileContent) return
    const question = chatInput
    setChatInput('')
    setChatMessages(prev => [...prev, { role: 'user', content: question }])
    setChatLoading(true)
    try {
      const result = await api.codeChat(
        projectId,
        selectedFile,
        fileContent.lines.join('\n'),
        question,
        [...chatMessages, { role: 'user', content: question }]
      )
      setChatMessages(prev => [...prev, { role: 'assistant', content: result.answer }])
          if (result.quiz_worthy) {
        setQuizWorthyTopics(prev => {
          const next = new Set(prev)
          next.add(result.quiz_worthy)
          return Array.from(next)
        })
      }
    } finally {
      setChatLoading(false)
    }
  }

  const answer = async (chosen: string) => {
    if (!q || answered[current] !== undefined) return
    const isCorrect = chosen === q.correct_answer
    setAnswered(prev => ({ ...prev, [current]: chosen }))
    setScore(s => ({ correct: s.correct + (isCorrect ? 1 : 0), total: s.total + 1 }))
    const result = await api.submitAttempt(q.id, projectId, chosen, isCorrect)
    setFeedback(result)
    if (current >= questions.length - 2) generate(3)
  }

  const next = () => {
    setCurrent(c => c + 1)
    setFeedback(null)
  }

  const accuracy = score.total > 0 ? Math.round((score.correct / score.total) * 100) : 0
  const hasAnswered = answered[current] !== undefined

  return (
    <div style={{ width: '100%' }}>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Quiz</div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 20 }}>
        Study what you built. Questions never run out. Keep going until you know it cold.
      </div>

      {/* Controls bar */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 18px', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
          {(['standard', 'code'] as const).map(mode => (
            <button key={mode} type="button" onClick={() => setQuizMode(mode)} style={{
              padding: '7px 16px', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase',
              borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'monospace',
              background: quizMode === mode ? 'var(--text)' : 'transparent',
              color: quizMode === mode ? 'var(--bg)' : 'var(--muted)',
            }}>{mode === 'standard' ? 'Standard quiz' : 'Code walkthrough'}</button>
          ))}
        </div>
        {quizMode === 'standard' && (
        <>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <button type="button" onClick={() => setShowProjectFilter(v => !v)} style={{
            padding: '7px 14px', fontSize: 11, borderRadius: 6,
            border: `1px solid ${showProjectFilter ? 'var(--blue)' : 'var(--border)'}`,
            background: showProjectFilter ? 'rgba(56,139,221,0.08)' : 'transparent',
            color: showProjectFilter ? 'var(--blue)' : 'var(--muted)',
            cursor: 'pointer', fontFamily: 'monospace',
          }}>
            ⚙ Filter projects ({selectedProjects.size}/{allProjects.length})
          </button>
          <button type="button" onClick={() => setShuffleMode(v => !v)} style={{
            padding: '7px 14px', fontSize: 11, borderRadius: 6,
            border: `1px solid ${shuffleMode ? 'var(--amber)' : 'var(--border)'}`,
            background: shuffleMode ? 'rgba(245,166,35,0.08)' : 'transparent',
            color: shuffleMode ? 'var(--amber)' : 'var(--muted)',
            cursor: 'pointer', fontFamily: 'monospace',
          }}>
            {shuffleMode ? '⇄ Shuffle on' : '⇄ Shuffle off'}
          </button>
        </div>
        {showProjectFilter && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 14, marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Select projects</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => setSelectedProjects(new Set(allProjects.map(p => p.id)))} style={{ fontSize: 10, color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer' }}>All</button>
                <button type="button" onClick={() => setSelectedProjects(new Set())} style={{ fontSize: 10, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>None</button>
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {allProjects.map(p => {
                const selected = selectedProjects.has(p.id)
                return (
                  <button key={p.id} type="button" onClick={() => {
                    setSelectedProjects(prev => {
                      const next = new Set(prev)
                      if (next.has(p.id)) next.delete(p.id)
                      else { next.add(p.id); setProjectId(p.id) }
                      return next
                    })
                  }} style={{
                    padding: '5px 12px', fontSize: 11, borderRadius: 20,
                    border: `1px solid ${selected ? 'var(--green)' : 'var(--border)'}`,
                    background: selected ? 'rgba(74,222,128,0.08)' : 'transparent',
                    color: selected ? 'var(--green)' : 'var(--muted)',
                    cursor: 'pointer', fontFamily: 'monospace',
                  }}>
                    {p.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: '0 0 260px' }}>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 1 }}>Project</div>
            <select value={projectId} onChange={e => setProjectId(e.target.value)}
              style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontFamily: 'monospace', fontSize: 12, padding: '7px 10px' }}>
              {(allProjects.length ? allProjects : PROJECTS.map(p => ({ id: p.id, name: p.name }))).map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 1 }}>Type</div>
            <div style={{ display: 'flex', gap: 4 }}>
              {TYPES.map(t => (
                <button key={t} type="button" onClick={() => setQtype(t)} style={{
                  padding: '5px 10px', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase',
                  border: '1px solid var(--border)', borderRadius: 20, cursor: 'pointer', fontFamily: 'monospace',
                  background: qtype === t ? 'var(--text)' : 'transparent',
                  color: qtype === t ? 'var(--bg)' : 'var(--muted)',
                }}>{t.replace('_', ' ')}</button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 1 }}>Level — {LEVEL_LABELS[level - 1]}</div>
            <div style={{ display: 'flex', gap: 4 }}>
              {LEVELS.map((l, i) => (
                <button key={l} type="button" onClick={() => setLevel(l)} title={LEVEL_LABELS[i]} style={{
                  width: 32, height: 32, fontSize: 13, fontFamily: 'monospace', fontWeight: 700,
                  border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer',
                  background: level === l ? 'var(--text)' : 'transparent',
                  color: level === l ? 'var(--bg)' : 'var(--muted)',
                }}>{l}</button>
              ))}
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <button type="button" onClick={async () => {
              setGenerating(true)
              try {
                const result = await api.generateAdaptiveQuiz(projectId, quizWorthyTopics)
                setQuestions(result.questions || [])
                setCurrent(0)
              } finally {
                setGenerating(false)
              }
            }} disabled={generating} style={{
              padding: '8px 16px', fontSize: 11, borderRadius: 6,
              border: '1px solid var(--purple, var(--blue))', background: 'transparent',
              color: 'var(--blue)', cursor: generating ? 'not-allowed' : 'pointer', fontFamily: 'monospace',
            }}>
              {generating ? 'Generating...' : '⚡ Adaptive quiz'}
            </button>
            <button type="button" onClick={loadErrorAnalysis} style={{
              padding: '7px 14px', fontSize: 11, borderRadius: 6,
              border: '1px solid var(--red)', background: 'transparent',
              color: 'var(--red)', cursor: 'pointer', fontFamily: 'monospace',
            }}>
              Error analysis
            </button>
            <button type="button" onClick={startFresh} disabled={generating} style={{
              padding: '10px 22px', background: generating ? 'var(--border)' : 'var(--text)',
              color: 'var(--bg)', border: 'none', borderRadius: 6, cursor: generating ? 'not-allowed' : 'pointer',
              fontSize: 12, fontWeight: 700, fontFamily: 'monospace',
            }}>
              {generating ? 'Generating...' : questions.length > 0 ? 'New session' : 'Start quiz'}
            </button>
          </div>
        </div>
        </>
        )}
        {quizMode === 'code' && (
          <div style={{ flex: '0 0 260px', maxWidth: 400 }}>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 1 }}>Project</div>
            <select value={projectId} onChange={e => setProjectId(e.target.value)}
              style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontFamily: 'monospace', fontSize: 12, padding: '7px 10px' }}>
              {PROJECTS.map(p => <option key={p.id} value={p.id}>{p.name} — {p.company}</option>)}
            </select>
          </div>
        )}
      </div>

      {showErrorAnalysis && errorAnalysis && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: 1 }}>Error analysis</div>
            <button type="button" onClick={() => setShowErrorAnalysis(false)} style={{ fontSize: 11, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
          </div>

          {errorAnalysis.patterns?.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>No incorrect answers yet — keep quizzing!</div>
          ) : (
            <>
              <div style={{ marginBottom: 12 }}>
                {errorAnalysis.patterns?.map((p: any, i: number) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 12, color: 'var(--text)', textTransform: 'capitalize' }}>{p.type?.replace('_', ' ')}</span>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>{p.wrong_count} wrong / {p.total} total</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: p.needs_work ? 'var(--red)' : 'var(--green)' }}>{p.accuracy}%</span>
                    </div>
                  </div>
                ))}
              </div>

              {errorAnalysis.worst_questions?.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Hardest questions</div>
                  {errorAnalysis.worst_questions.map((q: any, i: number) => (
                    <div key={i} style={{ fontSize: 11, color: 'var(--text)', padding: '4px 0', lineHeight: 1.5 }}>
                      <span style={{ color: 'var(--red)', marginRight: 6 }}>{q.accuracy}%</span>
                      {q.question}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {quizMode === 'code' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Select file</div>
            <select
              value={selectedFile}
              onChange={e => setSelectedFile(e.target.value)}
              style={{
                width: '100%', padding: '10px 14px',
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 8, color: 'var(--text)', fontSize: 12, fontFamily: 'monospace',
              }}
            >
              <option value="">Choose a file...</option>
              {projectFiles.map(f => (
                <option key={f.path} value={f.path}>{f.path} ({Math.round(f.size / 1024)}kb)</option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={startWalkthrough}
            disabled={!selectedFile || walkthroughLoading}
            style={{
              padding: '11px 0', background: 'var(--text)', color: 'var(--bg)',
              border: 'none', borderRadius: 8, cursor: 'pointer',
              fontSize: 13, fontWeight: 700, fontFamily: 'monospace',
            }}
          >
            {walkthroughLoading ? 'Reading file...' : 'Generate walkthrough'}
          </button>

          {walkthroughQuestions.length > 0 && (
            <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, height: 'calc(100vh - 280px)' }}>

              {/* LEFT: Source code panel */}
              <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: 1 }}>
                    {fileContent?.file_path || selectedFile}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--border)' }}>
                    {fileContent?.line_count} lines
                  </div>
                </div>
                <div ref={codeRef} onMouseUp={handleCodeSelection} style={{
                  flex: 1, overflowY: 'auto', background: 'var(--bg)',
                  border: '1px solid var(--border)', borderRadius: 8,
                  fontFamily: 'monospace', fontSize: 11, lineHeight: 1.8,
                }}>
                  {fileContent ? (
                    fileContent.lines.map((line, i) => {
                      const isHighlighted = highlightedLines.includes(i)
                      const isFirstHighlight = isHighlighted && (i === 0 || !highlightedLines.includes(i - 1))
                      return (
                        <div
                          key={i}
                          ref={isFirstHighlight ? highlightRef : undefined}
                          style={{
                            display: 'flex',
                            background: isHighlighted ? 'rgba(245,166,35,0.15)' : 'transparent',
                            borderLeft: isHighlighted ? '3px solid var(--amber)' : '3px solid transparent',
                            transition: 'background 0.2s',
                          }}
                        >
                          <span style={{
                            minWidth: 40, padding: '0 8px', color: 'var(--border)',
                            fontSize: 10, userSelect: 'none', flexShrink: 0,
                            textAlign: 'right',
                          }}>
                            {i + 1}
                          </span>
                          <span style={{
                            padding: '0 8px', color: isHighlighted ? 'var(--text)' : 'var(--muted)',
                            whiteSpace: 'pre', flex: 1, overflow: 'hidden',
                          }}>
                            {line || ' '}
                          </span>
                        </div>
                      )
                    })
                  ) : (
                    <div style={{ padding: 16, color: 'var(--muted)', fontSize: 12 }}>
                      File content not available locally. Run SwarmOS locally with SWARM_PROJECTS_DIR set to see code.
                    </div>
                  )}
                </div>
                {fileContent && highlightedLines.length > 0 && (
                  <button type="button" onClick={() => setDefendMode(true)} style={{
                    marginTop: 8, padding: '7px 14px', fontSize: 11, borderRadius: 6,
                    border: '1px solid var(--red)', background: 'transparent',
                    color: 'var(--red)', cursor: 'pointer', fontFamily: 'monospace',
                  }}>
                    ⚔ Defend this code
                  </button>
                )}
              </div>

              {showTermPopup && (
                <div style={{
                  position: 'fixed',
                  left: Math.min(termPosition.x, window.innerWidth - 340),
                  top: termPosition.y + 10,
                  width: 320, zIndex: 1000,
                  background: 'var(--bg)', border: '1px solid var(--amber)',
                  borderRadius: 10, padding: 14, boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--amber)', fontFamily: 'monospace' }}>
                      🔍 {selectedTerm}
                    </div>
                    <button onClick={() => setShowTermPopup(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 14 }}>✕</button>
                  </div>

                  <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                    {[
                      { id: 'simple', label: '🧒 Simple' },
                      { id: 'detailed', label: '📖 Detailed' },
                      { id: 'example', label: '💻 Example' },
                    ].map(d => (
                      <button key={d.id} onClick={() => explainTerm(d.id)} style={{
                        flex: 1, padding: '5px 0', fontSize: 10, borderRadius: 6,
                        border: `1px solid ${termExplanation?.depth === d.id ? 'var(--amber)' : 'var(--border)'}`,
                        background: termExplanation?.depth === d.id ? 'rgba(245,166,35,0.1)' : 'transparent',
                        color: termExplanation?.depth === d.id ? 'var(--amber)' : 'var(--muted)',
                        cursor: 'pointer', fontFamily: 'monospace',
                      }}>{d.label}</button>
                    ))}
                  </div>

                  {termLoading && <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>Explaining...</div>}

                  {termExplanation && (
                    <div>
                      <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                        {termExplanation.explanation}
                      </div>
                      <button onClick={() => {
                        setShowTermPopup(false)
                        setChatInput(`Can you explain more about ${selectedTerm} and how it's used in this file?`)
                        setShowChat(true)
                      }} style={{
                        marginTop: 10, width: '100%', padding: '6px 0', fontSize: 11,
                        border: '1px solid var(--border)', borderRadius: 6, background: 'transparent',
                        color: 'var(--muted)', cursor: 'pointer', fontFamily: 'monospace',
                      }}>
                        Ask a follow-up question →
                      </button>
                    </div>
                  )}

                  {!termExplanation && !termLoading && (
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>Click a button above to explain this term</div>
                  )}
                </div>
              )}

              {/* RIGHT: Question panel */}
              <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
                    Question {walkthroughIndex + 1} of {walkthroughQuestions.length}
                  </div>
                  {walkthroughQuestions[walkthroughIndex]?.line_reference && (
                    <span style={{ fontSize: 10, color: 'var(--amber)', fontFamily: 'monospace' }}>
                      ↑ {walkthroughQuestions[walkthroughIndex].line_reference}
                    </span>
                  )}
                </div>

                <div style={{
                  flex: 1, overflowY: 'auto', background: 'var(--surface)',
                  border: '1px solid var(--border)', borderRadius: 8, padding: 16,
                }}>
                  <div style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.6, marginBottom: 20, color: 'var(--text)' }}>
                    {walkthroughQuestions[walkthroughIndex]?.question}
                  </div>

                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginBottom: 14 }}>
                    <div style={{ fontSize: 10, color: 'var(--green)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Answer</div>
                    <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.7 }}>
                      {walkthroughQuestions[walkthroughIndex]?.correct_answer}
                    </div>
                  </div>

                  {walkthroughQuestions[walkthroughIndex]?.explanation && (
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                      <div style={{ fontSize: 10, color: 'var(--amber)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Why it matters</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.7 }}>
                        {walkthroughQuestions[walkthroughIndex]?.explanation}
                      </div>
                    </div>
                  )}
                </div>

                {/* Navigation */}
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button
                    onClick={() => setWalkthroughIndex(i => Math.max(0, i - 1))}
                    disabled={walkthroughIndex === 0}
                    style={{
                      flex: 1, padding: '9px 0', background: 'transparent',
                      border: '1px solid var(--border)', borderRadius: 6,
                      cursor: walkthroughIndex === 0 ? 'not-allowed' : 'pointer',
                      color: 'var(--muted)', fontFamily: 'monospace', fontSize: 12,
                    }}
                  >← Prev</button>
                  <button
                    onClick={() => setWalkthroughIndex(i => Math.min(walkthroughQuestions.length - 1, i + 1))}
                    disabled={walkthroughIndex === walkthroughQuestions.length - 1}
                    style={{
                      flex: 1, padding: '9px 0', background: 'var(--text)', color: 'var(--bg)',
                      border: 'none', borderRadius: 6,
                      cursor: walkthroughIndex === walkthroughQuestions.length - 1 ? 'not-allowed' : 'pointer',
                      fontFamily: 'monospace', fontSize: 12, fontWeight: 700,
                    }}
                  >Next →</button>
                </div>
              </div>
            </div>

            {defendMode && fileContent && (
              <div style={{ marginTop: 12, background: 'var(--surface)', border: '1px solid var(--red)', borderRadius: 10, padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: 1 }}>⚔ Defend your code</div>
                  <button type="button" onClick={() => { setDefendMode(false); setDefendQuestion(null); setDefendEval(null); setDefendAnswer('') }} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 14 }}>✕</button>
                </div>

                {!defendQuestion && (
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>What should I challenge you on?</div>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                      {[
                        { id: 'what', label: 'What it does' },
                        { id: 'why', label: 'Why this approach' },
                        { id: 'change', label: 'What you\'d change' },
                        { id: 'weakness', label: 'Find the weakness' },
                      ].map(f => (
                        <button key={f.id} type="button" onClick={() => setDefendFocus(f.id)} style={{
                          padding: '5px 12px', fontSize: 11, borderRadius: 20,
                          border: `1px solid ${defendFocus === f.id ? 'var(--red)' : 'var(--border)'}`,
                          background: defendFocus === f.id ? 'rgba(248,113,113,0.1)' : 'transparent',
                          color: defendFocus === f.id ? 'var(--red)' : 'var(--muted)',
                          cursor: 'pointer', fontFamily: 'monospace',
                        }}>{f.label}</button>
                      ))}
                    </div>
                    <button type="button" onClick={async () => {
                      setDefendLoading(true)
                      try {
                        const snippet = fileContent.lines.slice(
                          Math.max(0, highlightedLines[0] - 2),
                          (highlightedLines[highlightedLines.length - 1] ?? highlightedLines[0]) + 3
                        ).join('\n')
                        const result = await api.getDefendQuestion(projectId, selectedFile, snippet, defendFocus)
                        setDefendQuestion(result)
                      } finally {
                        setDefendLoading(false)
                      }
                    }} disabled={defendLoading} style={{
                      width: '100%', padding: '10px 0', background: 'var(--red)', color: '#fff',
                      border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'monospace',
                    }}>
                      {defendLoading ? 'Generating challenge...' : 'Challenge me →'}
                    </button>
                  </div>
                )}

                {defendQuestion && !defendEval && (
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', lineHeight: 1.6, marginBottom: 14 }}>
                      {defendQuestion.question}
                    </div>
                    <textarea
                      value={defendAnswer}
                      onChange={e => setDefendAnswer(e.target.value)}
                      placeholder="Defend your code..."
                      style={{
                        width: '100%', minHeight: 100, padding: '10px 14px',
                        background: 'var(--bg)', border: '1px solid var(--border)',
                        borderRadius: 8, color: 'var(--text)', fontSize: 13,
                        resize: 'vertical', outline: 'none', fontFamily: 'inherit', lineHeight: 1.6,
                      }}
                    />
                    <button type="button" onClick={async () => {
                      if (!defendAnswer.trim()) return
                      setDefendLoading(true)
                      try {
                        const snippet = fileContent.lines.slice(
                          Math.max(0, highlightedLines[0] - 2),
                          (highlightedLines[highlightedLines.length - 1] ?? highlightedLines[0]) + 3
                        ).join('\n')
                        const result = await api.evaluateDefense(projectId, selectedFile, snippet, defendQuestion.question, defendAnswer)
                        setDefendEval(result)
                      } finally {
                        setDefendLoading(false)
                      }
                    }} disabled={defendLoading || !defendAnswer.trim()} style={{
                      marginTop: 10, width: '100%', padding: '10px 0', background: 'var(--text)', color: 'var(--bg)',
                      border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'monospace',
                    }}>
                      {defendLoading ? 'Evaluating...' : 'Submit defense →'}
                    </button>
                  </div>
                )}

                {defendEval && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: defendEval.verdict === 'strong' ? 'var(--green)' : defendEval.verdict === 'weak' ? 'var(--red)' : 'var(--amber)' }}>
                        {defendEval.verdict === 'strong' ? '✓ Strong defense' : defendEval.verdict === 'weak' ? '✗ Needs work' : '~ Acceptable'}
                      </span>
                      <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{defendEval.score}/100</span>
                    </div>

                    {defendEval.what_they_got_right?.length > 0 && (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 10, color: 'var(--green)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>✓ Got right</div>
                        {defendEval.what_they_got_right.map((p: string, i: number) => (
                          <div key={i} style={{ fontSize: 12, color: 'var(--text)', padding: '2px 0', lineHeight: 1.5 }}>› {p}</div>
                        ))}
                      </div>
                    )}

                    {defendEval.what_they_missed?.length > 0 && (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 10, color: 'var(--red)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>✗ Missed</div>
                        {defendEval.what_they_missed.map((p: string, i: number) => (
                          <div key={i} style={{ fontSize: 12, color: 'var(--text)', padding: '2px 0', lineHeight: 1.5 }}>› {p}</div>
                        ))}
                      </div>
                    )}

                    {defendEval.coaching_tip && (
                      <div style={{ fontSize: 12, color: 'var(--amber)', padding: '8px 12px', background: 'rgba(245,166,35,0.06)', borderRadius: 6, border: '1px solid rgba(245,166,35,0.3)' }}>
                        💡 {defendEval.coaching_tip}
                      </div>
                    )}

                    <button type="button" onClick={() => { setDefendQuestion(null); setDefendEval(null); setDefendAnswer('') }} style={{
                      marginTop: 10, width: '100%', padding: '8px 0', background: 'transparent',
                      border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer',
                      fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace',
                    }}>Try another challenge</button>
                  </div>
                )}
              </div>
            )}

            {/* Inline Q&A Chat */}
            <div style={{ marginTop: 12 }}>
              <button onClick={() => setShowChat(v => !v)} style={{
                padding: '7px 16px', fontSize: 11, borderRadius: 6,
                border: `1px solid ${showChat ? 'var(--blue)' : 'var(--border)'}`,
                background: showChat ? 'rgba(56,139,221,0.08)' : 'transparent',
                color: showChat ? 'var(--blue)' : 'var(--muted)',
                cursor: 'pointer', fontFamily: 'monospace',
              }}>
                {showChat ? '▼ Hide Q&A chat' : '▶ Ask questions about this file'}
              </button>

              {quizWorthyTopics.length > 0 && (
                <div style={{ display: 'inline-flex', gap: 6, marginLeft: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10, color: 'var(--muted)' }}>Quiz topics discovered:</span>
                  {quizWorthyTopics.map((topic, i) => (
                    <span key={i} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'rgba(74,222,128,0.1)', color: 'var(--green)', border: '1px solid var(--green)' }}>
                      {topic}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {showChat && (
              <div style={{ marginTop: 10, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--blue)', fontWeight: 600 }}>Ask anything about {selectedFile}</div>
                  <button onClick={() => setChatMessages([])} style={{ fontSize: 10, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>Clear</button>
                </div>

                <div style={{ maxHeight: 300, overflowY: 'auto', padding: 14 }}>
                  {chatMessages.length === 0 && (
                    <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>
                      Ask anything — "Why do we use Redis here?", "What does this function return?", "Explain the authentication flow"
                    </div>
                  )}
                  {chatMessages.map((msg, i) => (
                    <div key={i} style={{
                      marginBottom: 10, display: 'flex',
                      flexDirection: msg.role === 'user' ? 'row-reverse' : 'row', gap: 8,
                    }}>
                      <div style={{
                        maxWidth: '85%', padding: '8px 12px', borderRadius: 8, fontSize: 12, lineHeight: 1.6,
                        background: msg.role === 'user' ? 'rgba(74,222,128,0.08)' : 'var(--bg)',
                        border: `1px solid ${msg.role === 'user' ? 'var(--green)' : 'var(--border)'}`,
                        color: 'var(--text)',
                      }}>
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  {chatLoading && <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>Thinking...</div>}
                </div>

                <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
                  <input
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) sendChatMessage() }}
                    placeholder="Ask a question about this file..."
                    style={{
                      flex: 1, padding: '8px 12px', background: 'var(--bg)',
                      border: '1px solid var(--border)', borderRadius: 6,
                      color: 'var(--text)', fontSize: 12, outline: 'none', fontFamily: 'inherit',
                    }}
                  />
                  <button onClick={sendChatMessage} disabled={chatLoading || !chatInput.trim()} style={{
                    padding: '8px 16px', background: 'var(--text)', color: 'var(--bg)',
                    border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'monospace',
                  }}>Ask</button>
                </div>
              </div>
            )}
            </>
          )}
        </div>
      )}

      {/* Score bar */}
      {quizMode === 'standard' && score.total > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 18px', marginBottom: 16 }}>
          <div style={{ fontSize: 32, fontWeight: 700, color: accuracy >= 70 ? 'var(--green)' : accuracy >= 50 ? 'var(--amber)' : 'var(--red)' }}>
            {score.correct}/{score.total}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>{accuracy}% accuracy</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>Level {level} — {LEVEL_LABELS[level-1]} — {qtype.replace('_',' ')}</div>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>Question {current + 1} of {questions.length}</div>
            {generating && <div style={{ fontSize: 11, color: 'var(--amber)' }}>Generating more...</div>}
          </div>
          {/* Progress bar */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: 'var(--border)', borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${accuracy}%`, background: accuracy >= 70 ? 'var(--green)' : 'var(--amber)', transition: 'width 0.5s' }} />
          </div>
        </div>
      )}

      {/* Two column layout when question is active */}
      {quizMode === 'standard' && q ? (
        <div style={{ display: 'grid', gridTemplateColumns: hasAnswered ? '1fr 1fr' : '1fr', gap: 16, transition: 'all 0.3s' }}>
          {/* Left: Question */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 22 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--blue)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
              {q.type.replace('_', ' ')} · Level {q.level} · Q{current + 1}
            </div>
            <div style={{ fontSize: 15, lineHeight: 1.7, marginBottom: 20, color: 'var(--text)' }}>
              {q.question}
            </div>

            {q.type === 'flashcard' ? (
              answered[current] === undefined ? (
                <button onClick={() => answer(q.correct_answer)} style={{
                  width: '100%', padding: '12px', background: 'var(--bg)', border: '1px solid var(--border)',
                  borderRadius: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text)', fontFamily: 'monospace',
                }}>Reveal answer ↓</button>
              ) : (
                <div style={{ padding: 14, background: 'rgba(0,217,126,0.08)', borderRadius: 8, border: '1px solid var(--green)', fontSize: 14, color: 'var(--text)', lineHeight: 1.7 }}>
                  {q.correct_answer}
                </div>
              )
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {shuffledOptions.map((opt, i) => {
                  const isChosen = answered[current] === opt
                  const isCorrect = opt === q.correct_answer
                  let bg = 'var(--bg)', border = '1px solid var(--border)', color = 'var(--text)'
                  if (hasAnswered) {
                    if (isCorrect) { bg = 'rgba(0,217,126,0.08)'; border = '1px solid var(--green)'; color = 'var(--green)' }
                    else if (isChosen) { bg = 'rgba(255,77,106,0.08)'; border = '1px solid var(--red)'; color = 'var(--red)' }
                    else { color = 'var(--muted)' }
                  }
                  return (
                    <button key={i} onClick={() => answer(opt)} disabled={hasAnswered} style={{
                      textAlign: 'left', padding: '11px 14px', background: bg, border, borderRadius: 8,
                      cursor: hasAnswered ? 'default' : 'pointer', fontSize: 13, color,
                      fontFamily: 'monospace', lineHeight: 1.5, transition: 'all 0.1s',
                    }}>
                      <span style={{ color: 'var(--muted)', marginRight: 8 }}>{String.fromCharCode(65 + i)}.</span>
                      {opt}
                    </button>
                  )
                })}
              </div>
            )}

            {hasAnswered && (
              <button onClick={next} style={{
                marginTop: 16, width: '100%', padding: '11px', background: 'var(--text)', color: 'var(--bg)',
                border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'monospace',
              }}>
                {current < questions.length - 1 ? 'Next question →' : generating ? 'Loading more...' : 'Generate more →'}
              </button>
            )}
          </div>

          {/* Right: Explanation panel — only shows after answering */}
          {hasAnswered && feedback && (
            <div style={{ background: 'var(--surface)', border: `1px solid ${feedback.is_correct ? 'var(--green)' : 'var(--red)'}`, borderRadius: 10, padding: 22 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: feedback.is_correct ? 'var(--green)' : 'var(--red)', marginBottom: 14 }}>
                {feedback.is_correct ? '✓ Correct' : '✗ Incorrect'}
              </div>

              {!feedback.is_correct && (
                <div style={{ marginBottom: 14, padding: 12, background: 'rgba(0,217,126,0.08)', borderRadius: 6, border: '1px solid var(--green)' }}>
                  <div style={{ fontSize: 10, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Correct answer</div>
                  <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>{feedback.correct_answer}</div>
                </div>
              )}

              <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Explanation</div>
              <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.8 }}>
                {feedback.explanation}
              </div>

              {feedback.times_shown > 1 && (
                <div style={{ marginTop: 14, padding: 10, background: 'var(--bg)', borderRadius: 6, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                    You've seen this question {feedback.times_shown} times — 
                    correct {feedback.times_correct}/{feedback.times_shown} ({Math.round(feedback.times_correct/feedback.times_shown*100)}%)
                  </div>
                  {feedback.times_correct / feedback.times_shown < 0.6 && (
                    <div style={{ fontSize: 11, color: 'var(--amber)', marginTop: 4 }}>
                      ⚠ This is a weak area — it will appear again until you get it consistently right
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      ) : quizMode === 'standard' ? (
        <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 80, border: '1px dashed var(--border)', borderRadius: 10 }}>
          {generating ? 'Generating questions...' : 'Select a project and question type above, then click Start quiz.'}
        </div>
      ) : null}
    </div>
  )
}

export default function Quiz() {
  return (
    <Suspense fallback={<div style={{ color: 'var(--muted)', padding: 40 }}>Loading quiz...</div>}>
      <QuizContent />
    </Suspense>
  )
}
