const BASE = '/api'
const ADMIN_KEY = import.meta.env.VITE_ADMIN_KEY || 'dev-admin-key-change-in-prod'
const adminHeaders = { 'Content-Type': 'application/json', 'X-Admin-Key': ADMIN_KEY }

export async function joinQueue(sessionId) {
  const r = await fetch(`${BASE}/queue/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId }),
  })
  return r.json()
}

export async function scoreSession(payload) {
  const r = await fetch(`${BASE}/session/score`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!r.ok) return null
  return r.json()
}

export async function getQueueStatus(sessionId) {
  const r = await fetch(`${BASE}/queue/status/${sessionId}`)
  return r.json()
}

export async function bookTicket(sessionId) {
  const r = await fetch(`${BASE}/queue/book`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId }),
  })
  if (!r.ok) {
    const err = await r.json()
    throw new Error(err.detail || 'Booking denied')
  }
  return r.json()
}

export async function resetQueue() {
  const r = await fetch(`${BASE}/admin/reset`, { method: 'POST', headers: adminHeaders })
  return r.json()
}

export async function getAdminStats() {
  const r = await fetch(`${BASE}/admin/stats`, { headers: { 'X-Admin-Key': ADMIN_KEY } })
  return r.json()
}
