'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'

const STORAGE_KEY = 'swarmos_intake'

export default function Intake() {
  const router = useRouter()
  const [brief, setBrief] = useState('')
  const [analysis, setAnalysis] = useState<any>(null)
  const [answers, setAnswers] = useState('')
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState(false)
  const [restored, setRestored] = useState(false)

  // Restore from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const { brief: b, analysis: a } = JSON.parse(saved)
        if (b) setBrief(b)
        if (a) { setAnalysis(a); setRestored(true) }
      }
    } catch {}
  }, [])

  // Save to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ brief, analysis }))
    } catch {}
  }, [brief, analysis])

  const clear = () => {
    setBrief('')
    setAnalysis(null)
    setAnswers('')
    setRestored(false)
    localStorage.removeItem(STORAGE_KEY)
  }

  const analyze = async () => {
    if (!brief.trim()) return
    setLoading(true)
    try {
      const result = await api.analyzeIntake(brief)
      setAnalysis(result)
      setRestored(false)
    } finally {
      setLoading(false)
    }
  }

  const refine = async () => {
    if (!answers.trim()) return
    setLoading(true)
    try {
      const result = await api.refineIntake(brief, analysis, answers)
      setAnalysis(result)
      setAnswers('')
    } finally {
      setLoading(false)
    }
  }

  const addToSwarm = async () => {
    if (!analysis?.ready_to_build) return
    setAdding(true)
    try {
      const id = analysis.project_name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          name: analysis.project_name,
          company: analysis.company || 'Unknown',
          stack: analysis.recommended_stack || 'TBD',
          brief: brief,
          estimated_minutes: analysis.estimated_minutes || 120,
        }),
      })
      localStorage.removeItem(STORAGE_KEY)
      router.push('/')
    } finally {
      setAdding(false)
    }
  }

  const confColor: Record<string, string> = {
    high: '#4ade80',
    medium: '#f59e0b',
    low: '#f87171',
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: analysis ? '1fr 1fr' : '1fr', alignItems: 'start', gap: 32 }}>

      {/* Left column — brief input */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Add new project</div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            Paste anything — an email, a brief, or a rough idea. Claude figures out the rest.
          </div>
        </div>

        {restored && (
          <div style={{ fontSize: 11, color: 'var(--amber)', background: 'rgba(245,166,35,0.08)', border: '1px solid var(--amber)', borderRadius: 6, padding: '6px 12px' }}>
            ↩ Restored from your last session
          </div>
        )}

        <textarea
          value={brief}
          onChange={e => setBrief(e.target.value)}
          placeholder="Paste your project brief, email from company, or rough idea here..."
          style={{
            width: '100%',
            height: 220,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            color: 'var(--text)',
            fontFamily: 'monospace',
            fontSize: 13,
            padding: 16,
            resize: 'none',
            outline: 'none',
            lineHeight: 1.7,
          }}
        />

        <div style={{ display: 'flex', flexDirection: 'row', gap: 8 }}>
          <button
            onClick={analyze}
            disabled={loading || !brief.trim()}
            style={{
              flex: 1,
              padding: '11px 0',
              background: loading ? 'var(--border)' : 'var(--text)',
              color: 'var(--bg)',
              border: 'none',
              borderRadius: 8,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: 13,
              fontWeight: 700,
              fontFamily: 'monospace',
            }}
          >
            {loading ? 'Analyzing...' : 'Analyze brief'}
          </button>
          <button
            onClick={clear}
            style={{
              padding: '11px 20px',
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 13,
              color: 'var(--muted)',
              fontFamily: 'monospace',
            }}
          >
            Clear
          </button>
        </div>
      </div>

      {/* Right column — analysis result */}
      {analysis && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{analysis.project_name || 'Unnamed project'}</div>
            <span style={{
              fontSize: 10, padding: '4px 12px', borderRadius: 20,
              border: `1px solid ${confColor[analysis.confidence] || 'var(--muted)'}`,
              color: confColor[analysis.confidence] || 'var(--muted)',
            }}>
              {analysis.confidence} confidence
            </span>
          </div>

          {/* Metadata grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { label: 'Company', value: analysis.company },
              { label: 'Stack', value: analysis.recommended_stack },
              { label: 'Est. build time', value: `${analysis.estimated_minutes} min` },
              { label: 'Ready to build', value: analysis.ready_to_build ? '✓ Yes' : 'Not yet' },
            ].map(m => (
              <div key={m.label} style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 14px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>{m.label}</div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{m.value || '—'}</div>
              </div>
            ))}
          </div>

          {/* Problem statement */}
          {analysis.problem_statement && (
            <div>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Problem</div>
              <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>{analysis.problem_statement}</div>
            </div>
          )}

          {/* Key features */}
          {analysis.key_features?.length > 0 && (
            <div>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Key features</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {analysis.key_features.map((f: string, i: number) => (
                  <div key={i} style={{ fontSize: 12, color: 'var(--text)', padding: '4px 0', display: 'flex', gap: 8 }}>
                    <span style={{ color: 'var(--muted)' }}>›</span> {f}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Follow-up questions */}
          {analysis.follow_up_questions?.length > 0 && !analysis.ready_to_build && (
            <div style={{ background: 'rgba(245,166,35,0.06)', border: '1px solid rgba(245,166,35,0.3)', borderRadius: 10, padding: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--amber)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
                Need more info
              </div>
              {analysis.follow_up_questions.map((q: string, i: number) => (
                <div key={i} style={{ fontSize: 12, color: 'var(--amber)', padding: '3px 0', lineHeight: 1.6 }}>› {q}</div>
              ))}
              <textarea
                value={answers}
                onChange={e => setAnswers(e.target.value)}
                placeholder="Answer the questions above..."
                style={{
                  width: '100%', minHeight: 90,
                  background: 'var(--bg)', border: '1px solid var(--border)',
                  borderRadius: 8, color: 'var(--text)', fontFamily: 'monospace',
                  fontSize: 12, padding: 12, resize: 'vertical', outline: 'none', marginTop: 12,
                }}
              />
              <button
                onClick={refine}
                disabled={loading || !answers.trim()}
                style={{
                  marginTop: 10, padding: '9px 20px',
                  background: 'var(--amber)', color: '#000',
                  border: 'none', borderRadius: 8, cursor: 'pointer',
                  fontSize: 12, fontWeight: 700, fontFamily: 'monospace',
                }}
              >
                {loading ? 'Refining...' : 'Submit answers'}
              </button>
            </div>
          )}

          {/* Ready to build */}
          {analysis.ready_to_build && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <span style={{ fontSize: 12, color: 'var(--green)' }}>› Brief complete. Ready to add to swarm.</span>
              <button
                onClick={addToSwarm}
                disabled={adding}
                style={{
                  padding: '10px 22px', background: 'var(--green)', color: '#000',
                  border: 'none', borderRadius: 8, cursor: adding ? 'not-allowed' : 'pointer',
                  fontSize: 13, fontWeight: 700, fontFamily: 'monospace', marginLeft: 'auto',
                }}
              >
                {adding ? 'Adding...' : 'Add to swarm →'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
