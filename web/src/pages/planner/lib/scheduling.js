// Pure schedule-generation + grid-layout logic — no DOM, no Vue. Unit-testable.

const COLORS = ['#2563eb', '#7c3aed', '#db2777', '#ea580c', '#16a34a', '#0891b2', '#4f46e5', '#b45309', '#be123c', '#0369a1']

// Short, grid-friendly term label from a full session label.
export function shortTerm(label = '') {
  if (/summer/i.test(label) && /full/i.test(label)) return 'Summer Full'
  if (/fall-winter|full year/i.test(label)) return 'Full Year'
  if (/fall/i.test(label)) return 'Fall'
  if (/winter/i.test(label)) return 'Winter'
  if (/summer/i.test(label) && /first/i.test(label)) return 'Summer F'
  if (/summer/i.test(label) && /second/i.test(label)) return 'Summer S'
  if (/summer/i.test(label)) return 'Summer'
  return label
}

function scopeLabel(session) {
  if (/summer/i.test(session.label || '') && /full/i.test(session.label || '')) {
    return (session.label || '').replace(/\s*Full Session\s*/i, ' ').replace(/\s*\(Y\)\s*$/, '').trim()
  }
  return session.label
}

// Group the flat session list into scheduling "scopes". A combined scope spans
// its component timetable files plus the full-session timetable rendered beside them.
//   [{ id, label, terms: [{value,label}], single? }]
export function buildScopes(sessions) {
  const byValue = Object.fromEntries(sessions.map(s => [s.value, s]))
  const term = (v) => ({ value: v, label: shortTerm(byValue[v]?.label || v) })
  const scopes = []
  for (const s of sessions) {
    const v = s.value
    if (v.includes('-')) {
      const [a, b] = v.split('-')
      if (byValue[a] && byValue[b]) scopes.push({ id: v, label: s.label, terms: [term(a), term(b), term(v)] })
    } else if (!/[FS]$/.test(v) && byValue[v + 'F'] && byValue[v + 'S']) {
      scopes.push({ id: v, label: scopeLabel(s), terms: [term(v + 'F'), term(v + 'S'), term(v)] })
    }
  }
  for (const s of sessions) {
    if (!s.value.includes('-')) {
      scopes.push({ id: 'one:' + s.value, label: s.label, terms: [term(s.value)], single: true })
    }
  }
  return scopes
}

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
// prePlaced: time blocks already occupied (e.g. shared courses when co-scheduling).
export function buildSchedule(timetable, scheduledCourses, prefs, prePlaced = []) {
  const { density, time, freeDays, busyDays } = prefs
  const lookup = new Map()
  for (const c of timetable.courses) {
    if (!lookup.has(c.code)) lookup.set(c.code, c)
  }

  const results = []
  const placed = [...prePlaced]
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

// Time blocks occupied by a set of scheduled results.
function placedTimes(results) {
  const out = []
  for (const r of results) {
    for (const sec of (r.sections || [])) {
      for (const t of sec.times) {
        if (t.day) out.push({ code: r.code, day: t.day, startMs: t.startMs, endMs: t.endMs })
      }
    }
  }
  return out
}

// Shallow-clone results so per-person conflict flags stay independent while the
// shared sections (and their times) remain identical.
function cloneResults(results) {
  return results.map(r => ({ ...r, conflict: false }))
}

// Co-schedule you + one friend: shared courses get the SAME LEC and PRA/TUT
// section for both; each person's solo courses fit around the shared blocks.
// Returns { you: results[], friend: results[] }.
export function buildPairSchedule(timetable, shared, yourSolo, friendSolo, prefs) {
  const offered = new Set((timetable.courses || []).map(c => c.code))
  const sh = shared.filter(c => offered.has(c))
  const ys = yourSolo.filter(c => offered.has(c))
  const fs = friendSolo.filter(c => offered.has(c))

  const sharedResults = buildSchedule(timetable, sh, prefs)
  sharedResults.forEach(r => { r.shared = true })
  const seed = placedTimes(sharedResults)

  const you = [...cloneResults(sharedResults), ...buildSchedule(timetable, ys, prefs, seed)]
  const friend = [...cloneResults(sharedResults), ...buildSchedule(timetable, fs, prefs, seed)]
  markConflicts(you)
  markConflicts(friend)
  return { you, friend }
}

export function buildCourseAvailability(scopeTerms, timetables) {
  const map = {}
  for (const term of scopeTerms || []) {
    const tt = timetables[term.value]
    if (!tt || !tt.courses) continue
    for (const c of tt.courses) {
      if (!map[c.code]) map[c.code] = []
      if (!map[c.code].includes(term.label)) map[c.code].push(term.label)
    }
  }
  return map
}

export function analyzeCourseConflicts(scopeTerms, timetables, selectedCodes, prefs, candidateCodes = []) {
  const terms = scopeTerms || []
  const selected = [...new Set(selectedCodes || [])]
  const candidates = [...new Set(candidateCodes.length ? candidateCodes : selected)]
  const availability = buildCourseAvailability(terms, timetables)
  const anyPublished = terms.some(term => (timetables[term.value]?.courseCount || 0) > 0)
  const hints = {}

  for (const code of candidates) {
    if (selected.includes(code)) continue
    const offeredTerms = terms.filter(term => availability[code]?.includes(term.label))
    if (!offeredTerms.length) {
      hints[code] = { conflict: true, reason: anyPublished ? 'Not offered in this range' : 'Timetable unpublished' }
      continue
    }

    const fits = offeredTerms.some(term => {
      const tt = timetables[term.value]
      if (!tt || !(tt.courseCount || 0)) return false
      const offered = new Set((tt.courses || []).map(c => c.code))
      const termCourses = [...selected, code].filter(c => offered.has(c))
      const results = buildSchedule(tt, termCourses, prefs)
      const candidate = results.find(r => r.code === code)
      return candidate && !candidate.missing && !results.some(r => r.conflict)
    })

    if (!fits) hints[code] = { conflict: true, reason: 'No non-conflicting section found' }
  }

  return hints
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
          top, height, color: r.color, conflict: r.conflict, shared: !!r.shared,
          startLabel: msToLabel(t.startMs), endLabel: msToLabel(t.endMs),
        })
      }
    }
  }
  return { hours, dayBlocks, colHeight }
}
