// Harvest's REST API, always as the signed-in person: the projects and tasks
// they can log to, their time entries over a stretch of days, and logging,
// changing and deleting their own entries.

import { authHeaders, signInAgain } from './auth.js'

const API = 'https://api.harvestapp.com/v2'

async function call(method, path, params = {}, payload = null) {
  const url = new URL(`${API}${path}`)
  for (const [key, value] of Object.entries(params)) if (value != null) url.searchParams.set(key, String(value))
  const response = await fetch(url, {
    method,
    headers: { ...authHeaders(), ...(payload ? { 'content-type': 'application/json' } : {}) },
    body: payload ? JSON.stringify(payload) : undefined,
  })
  const body = response.status === 204 ? {} : await response.json().catch(() => ({}))
  if (response.status === 401) throw new Error(`Harvest refused the token; ${signInAgain}`)
  if (!response.ok) throw new Error(`Harvest: ${body.message || body.error_description || body.error || response.status}`)
  return body
}
const get = (path, params) => call('GET', path, params)

// every page of a list, joined
async function all(path, key, params = {}) {
  const items = []
  for (let page = 1; page; ) {
    const body = await get(path, { ...params, page, per_page: 2000 })
    items.push(...(body[key] ?? []))
    page = body.next_page
  }
  return items
}

const compact = (value) => Object.fromEntries(Object.entries(value).filter(([, v]) => v != null && v !== '' && v !== false && !(Array.isArray(v) && !v.length)))

let me = null
const myId = async () => (me ??= await get('/users/me')).id

// a date in the machine's own time zone, as YYYY-MM-DD
const day = (date) => date.toLocaleDateString('en-CA')
const today = () => day(new Date())

function thisWeek() {
  const monday = new Date()
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return { from: day(monday), to: day(sunday) }
}

export async function projects() {
  const assignments = await all('/users/me/project_assignments', 'project_assignments')
  return assignments.filter((a) => a.is_active).map((a) => compact({
    project_id: a.project.id,
    project: a.project.name,
    code: a.project.code,
    client: a.client?.name,
    tasks: a.task_assignments.filter((t) => t.is_active).map((t) => compact({ task_id: t.task.id, task: t.task.name, billable: t.billable })),
  }))
}

function entry(e) {
  return compact({
    id: e.id,
    date: e.spent_date,
    hours: e.hours,
    project: e.project?.name,
    project_id: e.project?.id,
    client: e.client?.name,
    task: e.task?.name,
    task_id: e.task?.id,
    notes: e.notes,
    started: e.started_time,
    ended: e.ended_time,
    running: e.is_running,
    locked: e.is_locked ? e.locked_reason || true : null,
  })
}

export async function entries({ from, to }) {
  const week = thisWeek()
  const range = { from: from ?? week.from, to: to ?? week.to }
  const list = await all('/time_entries', 'time_entries', { user_id: await myId(), ...range })
  const shown = list.map(entry).sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
  const hours = Math.round(shown.reduce((sum, e) => sum + e.hours, 0) * 100) / 100
  return { ...range, total_hours: hours, entries: shown }
}

export async function logTime({ projectId, taskId, date, hours, started, ended, notes }) {
  if (hours == null && !started) throw new Error('give hours, or started (and ended)')
  if (hours != null && started) throw new Error('give hours or started and ended, not both')
  return entry(await call('POST', '/time_entries', {}, {
    user_id: await myId(),
    project_id: projectId,
    task_id: taskId,
    spent_date: date ?? today(),
    hours,
    started_time: started,
    ended_time: ended,
    notes,
  }))
}

async function own(id) {
  const found = await get(`/time_entries/${id}`)
  if (found.user?.id !== await myId()) throw new Error(`time entry ${id} is not yours`)
  return found
}

export async function updateEntry({ id, projectId, taskId, date, hours, started, ended, notes }) {
  await own(id)
  return entry(await call('PATCH', `/time_entries/${id}`, {}, {
    project_id: projectId,
    task_id: taskId,
    spent_date: date,
    hours,
    started_time: started,
    ended_time: ended,
    notes,
  }))
}

export async function deleteEntry({ id }) {
  const gone = entry(await own(id))
  await call('DELETE', `/time_entries/${id}`)
  return { deleted: gone }
}
