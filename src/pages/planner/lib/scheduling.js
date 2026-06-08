// Pure schedule-generation + grid-layout logic — no DOM, no Vue. Unit-testable.

const COLORS = ['#2563eb', '#7c3aed', '#db2777', '#ea580c', '#16a34a', '#0891b2', '#4f46e5', '#b45309', '#be123c', '#0369a1']

export function scoreSec(sec, freeDays, busyDays, density, timePref, placed) {
  let score = 50
  for (const t of sec.times) {
    if (!t.day) continue
    if (freeDays.includes(t.day)) score -= 100
    if (busyDays.includes(t.day)) score += 20
    const hr = t.startMs / 3600000
    if (timePref === 'morning' && hr >= 12) score -= 15
    if (timePref === 'afternoon' && hr < 12) score -= 15
    if (density === 'compact') {
      const sameDayPlaced = placed.filter(p => p.day === t.day).length
      score += sameDayPlaced * 5
    }
    for (const p of placed) {
      if (p.day === t.day && t.startMs < p.endMs && t.endMs > p.startMs) score -= 50
    }
  }
  return score
}

export function markConflicts(results) {
  const allTimes = []
  for (const r of results) {
    for (const sec of (r.sections || [])) {
      for (const t of sec.times) {
        if (!t.day) continue
        allTimes.push({ result: r, day: t.day, startMs: t.startMs, endMs: t.endMs })
      }
    }
  }
  for (let i = 0; i < allTimes.length; i++) {
    for (let j = i + 1; j < allTimes.length; j++) {
      const a = allTimes[i], b = allTimes[j]
      if (a.result === b.result) continue
      if (a.day === b.day && a.startMs < b.endMs && a.endMs > b.startMs) {
        a.result.conflict = true
        b.result.conflict = true
      }
    }
  }
}

// Greedily pick best LEC + TUT/PRA per course given preferences.
// prefs: { density, time, freeDays:number[], busyDays:number[] }
export function buildSchedule(timetable, scheduledCourses, prefs) {
  const { density, time, freeDays, busyDays } = prefs
  const lookup = new Map()
  for (const c of timetable.courses) {
    if (!lookup.has(c.code)) lookup.set(c.code, c)
  }

  const results = []
  const placed = []
  const colorMap = {}
  let colorIdx = 0

  for (const code of scheduledCourses) {
    if (!colorMap[code]) colorMap[code] = COLORS[colorIdx++ % COLORS.length]
    const entry = lookup.get(code)
    if (!entry) {
      results.push({ code, name: 'Not in timetable', sections: [], times: [], color: colorMap[code], missing: true })
      continue
    }

    const lectures = entry.sections.filter(s => s.type === 'LEC' || s.type === 'ASYNC')
    const tutorials = entry.sections.filter(s => s.type === 'TUT' || s.type === 'PRA')

    const pickedSections = []
    for (const pool of [lectures, tutorials]) {
      if (!pool.length) continue
      const scored = pool.map(sec => ({ sec, score: scoreSec(sec, freeDays, busyDays, density, time, placed) }))
      scored.sort((a, b) => b.score - a.score)
      const best = scored[0].sec
      pickedSections.push(best)
      for (const t of best.times) if (t.day) placed.push({ code, day: t.day, startMs: t.startMs, endMs: t.endMs })
    }

    results.push({ code, name: entry.name, sections: pickedSections, color: colorMap[code], conflict: false })
  }

  markConflicts(results)
  return results
}

// ── Grid layout ──
export const DAY_LABELS = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri']
export const GRID_START = 8 * 3600000   // 8:00 AM
export const GRID_END = 21 * 3600000    // 9:00 PM
export const HOUR_PX = 60

export function msToTop(ms) { return (ms - GRID_START) / 3600000 * HOUR_PX }
export function msToPx(ms) { return ms / 3600000 * HOUR_PX }
export function msToLabel(ms) {
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000)
  const ampm = h < 12 ? 'AM' : 'PM'
  return `${h > 12 ? h - 12 : h || 12}:${String(m).padStart(2, '0')} ${ampm}`
}

// Produce a renderable grid model: hour labels + per-day positioned blocks.
export function buildGrid(results) {
  const totalH = (GRID_END - GRID_START) / 3600000
  const hours = Array.from({ length: totalH }, (_, i) => GRID_START + i * 3600000)
  const colHeight = totalH * HOUR_PX

  const dayBlocks = { 1: [], 2: [], 3: [], 4: [], 5: [] }
  for (const r of results) {
    for (const sec of (r.sections || [])) {
      for (const t of sec.times) {
        if (!t.day || t.day < 1 || t.day > 5) continue
        const top = msToTop(Math.max(t.startMs, GRID_START))
        const height = msToPx(Math.min(t.endMs, GRID_END) - Math.max(t.startMs, GRID_START))
        if (height <= 0) continue
        dayBlocks[t.day].push({
          code: r.code, name: r.name, sec: sec.name, room: t.room,
          top, height, color: r.color, conflict: r.conflict,
          startLabel: msToLabel(t.startMs), endLabel: msToLabel(t.endMs),
        })
      }
    }
  }
  return { hours, dayBlocks, colHeight }
}
