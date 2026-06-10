import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import LiveQueue from './LiveQueue'
import { useTelemetry } from '../hooks/useTelemetry'
import { useQueue } from '../hooks/useQueue'
import { joinQueue, scoreSession, getQueueStatus } from '../lib/api'

// ── Constants ─────────────────────────────────────────────────────────────────

const STATIONS = [
  { code: 'NDLS', name: 'New Delhi',                    aliases: ['delhi', 'new delhi', 'dilli'] },
  { code: 'NZM',  name: 'Hazrat Nizamuddin',            aliases: ['nizamuddin', 'nzm', 'delhi'] },
  { code: 'DLI',  name: 'Old Delhi Junction',           aliases: ['old delhi', 'delhi'] },
  { code: 'MMCT', name: 'Mumbai Central',               aliases: ['bombay central', 'mumbai', 'bombay'] },
  { code: 'CSTM', name: 'Chhatrapati Shivaji Terminus', aliases: ['cst', 'vt', 'bombay', 'mumbai'] },
  { code: 'LTT',  name: 'Lokmanya Tilak Terminus',      aliases: ['kurla', 'mumbai'] },
  { code: 'HWH',  name: 'Howrah Junction',              aliases: ['howrah', 'kolkata', 'calcutta'] },
  { code: 'SDAH', name: 'Sealdah',                      aliases: ['kolkata', 'calcutta'] },
  { code: 'MAS',  name: 'Chennai Central',              aliases: ['madras', 'chennai'] },
  { code: 'MS',   name: 'Chennai Egmore',               aliases: ['egmore', 'madras', 'chennai'] },
  { code: 'SBC',  name: 'Bengaluru City Junction',      aliases: ['bangalore', 'bengaluru'] },
  { code: 'YPR',  name: 'Yesvantpur Junction',          aliases: ['bangalore', 'bengaluru'] },
  { code: 'SC',   name: 'Secunderabad Junction',        aliases: ['hyderabad', 'secunderabad'] },
  { code: 'HYB',  name: 'Hyderabad Deccan',             aliases: ['hyderabad', 'nampally'] },
  { code: 'ADI',  name: 'Ahmedabad Junction',           aliases: ['ahmedabad', 'amdavad'] },
  { code: 'LKO',  name: 'Lucknow Charbagh',             aliases: ['lucknow'] },
  { code: 'PNBE', name: 'Patna Junction',               aliases: ['patna'] },
  { code: 'JP',   name: 'Jaipur Junction',              aliases: ['jaipur', 'pink city'] },
  { code: 'BPL',  name: 'Bhopal Junction',              aliases: ['bhopal'] },
  { code: 'NGP',  name: 'Nagpur Junction',              aliases: ['nagpur'] },
  { code: 'BBS',  name: 'Bhubaneswar',                  aliases: ['bhubaneswar', 'odisha'] },
  { code: 'GHY',  name: 'Guwahati',                     aliases: ['gauhati', 'assam'] },
  { code: 'CDG',  name: 'Chandigarh',                   aliases: ['chandigarh', 'chd'] },
  { code: 'PUNE', name: 'Pune Junction',                aliases: ['pune', 'poona'] },
  { code: 'CNB',  name: 'Kanpur Central',               aliases: ['kanpur', 'cawnpore'] },
  { code: 'AGC',  name: 'Agra Cantt',                   aliases: ['agra', 'taj mahal'] },
  { code: 'VSKP', name: 'Visakhapatnam',                aliases: ['vizag', 'visakhapatnam'] },
  { code: 'TVC',  name: 'Thiruvananthapuram Central',   aliases: ['trivandrum', 'kerala'] },
  { code: 'ERS',  name: 'Ernakulam Junction',           aliases: ['kochi', 'cochin', 'ernakulam'] },
  { code: 'CBE',  name: 'Coimbatore Junction',          aliases: ['coimbatore'] },
  { code: 'MDU',  name: 'Madurai Junction',             aliases: ['madurai'] },
  { code: 'MYS',  name: 'Mysuru Junction',              aliases: ['mysore'] },
  { code: 'UDZ',  name: 'Udaipur City',                 aliases: ['udaipur', 'rajasthan'] },
  { code: 'BSB',  name: 'Varanasi Junction',            aliases: ['varanasi', 'kashi', 'banaras'] },
  { code: 'JAT',  name: 'Jammu Tawi',                   aliases: ['jammu'] },
  { code: 'ASR',  name: 'Amritsar Junction',            aliases: ['amritsar', 'golden temple'] },
  { code: 'LDH',  name: 'Ludhiana Junction',            aliases: ['ludhiana'] },
]

const TRAINS = [
  { num: '12301', name: 'Rajdhani Express',   from: 'NDLS', to: 'HWH',  dep: '16:55', arr: '09:55', days: '+1', dur: '17h 00m', price: 1545 },
  { num: '12951', name: 'Mumbai Rajdhani',    from: 'NDLS', to: 'MMCT', dep: '16:25', arr: '08:35', days: '+1', dur: '16h 10m', price: 1865 },
  { num: '22691', name: 'Rajdhani Express',   from: 'SBC',  to: 'NDLS', dep: '20:00', arr: '05:40', days: '+2', dur: '33h 40m', price: 2120 },
  { num: '12259', name: 'Duronto Express',    from: 'SDAH', to: 'NDLS', dep: '20:05', arr: '11:00', days: '+1', dur: '14h 55m', price: 1390 },
]

const NAV_TABS = ['Trains', 'Holidays', 'Staying', 'Dining']

function genSessionId() {
  return 'sess_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

function todayLocalISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const defaultForm = () => ({
  from: 'NDLS - New Delhi', to: 'MAS - Chennai Central', date: todayLocalISO(),
  trainClass: '3A', quota: 'TATKAL',
  name: '', age: '', gender: 'M', phone: '', berth: 'LB',
})

// City name for a station code, stripped of station-type words:
// MAS → "Chennai", SBC → "Bengaluru", NDLS → "New Delhi".
function cityNameFor(code) {
  const s = STATIONS.find(st => st.code === code)
  if (!s) return null
  return s.name
    .replace(/\b(Junction|Central|Terminus|City|Cantt|Charbagh|Egmore|Deccan|Tawi|Hazrat)\b/gi, '')
    .replace(/\s+/g, ' ').trim()
}

const TRAIN_STYLES = ['Rajdhani Express', 'Express', 'Duronto Express', 'Superfast Express']

// Resolve free-typed station text to a station code: "MAS - Chennai Central" → MAS,
// "madras" → MAS, "mas" → MAS. Falls back to the raw text uppercased.
function resolveStationCode(input) {
  const raw = (input.includes(' - ') ? input.split(' - ')[0] : input).trim()
  if (!raw) return null
  const q = raw.toLowerCase()
  const match =
    STATIONS.find(s => s.code.toLowerCase() === q) ||
    STATIONS.find(s => s.name.toLowerCase().includes(q) || s.aliases.some(a => a.includes(q)))
  return match ? match.code : raw.toUpperCase().slice(0, 5)
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const inputStyle = {
  width: '100%', padding: '9px 11px', border: '1px solid #d1d5db',
  borderRadius: 4, fontSize: 13, outline: 'none', boxSizing: 'border-box',
  fontFamily: 'inherit', background: 'white',
}
const labelStyle = {
  fontSize: 11, fontWeight: 600, color: '#374151',
  marginBottom: 5, display: 'block', textTransform: 'uppercase', letterSpacing: 0.4,
}
const btnPrimary = {
  background: '#1d4ed8', color: 'white', border: 'none', borderRadius: 4,
  padding: '10px 28px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
  fontFamily: 'inherit', letterSpacing: 0.2,
}

// ── StationInput ──────────────────────────────────────────────────────────────

function Highlight({ text, query }) {
  if (!query) return <span>{text}</span>
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return <span>{text}</span>
  return (
    <span>
      {text.slice(0, idx)}
      <span style={{ fontWeight: 700, color: '#1d4ed8' }}>{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </span>
  )
}

function StationInput({ value, onChange, onFocusCb, onBlurCb, placeholder, id }) {
  const [query, setQuery] = useState(value || '')
  const [open, setOpen] = useState(false)

  useEffect(() => { setQuery(value || '') }, [value])

  const rawQ = query.includes(' - ') ? query.split(' - ')[0].trim() : query.trim()

  const filtered = rawQ.length === 0
    ? STATIONS.slice(0, 8)
    : STATIONS.filter(s => {
        const q = rawQ.toUpperCase()
        const ql = rawQ.toLowerCase()
        return s.code.includes(q) || s.name.toLowerCase().includes(ql) ||
          s.aliases.some(a => a.toLowerCase().includes(ql))
      }).slice(0, 8)

  function select(s) {
    const val = `${s.code} - ${s.name}`
    setQuery(val)
    onChange(val)
    setOpen(false)
  }

  function clear(e) {
    e.stopPropagation()
    setQuery('')
    onChange('')
    setOpen(true)
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <input
          id={id}
          style={{ ...inputStyle, paddingRight: query ? 28 : 11 }}
          value={query}
          placeholder={placeholder}
          autoComplete="off"
          required
          onChange={e => { setQuery(e.target.value); onChange(e.target.value); setOpen(true) }}
          onFocus={() => { setOpen(true); onFocusCb?.() }}
          onBlur={() => { setTimeout(() => setOpen(false), 160); onBlurCb?.() }}
        />
        {query && (
          <span onMouseDown={clear} style={{
            position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
            cursor: 'pointer', color: '#9ca3af', fontSize: 14, lineHeight: 1, userSelect: 'none',
          }}>✕</span>
        )}
      </div>
      {open && (
        <div style={{
          position: 'absolute', zIndex: 200, left: 0, right: 0, top: '100%',
          background: 'white', border: '1px solid #d1d5db', borderTop: 'none',
          borderRadius: '0 0 6px 6px', boxShadow: '0 8px 24px rgba(0,0,0,0.13)',
          maxHeight: 280, overflowY: 'auto',
        }}>
          <div style={{
            padding: '6px 12px 4px', fontSize: 10, fontWeight: 700,
            color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5,
            borderBottom: '1px solid #f3f4f6',
          }}>
            {rawQ.length === 0 ? 'Popular Stations' : `${filtered.length} result${filtered.length !== 1 ? 's' : ''}`}
          </div>
          {filtered.length === 0 ? (
            <div style={{ padding: '14px 12px', fontSize: 13, color: '#9ca3af', textAlign: 'center' }}>
              No stations found for "{rawQ}"
            </div>
          ) : filtered.map((s, i) => (
            <div key={s.code} onMouseDown={() => select(s)} style={{
              padding: '9px 12px', cursor: 'pointer', fontSize: 13,
              display: 'flex', alignItems: 'center', gap: 12,
              borderBottom: i < filtered.length - 1 ? '1px solid #f9fafb' : 'none',
              background: 'white', transition: 'background 0.1s',
            }}
              onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'}
              onMouseLeave={e => e.currentTarget.style.background = 'white'}
            >
              <span style={{ fontWeight: 800, color: '#1d4ed8', minWidth: 48, flexShrink: 0, fontFamily: 'monospace', fontSize: 12, letterSpacing: 0.5 }}>
                <Highlight text={s.code} query={rawQ.toUpperCase()} />
              </span>
              <span style={{ color: '#111827', fontSize: 13 }}>
                <Highlight text={s.name} query={rawQ} />
              </span>
              <span style={{ marginLeft: 'auto', fontSize: 10, color: '#9ca3af', flexShrink: 0 }}>🚉</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Tatkal countdown ──────────────────────────────────────────────────────────

function TatkalCountdown() {
  const [secs, setSecs] = useState(() => {
    const now = new Date(), end = new Date()
    end.setHours(23, 59, 0, 0)
    return Math.max(0, Math.floor((end - now) / 1000))
  })

  useEffect(() => {
    const t = setInterval(() => setSecs(s => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [])

  const h = String(Math.floor(secs / 3600)).padStart(2, '0')
  const m = String(Math.floor((secs % 3600) / 60)).padStart(2, '0')
  const s = String(secs % 60).padStart(2, '0')
  const urgent = secs < 600

  return (
    <span style={{
      background: urgent ? '#dc2626' : '#92400e',
      color: 'white', fontFamily: 'monospace', fontWeight: 800,
      padding: '2px 9px', borderRadius: 4, fontSize: 13, letterSpacing: 1.5,
      display: 'inline-block', minWidth: 74, textAlign: 'center',
      animation: urgent ? 'urgentPulse 1s infinite' : 'none',
    }}>
      {h}:{m}:{s}
    </span>
  )
}

// ── Train card (reused in search & select steps) ──────────────────────────────

function TrainCard({ train, trainClass, onBook }) {
  return (
    <div style={{
      border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden',
      transition: 'box-shadow 0.15s, border-color 0.15s', background: 'white',
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.boxShadow = '0 2px 12px rgba(59,130,246,0.12)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = 'none' }}
    >
      <div style={{ background: '#f8fafc', padding: '9px 16px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#1d4ed8', fontSize: 13 }}>{train.num}</span>
        <span style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>{train.name}</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: '#dcfce7', color: '#15803d' }}>
          RUNS DAILY
        </span>
      </div>
      <div style={{ padding: '12px 16px', display: 'grid', gridTemplateColumns: '1fr auto 140px', alignItems: 'center', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#111827', lineHeight: 1 }}>{train.dep}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#1d4ed8', marginTop: 2 }}>{train.from}</div>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <div style={{ fontSize: 10, color: '#9ca3af' }}>————————→</div>
            <div style={{ fontSize: 10, color: '#6b7280' }}>{train.dur}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#111827', lineHeight: 1 }}>{train.arr}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#1d4ed8', marginTop: 2 }}>{train.to}</div>
            {train.days && <div style={{ fontSize: 9, color: '#d97706', fontWeight: 700 }}>{train.days} day</div>}
          </div>
        </div>
        <div style={{ textAlign: 'center', padding: '0 8px' }}>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 3 }}>{trainClass} · Tatkal</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#15803d', background: '#dcfce7', padding: '3px 10px', borderRadius: 4 }}>
            AVAILABLE
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          <div>
            <div style={{ fontSize: 10, color: '#9ca3af', textAlign: 'right' }}>Tatkal fare</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#111827' }}>₹{train.price.toLocaleString('en-IN')}</div>
          </div>
          <button
            style={{ ...btnPrimary, padding: '7px 18px', fontSize: 12, width: '100%', textAlign: 'center' }}
            onClick={e => { e.stopPropagation(); onBook(train) }}
          >
            Book Now
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function MockIRCTC() {
  const navigate = useNavigate()
  const sessionId = useRef(genSessionId())
  const scoreInterval = useRef(null)
  const { onKeyDown, onMouseMove, onFieldFocus, onFieldBlur, getPayload } = useTelemetry(sessionId.current)
  const { queue, stats, connected } = useQueue()
  // Banner position comes straight from the WebSocket queue snapshot so it can
  // never disagree with the queue panel; API-reported position is the fallback
  // until the first WS frame arrives.
  const livePosition = queue.find(e => e.session_id === sessionId.current)?.position
  const [sidebarWidth, setSidebarWidth] = useState(380)

  const startResize = (e) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = sidebarWidth
    const onMove = (ev) => setSidebarWidth(Math.max(260, Math.min(620, startWidth - (ev.clientX - startX))))
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const [activeNav, setActiveNav] = useState('Trains')
  const [form, setForm] = useState(defaultForm)
  // Steps: search → passenger → confirm → booked
  const [step, setStep] = useState('search')
  const [selectedTrain, setSelectedTrain] = useState(null)
  const [myScore, setMyScore] = useState(null)
  const [myPosition, setMyPosition] = useState(null)
  const [joined, setJoined] = useState(false)
  const [booking, setBooking] = useState(false)
  const [bookingBlocked, setBookingBlocked] = useState(false)
  const [searched, setSearched] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [searchResults, setSearchResults] = useState([])

  const handleSearch = () => {
    const dest = resolveStationCode(form.to)
    if (!dest) {
      setSearchError('Please enter a destination station')
      setSearched(false)
      return
    }
    setSearchError('')
    const city = cityNameFor(dest)
    setSearchResults(TRAINS.map((t, i) => ({
      ...t,
      to: dest,
      name: city ? `${city} ${TRAIN_STYLES[i % TRAIN_STYLES.length]}` : t.name,
    })))
    setSearched(true)
  }
  const [pnr, setPnr] = useState(null)

  useEffect(() => {
    joinQueue(sessionId.current).then(data => {
      setJoined(true)
      setMyPosition(data.position)
    }).catch(() => {})
  }, [])

  const scoreBusy = useRef(false)
  const trySendScore = async () => {
    if (scoreBusy.current) return
    const payload = getPayload()
    // Zero-value features (no typing yet) score lower than dumb bots because
    // avg_keystroke_interval=0 is outside the entire training distribution.
    // Require real keystroke data OR substantial mouse+time before scoring.
    const hasKeyData = payload.keystroke_intervals.length >= 3
    const hasMouseTime = payload.mouse_movement_count >= 15 && payload.time_on_page >= 15
    if (!hasKeyData && !hasMouseTime) return
    scoreBusy.current = true
    try {
      const result = await scoreSession(payload)
      setMyScore(result)
      if (result.position) setMyPosition(result.position)
    } catch (_) {} finally { scoreBusy.current = false }
  }
  const trySendScoreRef = useRef(trySendScore)
  trySendScoreRef.current = trySendScore

  useEffect(() => {
    if (!joined) return
    trySendScoreRef.current() // first attempt fires immediately, not after the interval
    scoreInterval.current = setInterval(() => trySendScoreRef.current(), 3000)
    return () => clearInterval(scoreInterval.current)
  }, [joined])

  // Early keystrokes trigger an immediate score so the badge appears as soon
  // as the user types their first word. Throttled so fast typing can't spam
  // the API into its rate limit.
  const lastKeyScoreAt = useRef(0)
  const handleKeyDownScored = (e) => {
    onKeyDown(e)
    const now = Date.now()
    if (now - lastKeyScoreAt.current > 1200) {
      lastKeyScoreAt.current = now
      trySendScore()
    }
  }

  const handleField = (name, value) => setForm(f => ({ ...f, [name]: value }))

  const handleBook = async () => {
    setBookingBlocked(false)
    setBooking(true)
    try {
      const status = await getQueueStatus(sessionId.current)
      if ((status.human_score ?? 50) < 50) {
        setBookingBlocked(true)
        setBooking(false)
        return
      }
    } catch (_) {}
    try { setMyScore(await scoreSession(getPayload())) } catch (_) {}
    await new Promise(r => setTimeout(r, 1200))
    setPnr('PNR' + Math.floor(Math.random() * 9000000 + 1000000))
    setStep('booked')
    setBooking(false)
  }

  const STEP_KEYS   = ['search', 'passenger', 'confirm', 'booked']
  const STEP_LABELS = ['Search & Select', 'Passengers', 'Confirm', 'Booked']

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', fontFamily: 'Inter, sans-serif' }}
      onMouseMove={onMouseMove}
      onKeyDown={handleKeyDownScored}
    >

      {/* ── Fixed top: header + nav + banner ── */}
      <div style={{ flexShrink: 0 }}>

        {/* Header */}
        <div style={{ background: '#14418a', color: 'white' }}>
          <div style={{ padding: '0 40px', display: 'flex', alignItems: 'center', gap: 14, height: 54 }}>
            <div style={{ background: 'white', color: '#14418a', fontWeight: 900, fontSize: 14, padding: '3px 8px', borderRadius: 3, letterSpacing: 1.5, flexShrink: 0 }}>
              IRCTC
            </div>
            <div style={{ borderLeft: '1px solid rgba(255,255,255,0.25)', paddingLeft: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.3 }}>Indian Railway Catering and Tourism Corporation Ltd.</div>
              <div style={{ fontSize: 10, opacity: 0.65, marginTop: 1 }}>Ministry of Railways — Government of India</div>
            </div>
            <div style={{ flex: 1 }} />
            <button onClick={() => navigate('/admin')} style={{
              background: 'rgba(255,255,255,0.12)', color: 'white', border: '1px solid rgba(255,255,255,0.28)',
              borderRadius: 4, padding: '5px 14px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
            }}>
              Admin Dashboard
            </button>
          </div>
        </div>

        {/* Nav */}
        <div style={{ background: '#0f3272', borderTop: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden' }}>
          <div style={{ padding: '0 40px', display: 'flex' }}>
            {NAV_TABS.map(tab => (
              <div key={tab} onClick={() => setActiveNav(tab)} style={{
                padding: '10px 22px', fontSize: 13, cursor: 'pointer',
                fontWeight: activeNav === tab ? 700 : 400,
                color: activeNav === tab ? 'white' : 'rgba(255,255,255,0.58)',
                borderBottom: activeNav === tab ? '3px solid white' : '3px solid transparent',
                transition: 'color 0.15s', userSelect: 'none',
              }}
                onMouseEnter={e => { if (activeNav !== tab) e.currentTarget.style.color = 'rgba(255,255,255,0.88)' }}
                onMouseLeave={e => { if (activeNav !== tab) e.currentTarget.style.color = 'rgba(255,255,255,0.58)' }}
              >
                {tab === 'Trains' && <span style={{ marginRight: 5 }}>🚆</span>}
                {tab}
              </div>
            ))}
          </div>
        </div>

        {/* Tatkal banner */}
        <div style={{ background: '#f59e0b' }}>
          <div style={{ padding: '7px 40px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, fontWeight: 600, color: '#78350f' }}>
            <span style={{ fontSize: 15 }}>⚡</span>
            <span>TATKAL BOOKING OPEN</span>
            <span style={{ opacity: 0.6 }}>—</span>
            <span>Window closes in</span>
            <TatkalCountdown />
            <span>Book before it's gone.</span>
          </div>
        </div>

      </div>

      {/* ── Body: left panel + right queue panel ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Left: scrollable booking content */}
        <div style={{ flex: 1, overflowY: 'auto', background: '#eef2f7', minWidth: 0 }}>
          <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 32px' }}>

            {/* Booking card */}
            <div style={{ background: 'white', borderRadius: 8, boxShadow: '0 1px 6px rgba(0,0,0,0.09)', overflow: 'hidden' }}>

              {/* Human score badge */}
              <AnimatePresence>
                {myScore && (
                  <motion.div key="score"
                    initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                    style={{
                      padding: '10px 20px',
                      background: myScore.is_bot ? '#fef2f2' : '#f0fdf4',
                      borderBottom: `2px solid ${myScore.is_bot ? '#dc2626' : '#16a34a'}`,
                      display: 'flex', alignItems: 'center', gap: 12, fontSize: 13,
                    }}
                  >
                    <span style={{ fontSize: 17 }}>{myScore.is_bot ? '🤖' : '✅'}</span>
                    <div>
                      <span style={{ fontWeight: 700, color: myScore.is_bot ? '#dc2626' : '#16a34a' }}>
                        {myScore.is_bot ? 'Suspicious activity detected' : 'Verified human'}
                      </span>
                      <span style={{ color: '#6b7280', marginLeft: 8 }}>
                        Human score: <b style={{ color: myScore.human_score >= 70 ? '#16a34a' : '#dc2626' }}>{myScore.human_score}/100</b>
                      </span>
                    </div>
                    {(livePosition ?? myPosition) && (
                      <div style={{ marginLeft: 'auto', fontWeight: 700, color: '#1d4ed8', fontSize: 13 }}>
                        Queue position: #{livePosition ?? myPosition}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Step tabs */}
              <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
                {STEP_KEYS.map((s, i) => {
                  const cur = STEP_KEYS.indexOf(step)
                  return (
                    <div key={s} style={{
                      flex: 1, padding: '11px 8px', fontSize: 11, fontWeight: 600, textAlign: 'center',
                      color: step === s ? '#1d4ed8' : cur > i ? '#16a34a' : '#9ca3af',
                      borderBottom: step === s ? '2px solid #1d4ed8' : '2px solid transparent',
                      marginBottom: -1, whiteSpace: 'nowrap',
                    }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 16, height: 16, borderRadius: '50%', fontSize: 10, fontWeight: 700,
                        background: step === s ? '#1d4ed8' : cur > i ? '#16a34a' : '#e5e7eb',
                        color: cur >= i ? 'white' : '#9ca3af', marginRight: 5,
                      }}>
                        {cur > i ? '✓' : i + 1}
                      </span>
                      {STEP_LABELS[i]}
                    </div>
                  )
                })}
              </div>

              <div style={{ padding: 28 }}>
                <AnimatePresence mode="wait">

                  {/* ── STEP: Search & Select ── */}
                  {step === 'search' && (
                    <motion.div key="search" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>

                      {/* Search form */}
                      <h2 style={{ margin: '0 0 20px', fontSize: 19, fontWeight: 700, color: '#111827' }}>Book Tatkal Ticket</h2>
                      <form onSubmit={e => e.preventDefault()}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                          <div>
                            <label style={labelStyle} htmlFor="from">From Station</label>
                            <StationInput id="from" value={form.from} placeholder="City or station code"
                              onChange={v => handleField('from', v)}
                              onFocusCb={() => onFieldFocus('from')} onBlurCb={() => onFieldBlur('from')} />
                          </div>
                          <div>
                            <label style={labelStyle} htmlFor="to">To Station</label>
                            <StationInput id="to" value={form.to} placeholder="City or station code"
                              onChange={v => handleField('to', v)}
                              onFocusCb={() => onFieldFocus('to')} onBlurCb={() => onFieldBlur('to')} />
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>
                          <div>
                            <label style={labelStyle} htmlFor="date">Journey Date</label>
                            <input id="date" type="date" style={inputStyle}
                              value={form.date} onChange={e => handleField('date', e.target.value)}
                              onFocus={() => onFieldFocus('date')} onBlur={() => onFieldBlur('date')} />
                          </div>
                          <div>
                            <label style={labelStyle}>Travel Class</label>
                            <select style={inputStyle} value={form.trainClass} onChange={e => handleField('trainClass', e.target.value)}>
                              <option value="1A">AC First Class (1A)</option>
                              <option value="2A">AC 2 Tier (2A)</option>
                              <option value="3A">AC 3 Tier (3A)</option>
                              <option value="SL">Sleeper (SL)</option>
                            </select>
                          </div>
                          <div>
                            <label style={labelStyle}>Quota</label>
                            <select style={inputStyle} value={form.quota} onChange={e => handleField('quota', e.target.value)}>
                              <option value="TATKAL">Tatkal</option>
                              <option value="GENERAL">General</option>
                              <option value="LADIES">Ladies</option>
                            </select>
                          </div>
                        </div>
                        <button
                          type="button"
                          style={{ ...btnPrimary, padding: '10px 32px', fontSize: 14 }}
                          onClick={handleSearch}
                        >
                          Search Trains
                        </button>
                        {searchError && (
                          <div style={{ marginTop: 10, fontSize: 13, fontWeight: 600, color: '#dc2626' }}>
                            ⚠ {searchError}
                          </div>
                        )}
                      </form>

                      {/* Train results — shown only after search */}
                      {searched && <div style={{ borderTop: '1px solid #e5e7eb', marginTop: 24, paddingTop: 24 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                          <div>
                            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#111827' }}>Available Tatkal Trains</h3>
                            <p style={{ margin: '3px 0 0', fontSize: 12, color: '#6b7280' }}>
                              {searchResults.length} trains · {form.trainClass} class · Tatkal quota
                            </p>
                          </div>
                          <span style={{ fontSize: 11, color: '#9ca3af', background: '#f3f4f6', padding: '3px 10px', borderRadius: 99 }}>
                            Tomorrow
                          </span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {searchResults.map(train => (
                            <TrainCard
                              key={train.num}
                              train={train}
                              trainClass={form.trainClass}
                              onBook={t => { setSelectedTrain(t); setStep('passenger') }}
                            />
                          ))}
                        </div>
                      </div>}
                    </motion.div>
                  )}

                  {/* ── STEP: Passenger details ── */}
                  {step === 'passenger' && (
                    <motion.div key="passenger" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                        <button onClick={() => { setStep('search'); setSearched(true) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: 13, fontFamily: 'inherit' }}>← Back</button>
                        <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700 }}>Passenger Details</h2>
                      </div>
                      {selectedTrain && (
                        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '10px 14px', marginBottom: 22, fontSize: 13, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                          <span><b>{selectedTrain.num}</b> — {selectedTrain.name}</span>
                          <span style={{ color: '#6b7280' }}>|</span>
                          <span>{selectedTrain.from} → {selectedTrain.to}</span>
                          <span style={{ color: '#6b7280' }}>|</span>
                          <span>{form.trainClass} · Tatkal · ₹{selectedTrain.price.toLocaleString('en-IN')}</span>
                        </div>
                      )}
                      <form onSubmit={e => { e.preventDefault(); setStep('confirm') }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
                          <div>
                            <label style={labelStyle} htmlFor="pname">Passenger Name</label>
                            <input id="pname" style={inputStyle} placeholder="As per Aadhaar / ID" required
                              value={form.name} onChange={e => handleField('name', e.target.value)}
                              onFocus={() => onFieldFocus('name')} onBlur={() => onFieldBlur('name')} />
                          </div>
                          <div>
                            <label style={labelStyle} htmlFor="age">Age</label>
                            <input id="age" style={inputStyle} type="number" placeholder="Age" min="1" max="120" required
                              value={form.age} onChange={e => handleField('age', e.target.value)}
                              onFocus={() => onFieldFocus('age')} onBlur={() => onFieldBlur('age')} />
                          </div>
                          <div>
                            <label style={labelStyle}>Gender</label>
                            <select style={inputStyle} value={form.gender} onChange={e => handleField('gender', e.target.value)}>
                              <option value="M">Male</option>
                              <option value="F">Female</option>
                              <option value="T">Transgender</option>
                            </select>
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 22 }}>
                          <div>
                            <label style={labelStyle} htmlFor="phone">Mobile Number</label>
                            <input id="phone" style={inputStyle} type="tel" placeholder="10-digit mobile" required
                              value={form.phone} onChange={e => handleField('phone', e.target.value)}
                              onFocus={() => onFieldFocus('phone')} onBlur={() => onFieldBlur('phone')} />
                          </div>
                          <div>
                            <label style={labelStyle}>Berth Preference</label>
                            <select style={inputStyle} value={form.berth} onChange={e => handleField('berth', e.target.value)}>
                              <option value="LB">Lower Berth</option>
                              <option value="MB">Middle Berth</option>
                              <option value="UB">Upper Berth</option>
                              <option value="SL">Side Lower</option>
                              <option value="SU">Side Upper</option>
                            </select>
                          </div>
                        </div>
                        <div style={{ background: '#fef9c3', border: '1px solid #fde047', borderRadius: 6, padding: '10px 14px', marginBottom: 22, fontSize: 12, color: '#713f12' }}>
                          ⚠️ Tatkal charges apply. Cancellation charges are higher than regular quota. Non-refundable within 24 hours of departure.
                        </div>
                        <button type="submit" style={btnPrimary}>Proceed to Payment →</button>
                      </form>
                    </motion.div>
                  )}

                  {/* ── STEP: Confirm & pay ── */}
                  {step === 'confirm' && (
                    <motion.div key="confirm" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
                      <h2 style={{ margin: '0 0 20px', fontSize: 19, fontWeight: 700 }}>Review & Pay</h2>
                      <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 22, marginBottom: 22 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, fontSize: 13 }}>
                          {[
                            ['Train', `${selectedTrain?.num} — ${selectedTrain?.name}`],
                            ['Route', `${selectedTrain?.from} → ${selectedTrain?.to}`],
                            ['Class / Quota', `${form.trainClass} / Tatkal`],
                            ['Journey Date', form.date || '—'],
                            ['Passenger', form.name || '—'],
                            ['Age / Gender', `${form.age} / ${form.gender}`],
                            ['Mobile', form.phone || '—'],
                            ['Berth', form.berth],
                          ].map(([k, v]) => (
                            <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <span style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.4 }}>{k}</span>
                              <span style={{ fontWeight: 600, color: '#111827' }}>{v}</span>
                            </div>
                          ))}
                        </div>
                        <div style={{ borderTop: '1px solid #e5e7eb', marginTop: 18, paddingTop: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Total Amount</div>
                            <div style={{ fontSize: 11, color: '#9ca3af' }}>incl. Tatkal charges + IRCTC fee</div>
                          </div>
                          <div style={{ fontSize: 24, fontWeight: 800, color: '#1d4ed8' }}>₹{selectedTrain?.price.toLocaleString('en-IN')}</div>
                        </div>
                      </div>
                      <AnimatePresence>
                        {bookingBlocked && (
                          <motion.div
                            key="blocked"
                            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                            style={{
                              background: '#fef2f2', border: '1.5px solid #dc2626', borderRadius: 7,
                              padding: '13px 18px', marginBottom: 16,
                              display: 'flex', alignItems: 'flex-start', gap: 12,
                            }}
                          >
                            <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>🚫</span>
                            <div>
                              <div style={{ fontWeight: 700, color: '#dc2626', fontSize: 14 }}>
                                Booking blocked — suspicious activity detected.
                              </div>
                              <div style={{ color: '#7f1d1d', fontSize: 13, marginTop: 3 }}>
                                Complete identity verification to continue.
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                      <div style={{ display: 'flex', gap: 12 }}>
                        <button onClick={() => { setStep('passenger'); setBookingBlocked(false) }} style={{ ...btnPrimary, background: 'white', color: '#374151', border: '1px solid #d1d5db' }}>← Back</button>
                        <button onClick={handleBook} disabled={booking} style={{ ...btnPrimary, opacity: booking ? 0.7 : 1 }}>
                          {booking ? 'Processing payment...' : `Pay ₹${selectedTrain?.price.toLocaleString('en-IN')} & Confirm`}
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {/* ── STEP: Booked ── */}
                  {step === 'booked' && (
                    <motion.div key="booked" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                      <div style={{ textAlign: 'center', padding: '44px 20px' }}>
                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 18 }} style={{ fontSize: 52, marginBottom: 18 }}>✅</motion.div>
                        <h2 style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 800, color: '#16a34a' }}>Booking Confirmed!</h2>
                        <p style={{ color: '#6b7280', marginBottom: 26 }}>Your Tatkal ticket has been issued successfully.</p>
                        <div style={{ display: 'inline-block', background: '#f0fdf4', border: '2px solid #16a34a', borderRadius: 10, padding: '18px 40px' }}>
                          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6, letterSpacing: 1, textTransform: 'uppercase' }}>PNR Number</div>
                          <div style={{ fontSize: 30, fontWeight: 900, fontFamily: 'monospace', color: '#111827', letterSpacing: 2 }}>{pnr}</div>
                        </div>
                        <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 20 }}>Confirmation SMS sent to {form.phone}</p>
                        <button onClick={() => { setStep('search'); setForm(defaultForm()); setPnr(null); setSelectedTrain(null) }} style={{ ...btnPrimary, marginTop: 20 }}>
                          Book Another Ticket
                        </button>
                      </div>
                    </motion.div>
                  )}

                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>

        {/* Right: queue panel — resizable */}
        <div style={{ width: sidebarWidth, flexShrink: 0, borderLeft: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'white', position: 'relative' }}>
          {/* Drag handle */}
          <div
            onMouseDown={startResize}
            style={{
              position: 'absolute', left: 0, top: 0, bottom: 0, width: 5,
              cursor: 'col-resize', zIndex: 10,
              background: 'transparent', transition: 'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(59,130,246,0.35)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            title="Drag to resize"
          />
          <div style={{ flex: 1, minHeight: 0, padding: 20, display: 'flex', flexDirection: 'column' }}>
            <LiveQueue highlightId={sessionId.current} queue={queue} stats={stats} connected={connected} />
          </div>
        </div>

      </div>

      <style>{`
        @keyframes urgentPulse { 0%,100%{opacity:1} 50%{opacity:0.6} }
        * { box-sizing: border-box; }
        .resize-handle:active { background: rgba(59,130,246,0.5) !important; }
      `}</style>
    </div>
  )
}
