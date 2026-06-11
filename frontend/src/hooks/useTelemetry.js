import { useRef, useCallback, useEffect } from 'react'

export function useTelemetry(sessionId) {
  const d = useRef({
    keystroke_intervals: [],
    mouse_positions: [],
    field_timings: {},
    field_fill_times: [],
    autofill_count: 0,
    start_time: Date.now(),
    tab_switches: 0,
    last_key_time: null,
  })

  useEffect(() => {
    const handler = () => { if (document.hidden) d.current.tab_switches += 1 }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [])

  const onKeyDown = useCallback(() => {
    const now = Date.now()
    if (d.current.last_key_time !== null) {
      d.current.keystroke_intervals.push(now - d.current.last_key_time)
    }
    d.current.last_key_time = now
  }, [])

  const onMouseMove = useCallback((e) => {
    // Sample every 3rd event to avoid flooding
    if (d.current.mouse_positions.length % 3 === 0) {
      d.current.mouse_positions.push({ x: e.clientX, y: e.clientY, t: Date.now() })
    }
  }, [])

  const onFieldFocus = useCallback((fieldName) => {
    d.current.field_timings[fieldName] = { start: Date.now(), autofilled: false }
  }, [])

  const onFieldBlur = useCallback((fieldName) => {
    const timing = d.current.field_timings[fieldName]
    if (!timing) return
    // Autofill fills in < 10ms — substitute a human-range fill time so the
    // model doesn't mistake browser autocomplete for a bot script.
    const duration = timing.autofilled ? 2000 : Date.now() - timing.start
    d.current.field_fill_times.push(duration)
  }, [])

  // Called when a field value changes without a preceding keydown (autofill or paste).
  const onAutoFill = useCallback((fieldName) => {
    if (d.current.field_timings[fieldName]) {
      d.current.field_timings[fieldName].autofilled = true
    }
    d.current.autofill_count += 1
  }, [])

  // Returns true if a keydown was recorded in the last 400ms.
  // Used by onChange handlers to distinguish typing from autofill/paste.
  const wasRecentKeyDown = useCallback(() => {
    return d.current.last_key_time !== null &&
      Date.now() - d.current.last_key_time < 400
  }, [])

  const getPayload = useCallback(() => {
    const intervals = d.current.keystroke_intervals
    const mean = intervals.length > 0
      ? intervals.reduce((a, b) => a + b, 0) / intervals.length : 0
    const variance = intervals.length > 1
      ? Math.sqrt(intervals.reduce((s, v) => s + (v - mean) ** 2, 0) / intervals.length) : 0

    const positions = d.current.mouse_positions
    let entropy = 0
    if (positions.length > 2) {
      const angles = []
      for (let i = 1; i < positions.length; i++) {
        const dx = positions[i].x - positions[i - 1].x
        const dy = positions[i].y - positions[i - 1].y
        if (dx !== 0 || dy !== 0) angles.push(Math.atan2(dy, dx))
      }
      if (angles.length > 1) {
        const aMean = angles.reduce((a, b) => a + b, 0) / angles.length
        entropy = Math.sqrt(angles.reduce((s, a) => s + (a - aMean) ** 2, 0) / angles.length)
      }
    }

    const fillTimes = d.current.field_fill_times
    const avgFill = fillTimes.length > 0
      ? fillTimes.reduce((a, b) => a + b, 0) / fillTimes.length : 0
    const instantFills = fillTimes.filter(t => t < 80).length
    const timeOnPage = (Date.now() - d.current.start_time) / 1000

    return {
      session_id: sessionId,
      keystroke_intervals: intervals.slice(-20),
      keystroke_variance: Math.round(variance),
      avg_keystroke_interval: Math.round(mean),
      mouse_movement_count: positions.length,
      mouse_entropy: parseFloat(entropy.toFixed(3)),
      field_fill_speeds: fillTimes,
      avg_fill_speed: Math.round(avgFill),
      instant_fills: instantFills,
      time_on_page: parseFloat(timeOnPage.toFixed(1)),
      tab_switches: d.current.tab_switches,
      user_agent_consistent: !navigator.webdriver,
      field_count: d.current.field_fill_times.length,
      autofill_used: d.current.autofill_count > 0,
    }
  }, [sessionId])

  return { onKeyDown, onMouseMove, onFieldFocus, onFieldBlur, onAutoFill, wasRecentKeyDown, getPayload }
}
