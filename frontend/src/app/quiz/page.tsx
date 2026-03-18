'use client'
import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { api } from '@/lib/api'

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

  const loadFiles = useCallback(async (pid: string) => {
    const result = await api.listProjectFiles(pid)
    setProjectFiles(result.files || [])
  }, [])

  useEffect(() => {
    if (projectId) loadFiles(projectId)
  }, [projectId, loadFiles])

  const startWalkthrough = async () => {
    if (!projectId || !selectedFile) return
    setWalkthroughLoading(true)
    try {
      const result = await api.codeWalkthrough(projectId, selectedFile)
      setWalkthroughQuestions(result.questions || [])
      setWalkthroughIndex(0)
    } finally {
      setWalkthroughLoading(false)
    }
  }

  const q = questions[current]

  useEffect(() => {
    if (q) {
      const opts = [...(q.wrong_answers || []), q.correct_answer].sort(() => Math.random() - 0.5)
      setShuffledOptions(opts)
    }
  }, [current, questions])

  const generate = useCallback(async (count = 5) => {
    setGenerating(true)
    try {
      const result = await api.generateQuiz(projectId, qtype, level, count)
      setQuestions(prev => [...prev, ...(result.questions || [])])
    } finally {
      setGenerating(false)
    }
  }, [projectId, qtype, level])

  const startFresh = async () => {
    setQuestions([])
    setAnswered({})
    setScore({ correct: 0, total: 0 })
    setCurrent(0)
    setFeedback(null)
    setGenerating(true)
    try {
      const result = await api.generateQuiz(projectId, qtype, level, 5)
      setQuestions(result.questions || [])
    } finally {
      setGenerating(false)
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
        <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: '0 0 260px' }}>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 1 }}>Project</div>
            <select value={projectId} onChange={e => setProjectId(e.target.value)}
              style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontFamily: 'monospace', fontSize: 12, padding: '7px 10px' }}>
              {PROJECTS.map(p => <option key={p.id} value={p.id}>{p.name} — {p.company}</option>)}
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
          <div style={{ marginLeft: 'auto' }}>
            <button type="button" onClick={startFresh} disabled={generating} style={{
              padding: '10px 22px', background: generating ? 'var(--border)' : 'var(--text)',
              color: 'var(--bg)', border: 'none', borderRadius: 6, cursor: generating ? 'not-allowed' : 'pointer',
              fontSize: 12, fontWeight: 700, fontFamily: 'monospace',
            }}>
              {generating ? 'Generating...' : questions.length > 0 ? 'New session' : 'Start quiz'}
            </button>
          </div>
        </div>
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
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 12 }}>
                Question {walkthroughIndex + 1} of {walkthroughQuestions.length}
                {walkthroughQuestions[walkthroughIndex]?.line_reference && (
                  <span style={{ marginLeft: 8, color: 'var(--blue)' }}>
                    [{walkthroughQuestions[walkthroughIndex].line_reference}]
                  </span>
                )}
              </div>
              <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 16, lineHeight: 1.6 }}>
                {walkthroughQuestions[walkthroughIndex]?.question}
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.7, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                <div style={{ fontSize: 10, color: 'var(--green)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Answer</div>
                {walkthroughQuestions[walkthroughIndex]?.correct_answer}
              </div>
              {walkthroughQuestions[walkthroughIndex]?.explanation && (
                <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.7, borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 12 }}>
                  <div style={{ fontSize: 10, color: 'var(--amber)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Why it matters</div>
                  {walkthroughQuestions[walkthroughIndex]?.explanation}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button
                  type="button"
                  onClick={() => setWalkthroughIndex(i => Math.max(0, i - 1))}
                  disabled={walkthroughIndex === 0}
                  style={{ padding: '8px 18px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', color: 'var(--muted)', fontFamily: 'monospace', fontSize: 12 }}
                >← Prev</button>
                <button
                  type="button"
                  onClick={() => setWalkthroughIndex(i => Math.min(walkthroughQuestions.length - 1, i + 1))}
                  disabled={walkthroughIndex === walkthroughQuestions.length - 1}
                  style={{ padding: '8px 18px', background: 'var(--text)', color: 'var(--bg)', border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'monospace', fontSize: 12, fontWeight: 700 }}
                >Next →</button>
              </div>
            </div>
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
