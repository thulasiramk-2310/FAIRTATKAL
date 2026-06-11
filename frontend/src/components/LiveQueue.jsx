import { forwardRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

function ScoreBar({ score }) {
  const color = score >= 70 ? '#16a34a' : score >= 40 ? '#d97706' : '#dc2626'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 4, background: '#f3f4f6', borderRadius: 99, overflow: 'hidden' }}>
        <motion.div
          style={{ height: '100%', background: color, borderRadius: 99 }}
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color, minWidth: 28, textAlign: 'right' }}>
        {Math.round(score)}
      </span>
    </div>
  )
}

const QueueCard = forwardRef(function QueueCard({ entry, highlightId }, ref) {
  const isHighlighted = entry.session_id === highlightId
  const isBot = entry.is_bot
  // Fresh joins sit at the backend default of exactly 50 until the first
  // telemetry arrives — render those as neutral "waiting", not a yellow 50.
  const isPending = entry.label === 'unknown' || entry.human_score === 50

  const borderColor = isHighlighted ? '#2563eb'
    : isPending ? '#d1d5db' : isBot ? '#dc2626' : '#16a34a'
  const bgColor = isHighlighted ? '#eff6ff'
    : isPending ? '#f9fafb' : isBot ? '#fef2f2' : '#f0fdf4'

  return (
    <motion.div
      ref={ref}
      layout
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      style={{
        background: bgColor,
        border: `1.5px solid ${borderColor}`,
        borderRadius: 8,
        padding: '10px 14px',
        display: 'grid',
        gridTemplateColumns: '28px 1fr 120px 80px',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <div style={{
        width: 24, height: 24, borderRadius: '50%',
        background: entry.position <= 3 ? '#2563eb' : '#e5e7eb',
        color: entry.position <= 3 ? 'white' : '#6b7280',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700, flexShrink: 0,
      }}>
        {entry.position}
      </div>

      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#1f2937', fontFamily: 'monospace' }}>
          {entry.session_id.slice(0, 18)}…
          {isHighlighted && (
            <span style={{ marginLeft: 6, fontSize: 10, color: '#2563eb', fontFamily: 'sans-serif' }}>
              ← YOU
            </span>
          )}
        </div>
        <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>
          {isPending ? '⏳ Waiting...' : isBot ? '🤖 Bot detected' : '✅ Verified human'}
        </div>
      </div>

      {isPending ? (
        <div>
          <div style={{ height: 4, background: '#d1d5db', borderRadius: 99, animation: 'pulse 1.5s infinite' }} />
          <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 3 }}>Analyzing behavior…</div>
        </div>
      ) : (
        <ScoreBar score={entry.human_score} />
      )}

      <div style={{
        padding: '3px 10px', borderRadius: 99, textAlign: 'center',
        fontSize: 10, fontWeight: 700,
        background: isPending ? '#9ca3af' : isBot ? '#dc2626' : '#16a34a',
        color: 'white',
      }}>
        {isPending ? 'WAITING' : isBot ? 'BOT' : 'HUMAN'}
      </div>
    </motion.div>
  )
})

// Queue data comes from the parent so the status banner and this panel
// render from the same WebSocket snapshot and can never disagree.
export default function LiveQueue({ highlightId, queue, stats, connected }) {

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1f2937' }}>
            Live Tatkal Queue
          </h2>
          <p style={{ margin: 0, fontSize: 11, color: '#6b7280' }}>
            Humans first — bots pushed back in real time
          </p>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 11, color: connected ? '#16a34a' : '#dc2626',
        }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: connected ? '#16a34a' : '#dc2626',
            animation: connected ? 'pulse 1.5s infinite' : 'none',
          }} />
          {connected ? 'Live' : 'Reconnecting...'}
        </div>
      </div>

      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
          {[
            { label: 'Total', val: stats.total_sessions, color: '#1f2937' },
            { label: 'Humans', val: stats.human_count, color: '#16a34a' },
            { label: 'Bots', val: stats.bot_count, color: '#dc2626' },
            { label: 'Blocked', val: stats.bots_blocked_this_session, color: '#7c3aed' },
          ].map(({ label, val, color }) => (
            <div key={label} style={{
              background: '#f9fafb', border: '1px solid #e5e7eb',
              borderRadius: 6, padding: '8px 10px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 20, fontWeight: 800, color }}>{val}</div>
              <div style={{ fontSize: 10, color: '#9ca3af' }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {stats && stats.bot_count > 0 && (
        <div style={{
          background: '#fef3c7', border: '1px solid #fcd34d',
          borderRadius: 6, padding: '8px 12px', marginBottom: 16,
          fontSize: 12, color: '#92400e', fontWeight: 500,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 16 }}>🛡️</span>
          Bot detection rate: <b>{stats.detection_rate}%</b> —
          avg human: <b style={{ color: '#16a34a' }}>{stats.avg_human_score}</b> vs
          avg bot: <b style={{ color: '#dc2626' }}>{stats.avg_bot_score}</b>
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{
          position: 'sticky', top: 0, zIndex: 2,
          display: 'grid', gridTemplateColumns: '28px 1fr 120px 80px',
          gap: 12, padding: '4px 14px 6px',
          fontSize: 10, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase',
          background: 'white', borderBottom: '1px solid #f3f4f6',
        }}>
          <span>#</span><span>Session</span><span>Human score</span><span>Status</span>
        </div>
        <AnimatePresence mode="popLayout">
          {queue.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af', fontSize: 13 }}
            >
              Queue is empty. Start a bot simulation or open the booking page.
            </motion.div>
          ) : (
            queue.map(entry => (
              <QueueCard key={entry.session_id} entry={entry} highlightId={highlightId} />
            ))
          )}
        </AnimatePresence>
      </div>

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  )
}
