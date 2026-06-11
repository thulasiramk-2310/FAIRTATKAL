import { useState, useEffect, useRef } from 'react'

// Route through the Vite dev-server proxy (/ws → ws://localhost:8000)
// so the connection uses the same origin as the page and avoids CORS/CSP issues.
const WS_URL = `ws://${window.location.host}/ws/queue`

export function useQueue() {
  const [queue, setQueue] = useState([])
  const [stats, setStats] = useState(null)
  const [connected, setConnected] = useState(false)
  const wsRef = useRef(null)
  const retryRef = useRef(null)
  const retryCount = useRef(0)

  function connect() {
    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      retryCount.current = 0
    }

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.type === 'queue_update') {
          setQueue(data.queue || [])
          setStats(data.stats || null)
        }
      } catch (_) {}
    }

    ws.onclose = () => {
      setConnected(false)
      const delay = Math.min(1000 * 2 ** retryCount.current, 10000)
      retryCount.current++
      retryRef.current = setTimeout(connect, delay)
    }

    ws.onerror = () => ws.close()

    const ping = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send('ping')
    }, 15000)

    ws._ping = ping
  }

  useEffect(() => {
    connect()
    return () => {
      clearTimeout(retryRef.current)
      if (wsRef.current) {
        clearInterval(wsRef.current._ping)
        wsRef.current.onclose = null
        wsRef.current.close()
      }
    }
  }, [])

  return { queue, stats, connected }
}
