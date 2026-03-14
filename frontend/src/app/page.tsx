'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { api, Project } from '@/lib/api'

function TimeEstimate({ project }: { project: Project }) {
  const [elapsed, setElapsed] = useState(project.elapsed_seconds)
  useEffect(() => {
    if (project.status !== 'building') return
    const interval = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => clearInterval(interval)
  }, [project.status])
  if (project.status === 'done') return <span style={{ color: 'var(--green)', fontSize: 11 }}>Complete</span>
  if (project.status === 'queued') return <span style={{ color: 'var(--muted)', fontSize: 11 }}>Queued</span>
  if (project.status === 'error') return <span style={{ color: 'var(--red)', fontSize: 11 }}>Failed</span>
  const estimated = project.estimated_minutes * 60
  const remaining = Math.max(0, estimated - elapsed)
  const mins = Math.round(remaining / 60)
  const pct = Math.min(100, Math.round((elapsed / estimated) * 100))
  return <span style={{ color: 'var(--amber)', fontSize: 11 }}>~{mins}m left ({pct}%)</span>
}

function ProjectCard({ project }: { project: Project }) {
  const pct = project.status === 'done' ? 100
    : project.status === 'building' ? Math.min(95, Math.round((project.elapsed_seconds / (project.estimated_minutes * 60)) * 100))
    : project.status === 'testing' ? 90 : 0

  const borderColor = project.status === 'building' ? 'var(--green)'
    : project.status === 'error' ? 'var(--red)'
    : project.status === 'done' ? 'rgba(0,217,126,0.3)'
    : 'var(--border)'

  return (
    <Link href={`/projects/${project.id}`} style={{ textDecoration: 'none' }}>
      <div style={{
        background: 'var(--surface)', border: `1px solid ${borderColor}`,
        borderRadius: 10, padding: '14px 16px', cursor: 'pointer',
        transition: 'border-color 0.2s', height: '100%',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{project.name}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{project.company}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <span className={`badge-${project.status}`} style={{
              fontSize: 9, fontWeight: 700, padding: '2px 8px',
              borderRadius: 20, textTransform: 'uppercase', letterSpacing: 1,
            }}>{project.status}</span>
            {project.live_url && (
              <a href={project.live_url} target="_blank" rel="noreferrer"
                onClick={e => e.stopPropagation()}
                style={{ fontSize: 9, color: 'var(--green)', border: '1px solid var(--green)', padding: '1px 6px', borderRadius: 3, textDecoration: 'none' }}>
                live ↗
              </a>
            )}
          </div>
        </div>

        <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, marginBottom: 10, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 2, width: `${pct}%`,
            background: project.status === 'error' ? 'var(--red)' : 'var(--green)',
            transition: 'width 1s ease',
          }} />
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
          {project.stack.split('+').map(s => (
            <span key={s} style={{ fontSize: 9, padding: '2px 6px', background: 'var(--border)', borderRadius: 3, color: 'var(--muted)' }}>
              {s.trim()}
            </span>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>{project.files_count} files</span>
          <TimeEstimate project={project} />
        </div>

        {project.last_log && (
          <div style={{
            fontSize: 10, fontFamily: 'monospace', color: 'var(--muted)',
            padding: '4px 8px', background: 'rgba(0,0,0,0.2)', borderRadius: 4,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            borderLeft: `2px solid ${project.status === 'building' ? 'var(--green)' : 'var(--border)'}`,
          }}>
            {project.last_log}
          </div>
        )}

        {project.status === 'error' && (
          <div style={{ marginTop: 6, fontSize: 10, color: 'var(--red)', padding: '3px 8px', background: 'rgba(255,77,106,0.1)', borderRadius: 4 }}>
            Build failed — click to view logs
          </div>
        )}
      </div>
    </Link>
  )
}

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const data = await api.getProjects()
      setProjects(data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(load, 8000)
    return () => clearInterval(interval)
  }, [load])

  const filtered = filter === 'all' ? projects : projects.filter(p => p.status === filter)
  const done = projects.filter(p => p.status === 'done').length
  const building = projects.filter(p => p.status === 'building' || p.status === 'testing').length
  const errors = projects.filter(p => p.status === 'error').length
  const totalCost = projects.reduce((sum, p) => sum + (p.elapsed_seconds / 3600) * 6, 0)

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--muted)' }}>
      Loading projects...
    </div>
  )

  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { label: 'done', value: done, color: 'var(--green)' },
            { label: 'building', value: building, color: 'var(--amber)' },
            { label: 'errors', value: errors, color: errors > 0 ? 'var(--red)' : 'var(--muted)' },
            { label: 'total', value: projects.length, color: 'var(--text)' },
            { label: 'est. cost', value: `$${totalCost.toFixed(2)}`, color: 'var(--muted)' },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--surface)', borderRadius: 8, padding: '8px 16px', textAlign: 'center', border: '1px solid var(--border)', minWidth: 70 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>{s.label}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {['all', 'building', 'done', 'queued', 'error'].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '6px 14px', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase',
              borderRadius: 20, border: '1px solid var(--border)', cursor: 'pointer',
              background: filter === f ? 'var(--text)' : 'transparent',
              color: filter === f ? 'var(--bg)' : 'var(--muted)',
              fontFamily: 'monospace',
            }}>{f}</button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
        {filtered.map(p => <ProjectCard key={p.id} project={p} />)}
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 80, border: '1px dashed var(--border)', borderRadius: 10 }}>
          {filter === 'all' ? 'No projects yet. Add one from the intake tab.' : `No projects with status "${filter}"`}
        </div>
      )}
    </div>
  )
}
