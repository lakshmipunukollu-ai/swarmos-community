'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { api, Project } from '@/lib/api'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const LOG_COLORS: Record<string, string> = {
  error: 'var(--red)',
  warning: 'var(--amber)',
  success: 'var(--green)',
  info: 'var(--muted)',
}

export default function ProjectDetail() {
  const params = useParams()
  const id = params.id as string
  const [project, setProject] = useState<Project | null>(null)
  const [logs, setLogs] = useState<any[]>([])
  const [tab, setTab] = useState('overview')
  const [loading, setLoading] = useState(true)
  const [autoScroll, setAutoScroll] = useState(true)
  const logsEndRef = useRef<HTMLDivElement>(null)
  const logsContainerRef = useRef<HTMLDivElement>(null)
  const [liveElapsed, setLiveElapsed] = useState<number>(0)
  const [refreshing, setRefreshing] = useState(false)
  const [hiringLens, setHiringLens] = useState<any>(null)
  const [hiringLoading, setHiringLoading] = useState(false)

  const load = useCallback(async () => {
    const [p, l] = await Promise.all([api.getProject(id), api.getLogs(id)])
    setProject(p)
    setLogs(l)
    setLoading(false)
  }, [id])

  useEffect(() => {
    load()
    const interval = setInterval(load, 5000)
    return () => clearInterval(interval)
  }, [load])

  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, autoScroll])

  useEffect(() => {
    if (project) setLiveElapsed(project.elapsed_seconds)
  }, [project])

  useEffect(() => {
    if (!project) return
    try {
      const notes = (project as any).hiring_notes
      if (notes) setHiringLens(JSON.parse(notes))
    } catch {}
  }, [project])

  useEffect(() => {
    if (!project || project.status !== 'building') return
    const tick = setInterval(() => setLiveElapsed(e => e + 1), 1000)
    return () => clearInterval(tick)
  }, [project?.status])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await api.refreshProject(id)
      await load()
    } finally {
      setRefreshing(false)
    }
  }

  const handleHiringLens = async () => {
    setHiringLoading(true)
    try {
      const result = await api.getHiringLens(id)
      if (result.hiring_data) setHiringLens(result.hiring_data)
    } finally {
      setHiringLoading(false)
    }
  }

  const handleScroll = () => {
    if (!logsContainerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = logsContainerRef.current
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 50)
  }

  if (loading) return <div style={{ color: 'var(--muted)', padding: 40 }}>Loading...</div>
  if (!project) return <div style={{ color: 'var(--red)', padding: 40 }}>Project not found</div>

  const elapsed = liveElapsed
  const estimated = project.estimated_minutes * 60
  const pct = project.status === 'done' ? 100 : Math.min(95, Math.round((elapsed / estimated) * 100))
  const minsRemaining = Math.max(0, Math.round((estimated - elapsed) / 60))

  const errorLogs = logs.filter(l => l.level === 'error')
  const recentLogs = logs.slice(-5)

  return (
    <div style={{ width: '100%' }}>
      <Link href="/" style={{ fontSize: 11, color: 'var(--muted)', textDecoration: 'none', display: 'inline-block', marginBottom: 16, letterSpacing: 1 }}>
        ← DASHBOARD
      </Link>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{project.name}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>{project.company} · port {project.port} · {project.stack}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <span className={`badge-${project.status}`} style={{ fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: 1 }}>
            {project.status}
          </span>
          {project.status === 'building' && <span style={{ fontSize: 11, color: 'var(--amber)' }}>~{minsRemaining}m remaining</span>}
          {project.status === 'error' && <span style={{ fontSize: 11, color: 'var(--red)' }}>{errorLogs.length} error{errorLogs.length !== 1 ? 's' : ''} detected</span>}
        </div>
      </div>

      <div style={{ height: 5, background: 'var(--border)', borderRadius: 3, marginBottom: 20, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, borderRadius: 3, background: project.status === 'error' ? 'var(--red)' : 'var(--green)', transition: 'width 1s' }} />
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 20 }}>
        {[
          { label: 'Files created', value: String(project.files_count) },
          { label: 'Phase', value: project.phase || 'Not started' },
          { label: 'Elapsed', value: `${Math.round(liveElapsed / 60)}m` },
          { label: 'Log entries', value: String(logs.length) },
        ].map(m => (
          <div key={m.label} style={{ background: 'var(--surface)', borderRadius: 8, padding: '10px 14px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>{m.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* Error banner */}
      {errorLogs.length > 0 && (
        <div style={{ background: 'rgba(255,77,106,0.1)', border: '1px solid var(--red)', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--red)', marginBottom: 8 }}>⚠ {errorLogs.length} error{errorLogs.length !== 1 ? 's' : ''} detected</div>
          {errorLogs.slice(-3).map((l, i) => (
            <div key={i} style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--red)', padding: '2px 0' }}>{l.message}</div>
          ))}
          <button onClick={() => setTab('logs')} style={{ marginTop: 8, fontSize: 11, color: 'var(--red)', border: '1px solid var(--red)', background: 'transparent', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontFamily: 'monospace' }}>
            View full logs →
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 4, marginBottom: 20, alignItems: 'center' }}>
        {['overview', 'logs', 'quiz'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '7px 16px', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase',
            borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'monospace',
            background: tab === t ? 'var(--text)' : 'transparent',
            color: tab === t ? 'var(--bg)' : 'var(--muted)',
          }}>{t}{t === 'logs' && logs.length > 0 ? ` (${logs.length})` : ''}</button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={handleHiringLens} disabled={hiringLoading} style={{
            padding: '7px 16px', fontSize: 11, letterSpacing: 1,
            borderRadius: 6, border: '1px solid var(--amber)', cursor: hiringLoading ? 'not-allowed' : 'pointer',
            fontFamily: 'monospace',
            background: hiringLoading ? 'var(--border)' : 'transparent',
            color: hiringLoading ? 'var(--bg)' : 'var(--amber)',
          }}>
            {hiringLoading ? 'Analyzing...' : '★ Hiring lens'}
          </button>
          <button onClick={handleRefresh} disabled={refreshing} style={{
            padding: '7px 16px', fontSize: 11, letterSpacing: 1,
            borderRadius: 6, border: '1px solid var(--border)', cursor: refreshing ? 'not-allowed' : 'pointer',
            fontFamily: 'monospace',
            background: refreshing ? 'var(--border)' : 'transparent',
            color: refreshing ? 'var(--bg)' : 'var(--muted)',
          }}>
            {refreshing ? 'Refreshing...' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {tab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Project info</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { label: 'Stack', value: project.stack },
                { label: 'Port', value: String(project.port) },
                { label: 'GitHub', value: project.github_url || 'Not yet created', isLink: !!project.github_url },
                { label: 'Live URL', value: project.live_url || 'Not yet deployed', isLink: !!project.live_url },
              ].map(m => (
                <div key={m.label} style={{ background: 'var(--surface)', borderRadius: 8, padding: '10px 14px', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 1 }}>{m.label}</div>
                  {m.isLink
                    ? <a href={m.value} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: 'var(--blue)', wordBreak: 'break-all' }}>{m.value}</a>
                    : <div style={{ fontSize: 13, wordBreak: 'break-all' }}>{m.value}</div>
                  }
                </div>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Recent activity</div>
            <div style={{ fontFamily: 'monospace', fontSize: 11, background: 'var(--surface)', borderRadius: 8, padding: 14, border: '1px solid var(--border)', lineHeight: 2 }}>
              {recentLogs.length === 0 && <div style={{ color: 'var(--muted)' }}>No activity yet</div>}
              {recentLogs.map((l, i) => (
                <div key={i} style={{ color: LOG_COLORS[l.level] || 'var(--muted)' }}>
                  <span style={{ color: 'var(--border)', marginRight: 8 }}>{new Date(l.created_at).toLocaleTimeString()}</span>
                  {l.message}
                </div>
              ))}
            </div>
            {(project as any).build_summary && (
              <div style={{ marginTop: 12, background: 'var(--surface)', borderRadius: 8, padding: 14, border: '1px solid var(--green)', maxHeight: 300, overflowY: 'auto' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)', marginBottom: 8 }}>BUILD SUMMARY</div>
                <pre style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.7, whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'monospace' }}>
                  {(project as any).build_summary}
                </pre>
              </div>
            )}
            {hiringLens && (
              <div style={{ marginTop: 16, border: '1px solid var(--amber)', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ background: 'rgba(245,166,35,0.08)', padding: '12px 16px', borderBottom: '1px solid var(--amber)' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--amber)', letterSpacing: 1 }}>★ HIRING LENS</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>How this project reads to a hiring partner</div>
                </div>

                <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>

                  {/* Strengths */}
                  {hiringLens.strengths?.length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--green)', fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>✓ Strengths</div>
                      {hiringLens.strengths.map((s: string, i: number) => (
                        <div key={i} style={{ fontSize: 12, color: 'var(--text)', padding: '4px 0', lineHeight: 1.6, display: 'flex', gap: 8 }}>
                          <span style={{ color: 'var(--green)', flexShrink: 0 }}>›</span> {s}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Talking points */}
                  {hiringLens.talking_points?.length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--amber)', fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>💬 Lead with these</div>
                      {hiringLens.talking_points.map((t: string, i: number) => (
                        <div key={i} style={{ fontSize: 12, color: 'var(--text)', padding: '5px 10px', marginBottom: 4, background: 'rgba(245,166,35,0.06)', borderRadius: 6, lineHeight: 1.6, borderLeft: '2px solid var(--amber)' }}>
                          {t}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Gaps to fill */}
                  {hiringLens.gaps_to_fill?.length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--blue)', fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>⚡ Quick wins</div>
                      {hiringLens.gaps_to_fill.map((g: any, i: number) => (
                        <div key={i} style={{ fontSize: 12, padding: '8px 12px', marginBottom: 6, background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)' }}>
                          <div style={{ color: 'var(--text)', fontWeight: 500, marginBottom: 3 }}>{g.what}</div>
                          <div style={{ color: 'var(--muted)', fontSize: 11 }}>{g.why} · <span style={{ color: 'var(--blue)' }}>{g.effort}</span></div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Red flags */}
                  {hiringLens.red_flags?.length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--red)', fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>⚠ Be ready to defend</div>
                      {hiringLens.red_flags.map((r: string, i: number) => (
                        <div key={i} style={{ fontSize: 12, color: 'var(--muted)', padding: '4px 0', lineHeight: 1.6, display: 'flex', gap: 8 }}>
                          <span style={{ color: 'var(--red)', flexShrink: 0 }}>›</span> {r}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'logs' && (
        <div style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{logs.length} log entries</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>Auto-scroll</span>
              <button onClick={() => setAutoScroll(!autoScroll)} style={{
                fontSize: 10, padding: '3px 10px', borderRadius: 20, cursor: 'pointer', fontFamily: 'monospace',
                border: '1px solid var(--border)',
                background: autoScroll ? 'var(--green)' : 'transparent',
                color: autoScroll ? '#000' : 'var(--muted)',
              }}>{autoScroll ? 'ON' : 'OFF'}</button>
              <button onClick={() => setLogs([])} style={{ fontSize: 10, padding: '3px 10px', borderRadius: 20, cursor: 'pointer', fontFamily: 'monospace', border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)' }}>Clear</button>
            </div>
          </div>
          <div ref={logsContainerRef} onScroll={handleScroll} style={{
            fontFamily: 'monospace', fontSize: 12, background: 'var(--surface)',
            borderRadius: 8, padding: 16, border: '1px solid var(--border)',
            lineHeight: 1.8, height: 'calc(100vh - 320px)', overflowY: 'auto',
          }}>
            {logs.length === 0 && (
              <div>
                <div style={{ color: 'var(--muted)', marginBottom: 8 }}>No structured logs yet.</div>
                {project.last_log && (
                  <div style={{ color: 'var(--text)', fontFamily: 'monospace', fontSize: 11 }}>
                    Last known: {project.last_log}
                  </div>
                )}
              </div>
            )}
            {logs.map((l, i) => (
              <div key={l.id || i} style={{ display: 'flex', gap: 12, padding: '1px 0', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                <span style={{ color: 'var(--border)', flexShrink: 0, fontSize: 10 }}>
                  {new Date(l.created_at).toLocaleTimeString()}
                </span>
                <span style={{ color: 'var(--border)', flexShrink: 0, fontSize: 10, minWidth: 50, textTransform: 'uppercase' }}>
                  [{l.level}]
                </span>
                {l.phase && <span style={{ color: 'var(--blue)', flexShrink: 0, fontSize: 10 }}>[{l.phase}]</span>}
                <span style={{ color: LOG_COLORS[l.level] || (i === logs.length - 1 ? 'var(--green)' : 'var(--text)') }}>
                  {l.message}
                </span>
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </div>
      )}

      {tab === 'quiz' && (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 16 }}>
            {(project as any).build_summary
              ? '✓ Build summary available — quiz uses your actual code'
              : 'Quiz uses project knowledge. More accurate after build completes.'}
          </div>
          <Link href={`/quiz?project=${project.id}`} style={{
            display: 'inline-block', padding: '12px 28px', background: 'var(--green)',
            color: '#000', borderRadius: 6, textDecoration: 'none', fontWeight: 700, fontSize: 14, fontFamily: 'monospace',
          }}>
            Start quiz for {project.name} →
          </Link>
        </div>
      )}
    </div>
  )
}
