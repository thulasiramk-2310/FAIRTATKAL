import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useQueue } from '../hooks/useQueue'
import { resetQueue } from '../lib/api'

function StatCard({ label, value, color, sub }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        background: 'white', border: '1px solid #e5e7eb',
        borderRadius: 10, padding: '20px 24px',
        borderTop: `4px solid ${color}`,
      }}
    >
      <div style={{ fontSize: 32, fontWeight: 800, color }}>{value ?? '—'}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{sub}</div>}
    </motion.div>
  )
}

export default function AdminDashboard() {
  const navigate = useNavigate()
  const { queue, stats, connected } = useQueue()
  const [resetting, setResetting] = useState(false)
  const [resetMsg, setResetMsg] = useState(null)
  const [filter, setFilter] = useState('all')

  const handleReset = async () => {
    if (!window.confirm('Reset the queue? This clears all sessions and stats.')) return
    setResetting(true)
    try {
      await resetQueue()
      setResetMsg('Queue reset successfully.')
      setTimeout(() => setResetMsg(null), 3000)
    } catch (e) {
      setResetMsg('Error: could not reach backend.')
    }
    setResetting(false)
  }

  const filtered = filter === 'all' ? queue
    : filter === 'bots' ? queue.filter(e => e.is_bot)
    : queue.filter(e => !e.is_bot && e.label !== 'unknown')

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <div style={{ background: '#1a1a2e', color: 'white', padding: '0 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 16, height: 56 }}>
          <div style={{
            background: '#7c3aed', borderRadius: 6, padding: '4px 10px',
            fontSize: 12, fontWeight: 700, letterSpacing: 1,
          }}>
            ADMIN
          </div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>FairTatkal — Operations Dashboard</div>
          <div style={{ flex: 1 }} />
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 12, color: connected ? '#4ade80' : '#f87171',
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: connected ? '#4ade80' : '#f87171',
              animation: connected ? 'pulse 1.5s infinite' : 'none',
            }} />
            {connected ? 'Live WebSocket' : 'Disconnected'}
          </div>
          <button
            onClick={() => navigate('/')}
            style={{
              background: 'rgba(255,255,255,0.1)', color: 'white',
              border: '1px solid rgba(255,255,255,0.2)', borderRadius: 4,
              padding: '5px 14px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Booking UI
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px' }}>
        {/* Stats grid */}
        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
            <StatCard label="Total Sessions" value={stats.total_sessions} color="#6366f1" />
            <StatCard
              label="Humans Detected"
              value={stats.human_count}
              color="#16a34a"
              sub={`Avg score: ${stats.avg_human_score}/100`}
            />
            <StatCard
              label="Bots Detected"
              value={stats.bot_count}
              color="#dc2626"
              sub={`Avg score: ${stats.avg_bot_score}/100`}
            />
            <StatCard
              label="Detection Rate"
              value={`${stats.detection_rate}%`}
              color="#7c3aed"
              sub={`${stats.bots_blocked_this_session} bots blocked`}
            />
          </div>
        )}

        {/* Score distribution */}
        {stats && stats.total_sessions > 0 && (
          <div style={{
            background: 'white', borderRadius: 10, padding: '20px 24px',
            border: '1px solid #e5e7eb', marginBottom: 24,
          }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700 }}>Score Distribution</h3>
            <div style={{ display: 'flex', height: 24, borderRadius: 6, overflow: 'hidden', gap: 2 }}>
              {queue.length > 0 && (() => {
                const buckets = [0, 0, 0, 0, 0] // 0-20, 20-40, 40-60, 60-80, 80-100
                queue.forEach(e => {
                  const i = Math.min(Math.floor(e.human_score / 20), 4)
                  buckets[i]++
                })
                const total = queue.length
                const colors = ['#dc2626', '#ef4444', '#f59e0b', '#22c55e', '#16a34a']
                const labels = ['0-20', '20-40', '40-60', '60-80', '80-100']
                return buckets.map((count, i) => count > 0 && (
                  <div
                    key={i}
                    title={`Score ${labels[i]}: ${count} sessions`}
                    style={{
                      flex: count / total, background: colors[i],
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, color: 'white', fontWeight: 700, minWidth: count > 0 ? 24 : 0,
                    }}
                  >
                    {count}
                  </div>
                ))
              })()}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10, color: '#9ca3af' }}>
              <span>0 (bot)</span><span>50</span><span>100 (human)</span>
            </div>
          </div>
        )}

        {/* Session table */}
        <div style={{
          background: 'white', borderRadius: 10, border: '1px solid #e5e7eb', overflow: 'hidden',
        }}>
          <div style={{
            padding: '16px 20px', borderBottom: '1px solid #e5e7eb',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
              Live Sessions ({filtered.length})
            </h3>
            <div style={{ display: 'flex', gap: 6, marginLeft: 8 }}>
              {['all', 'humans', 'bots'].map(f => (
                <button key={f} onClick={() => setFilter(f)} style={{
                  padding: '4px 12px', borderRadius: 99, fontSize: 11, fontWeight: 600,
                  border: '1px solid',
                  background: filter === f ? '#1d4ed8' : 'white',
                  color: filter === f ? 'white' : '#6b7280',
                  borderColor: filter === f ? '#1d4ed8' : '#d1d5db',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
            <div style={{ flex: 1 }} />
            {resetMsg && (
              <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>{resetMsg}</span>
            )}
            <button
              onClick={handleReset}
              disabled={resetting}
              style={{
                background: resetting ? '#f3f4f6' : '#fef2f2',
                color: '#dc2626', border: '1px solid #fca5a5',
                borderRadius: 6, padding: '6px 16px', fontSize: 12, fontWeight: 600,
                cursor: resetting ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
              }}
            >
              {resetting ? 'Resetting...' : 'Reset Queue'}
            </button>
          </div>

          {/* Table header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '40px 1fr 100px 100px 100px 90px',
            padding: '10px 20px', background: '#f9fafb',
            fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase',
            borderBottom: '1px solid #e5e7eb',
          }}>
            <span>#</span>
            <span>Session ID</span>
            <span>Human Score</span>
            <span>Label</span>
            <span>Confidence</span>
            <span>Status</span>
          </div>

          {/* Table rows */}
          <div style={{ maxHeight: 500, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                No sessions in queue. Run the bot simulator or open the booking page.
              </div>
            ) : filtered.map((entry, i) => (
              <div key={entry.session_id} style={{
                display: 'grid', gridTemplateColumns: '40px 1fr 100px 100px 100px 90px',
                padding: '10px 20px', fontSize: 12,
                borderBottom: '1px solid #f3f4f6',
                background: entry.is_bot ? '#fef2f2' : i % 2 === 0 ? 'white' : '#fafafa',
              }}>
                <span style={{ color: '#9ca3af', fontWeight: 600 }}>{entry.position}</span>
                <span style={{ fontFamily: 'monospace', color: '#374151' }}>
                  {entry.session_id}
                </span>
                <span>
                  <span style={{
                    fontWeight: 700,
                    color: entry.human_score >= 70 ? '#16a34a' : entry.human_score >= 40 ? '#d97706' : '#dc2626',
                  }}>
                    {entry.human_score.toFixed(1)}
                  </span>
                  <span style={{ color: '#9ca3af' }}>/100</span>
                </span>
                <span style={{
                  fontWeight: 600,
                  color: entry.label === 'bot' ? '#dc2626' : entry.label === 'human' ? '#16a34a' : '#d97706',
                }}>
                  {entry.label}
                </span>
                <span style={{ color: '#6b7280' }}>—</span>
                <span style={{
                  display: 'inline-flex', alignItems: 'center',
                  padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700,
                  background: entry.is_bot ? '#fee2e2' : '#dcfce7',
                  color: entry.is_bot ? '#dc2626' : '#16a34a',
                }}>
                  {entry.is_bot ? 'BLOCKED' : 'ALLOWED'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  )
}
