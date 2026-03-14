const API = 'https://hospitable-nature-production-4e60.up.railway.app'

export interface Project {
  id: string
  name: string
  company: string
  stack: string
  port: number
  status: 'queued' | 'building' | 'testing' | 'done' | 'error'
  phase: string
  files_count: number
  live_url: string
  github_url: string
  last_log: string
  estimated_minutes: number
  elapsed_seconds: number
  minutes_remaining: number
  has_build_summary: boolean
  build_summary: string
  started_at: string | null
  completed_at: string | null
}

export interface QuizQuestion {
  id: number
  question: string
  correct_answer: string
  wrong_answers: string[]
  explanation: string
  level: number
  type: string
  is_review?: boolean
}

export const api = {
  async getProjects(): Promise<Project[]> {
    const r = await fetch(`${API}/api/projects`, { cache: 'no-store' })
    return r.json()
  },
  async getProject(id: string): Promise<Project> {
    const r = await fetch(`${API}/api/projects/${id}`, { cache: 'no-store' })
    return r.json()
  },
  async updateProject(id: string, data: Partial<Project>) {
    const r = await fetch(`${API}/api/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    return r.json()
  },
  async getLogs(id: string) {
    const r = await fetch(`${API}/api/projects/${id}/logs?limit=200`, { cache: 'no-store' })
    return r.json()
  },
  async analyzeIntake(brief: string) {
    const r = await fetch(`${API}/api/intake/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brief }),
    })
    return r.json()
  },
  async refineIntake(original_brief: string, analysis: object, answers: string) {
    const r = await fetch(`${API}/api/intake/refine`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ original_brief, analysis, answers }),
    })
    return r.json()
  },
  async generateQuiz(project_id: string, question_type: string, level: number, count: number = 3) {
    const r = await fetch(`${API}/api/quiz/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id, question_type, level, count }),
    })
    return r.json()
  },
  async submitAttempt(question_id: number, project_id: string, user_answer: string, is_correct: boolean) {
    const r = await fetch(`${API}/api/quiz/attempt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question_id, project_id, user_answer, is_correct }),
    })
    return r.json()
  },
  async getQuizStats(project_id: string) {
    const r = await fetch(`${API}/api/quiz/stats/${project_id}`, { cache: 'no-store' })
    return r.json()
  },
}
