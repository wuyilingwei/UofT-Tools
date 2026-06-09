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

// Group the flat session list into scheduling "scopes". Only the two combined
// ranges are exposed (Summer, Fall-Winter) — no duplicate single-session entries.
// Each scope shows TWO term columns; the full-session (Y) timetable is merged
// into both columns rather than rendered as a standalone third table.
//   [{ id, label, terms: [{value,label}, {value,label}], full: {value,label}|null }]
export function buildScopes(sessions) {
  const byValue = Object.fromEntries(sessions.map(s => [s.value, s]))
  const term = (v) => ({ value: v, label: shortTerm(byValue[v]?.label || v) })
  const scopes = []
  for (const s of sessions) {
    const v = s.value
    if (v.includes('-')) {
      const [a, b] = v.split('-')
      if (byValue[a] && byValue[b]) scopes.push({ id: v, label: s.label, terms: [term(a), term(b)], full: term(v) })
    } else if (!/[FS]$/.test(v) && byValue[v + 'F'] && byValue[v + 'S']) {
      scopes.push({ id: v, label: scopeLabel(s), terms: [term(v + 'F'), term(v + 'S')], full: term(v) })
    }
  }
  return scopes
}

// The badge-term list for availability: the two columns plus the full-session
// term (kept as its own "Summer Full"/"Full Year" label so the Y semantics show).
export function badgeTerms(scope) {
  if (!scope) return []
  return scope.full ? [...scope.terms, scope.full] : [...scope.terms]
}

// Day/time/density are soft preferences, but avoiding a time conflict is ALWAYS
// the first priority: a conflicting section gets a dominating penalty that no
// combination of preferences can overcome, so the scheduler only ever places a
// course on a conflicting slot when every one of its sections conflicts.
export const CONFLICT_PENALTY = 10000

export function scoreSec(sec, freeDays, busyDays, density, timePref, placed) {
  let score = 50
  for (const t of sec.times) {
    if (!t.day) continue
    if (freeDays.includes(t.day)) score -= 25   // prefer to keep this day free
    if (busyDays.includes(t.day)) score += 20   // prefer classes on this day
    const hr = t.startMs / 3600000
    if (timePref === 'morning' && hr >= 12) score -= 15
    if (timePref === 'afternoon' && hr < 12) score -= 15
    const sameDayPlaced = placed.filter(p => p.day === t.day).length
    if (density === 'compact') score += sameDayPlaced * 5      // cluster onto fewer days
    else if (density === 'spread') score -= sameDayPlaced * 5  // spread across more days
    for (const p of placed) {
      if (p.day === t.day && t.startMs < p.endMs && t.endMs > p.startMs) score -= CONFLICT_PENALTY
    }
  }
  return score
}

// "ZZ" is the room code for exam/test-reserved blocks. These may be allowed to
// overlap: opts.zzOverlap (ZZ↔ZZ, default allowed) and opts.zzWithReg
// (ZZ↔regular class, default NOT allowed → still a conflict).
// Key identifying one meeting block of a course (for per-block conflict marking).
export function timeKey(code, t) { return `${code}|${t.day}|${t.startMs}|${t.endMs}` }

export function markConflicts(results, opts = {}) {
  const zzOverlap = opts.zzOverlap !== false
  const zzWithReg = opts.zzWithReg === true
  const conflictTimes = new Set()
  const allTimes = []
  for (const r of results) {
    for (const sec of (r.sections || [])) {
      for (const t of sec.times) {
        if (!t.day) continue
        allTimes.push({ result: r, day: t.day, startMs: t.startMs, endMs: t.endMs, zz: t.room === 'ZZ', key: timeKey(r.code, t) })
      }
    }
  }
  for (let i = 0; i < allTimes.length; i++) {
    for (let j = i + 1; j < allTimes.length; j++) {
      const a = allTimes[i], b = allTimes[j]
      if (a.result === b.result) continue
      if (!(a.day === b.day && a.startMs < b.endMs && a.endMs > b.startMs)) continue
      if (a.zz && b.zz) { if (zzOverlap) continue }
      else if (a.zz || b.zz) { if (zzWithReg) continue }
      a.result.conflict = true
      b.result.conflict = true
      conflictTimes.add(a.key)   // only the overlapping blocks turn red, not the
      conflictTimes.add(b.key)   // course's other meetings
    }
  }
  for (const r of results) r.conflictTimes = conflictTimes
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

  markConflicts(results, prefs)
  return results
}

// Preference-only score for a whole arrangement (conflicts are ranked separately).
function scheduleScore(results, { freeDays, busyDays, time, density }) {
  let score = 0
  const days = new Set()
  for (const r of results) {
    let hasTime = false
    for (const sec of (r.sections || [])) {
      for (const t of sec.times) {
        if (!t.day) continue
        hasTime = true
        days.add(t.day)
        if (freeDays.includes(t.day)) score -= 25
        if (busyDays.includes(t.day)) score += 20
        const hr = t.startMs / 3600000
        if (time === 'morning' && hr >= 12) score -= 15
        if (time === 'afternoon' && hr < 12) score -= 15
      }
    }
    // Strongly prefer a section with actual meeting times over a no-time
    // placeholder (which would otherwise be picked just for avoiding conflicts).
    if ((r.sections || []).length && !hasTime) score -= 1000
  }
  if (density === 'compact') score += (5 - days.size) * 10   // fewer distinct days
  else if (density === 'spread') score += days.size * 10      // more distinct days
  return score
}

// Find conflict-free schedules by backtracking, then rank them by preference.
// Crucially, feasibility (avoiding conflicts) is decided WITHOUT regard to
// preferences — preferences only order/rank the conflict-free results — so no
// preference can ever cause a conflict. Only when NO conflict-free arrangement
// exists do we fall back to a single best-effort (minimum-conflict) option.
// `keep` is a high safety bound, not a feature limit — with a handful of courses
// the number of conflict-free arrangements is small and all of them are returned.
export function rankedSchedules(timetable, codes, prefs, keep = 5000, nodeBudget = 2000000) {
  const zzOverlap = prefs.zzOverlap !== false
  const zzWithReg = prefs.zzWithReg === true
  const lookup = new Map()
  for (const c of timetable.courses) if (!lookup.has(c.code)) lookup.set(c.code, c)
  const colorMap = {}
  let ci = 0
  for (const code of codes) if (!colorMap[code]) colorMap[code] = COLORS[ci++ % COLORS.length]

  const optionTimes = (sections) => {
    const out = []
    for (const sec of sections) for (const t of sec.times) if (t.day) out.push({ day: t.day, startMs: t.startMs, endMs: t.endMs, zz: t.room === 'ZZ' })
    return out
  }
  // Per-course options (LEC × TUT), pre-scored and sorted best-preference first.
  const per = codes.map(code => {
    const entry = lookup.get(code)
    if (!entry) return { code, missing: true, opts: [{ sections: [], times: [] }] }
    const lecs = entry.sections.filter(s => s.type === 'LEC' || s.type === 'ASYNC')
    const tuts = entry.sections.filter(s => s.type === 'TUT' || s.type === 'PRA')
    const L = lecs.length ? lecs.map(s => [s]) : [[]]
    const T = tuts.length ? tuts.map(s => [s]) : [[]]
    const opts = []
    for (const l of L) for (const t of T) {
      const sections = [...l, ...t]
      opts.push({ sections, times: optionTimes(sections), score: sections.reduce((s, sec) => s + scoreSec(sec, prefs.freeDays, prefs.busyDays, prefs.density, prefs.time, []), 0) })
    }
    opts.sort((a, b) => b.score - a.score)
    return { code, name: entry.name, opts }
  })

  const overlaps = (a, b) => a.day === b.day && a.startMs < b.endMs && a.endMs > b.startMs
  const pairConflict = (a, b) => {
    if (!overlaps(a, b)) return false
    if (a.zz && b.zz) return !zzOverlap
    if (a.zz || b.zz) return !zzWithReg
    return true
  }
  const hits = (times, placed) => {
    for (const t of times) for (const p of placed) if (pairConflict(t, p)) return true
    return false
  }
  const buildResults = (pick) => per.map((p, i) => p.missing
    ? { code: p.code, name: 'Not in timetable', sections: [], color: colorMap[p.code], missing: true }
    : { code: p.code, name: p.name, sections: [...pick[i].sections], color: colorMap[p.code], conflict: false })

  // Most-constrained course first → prune earlier.
  const order = per.map((_, i) => i).sort((a, b) => per[a].opts.length - per[b].opts.length)

  const found = []
  let nodes = 0
  const placed = []
  const chosen = new Array(per.length)
  const backtrack = (k) => {
    if (found.length >= keep || nodes > nodeBudget) return
    if (k === order.length) { found.push(chosen.slice()); return }
    nodes++
    for (const opt of per[order[k]].opts) {
      if (hits(opt.times, placed)) continue
      for (const t of opt.times) placed.push(t)
      chosen[order[k]] = opt
      backtrack(k + 1)
      for (let n = 0; n < opt.times.length; n++) placed.pop()
      if (found.length >= keep || nodes > nodeBudget) return
    }
  }
  backtrack(0)

  if (found.length) {
    const ranked = found.map(pick => {
      const results = buildResults(pick)
      markConflicts(results, prefs)
      return { results, conflicts: 0, score: scheduleScore(results, prefs) }
    })
    ranked.sort((a, b) => b.score - a.score)
    return ranked
  }

  // No conflict-free arrangement exists: greedy minimum-conflict, best preference as tiebreak.
  const pick = new Array(per.length)
  const placedG = []
  for (const k of order) {
    const p = per[k]
    let best = p.opts[0], bestConf = Infinity, bestScore = -Infinity
    for (const opt of p.opts) {
      const conf = opt.times.reduce((n, t) => n + placedG.filter(pt => pairConflict(t, pt)).length, 0)
      if (conf < bestConf || (conf === bestConf && opt.score > bestScore)) { best = opt; bestConf = conf; bestScore = opt.score }
    }
    pick[k] = best
    for (const t of best.times) placedG.push(t)
  }
  const results = buildResults(pick)
  markConflicts(results, prefs)
  return [{ results, conflicts: results.filter(r => r.conflict).length, score: scheduleScore(results, prefs) }]
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
  markConflicts(you, prefs)
  markConflicts(friend, prefs)
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

// Merge a column timetable with the full-session (Y) timetable so a candidate is
// judged against everything that will actually appear in that column's grid.
function mergedColumn(term, timetables, fullTT) {
  const tt = timetables[term.value] || { courses: [], courseCount: 0 }
  if (!fullTT) return tt
  return {
    courses: [...(tt.courses || []), ...(fullTT.courses || [])],
    courseCount: (tt.courseCount || 0) + (fullTT.courseCount || 0),
  }
}

export function analyzeCourseConflicts(scopeTerms, timetables, selectedCodes, prefs, candidateCodes = [], full = null) {
  const columns = scopeTerms || []
  const fullTT = full ? timetables[full.value] : null
  const badge = full ? [...columns, full] : columns
  const selected = [...new Set(selectedCodes || [])]
  const candidates = [...new Set(candidateCodes.length ? candidateCodes : selected)]
  const availability = buildCourseAvailability(badge, timetables)
  const anyPublished = badge.some(term => (timetables[term.value]?.courseCount || 0) > 0)
  const hints = {}

  for (const code of candidates) {
    if (selected.includes(code)) continue
    if (!availability[code]?.length) {
      hints[code] = { conflict: true, reason: anyPublished ? 'Not offered here' : 'Timetable TBA' }
      continue
    }

    const fits = columns.some(term => {
      const tt = mergedColumn(term, timetables, fullTT)
      if (!(tt.courseCount || 0)) return false
      const offered = new Set((tt.courses || []).map(c => c.code))
      if (!offered.has(code)) return false
      const termCourses = [...selected, code].filter(c => offered.has(c))
      const results = buildSchedule(tt, termCourses, prefs)
      const candidate = results.find(r => r.code === code)
      return candidate && !candidate.missing && !results.some(r => r.conflict)
    })

    if (!fits) hints[code] = { conflict: true, reason: 'Conflict Found' }
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

// Lay overlapping blocks within one day side-by-side: each cluster of mutually
// overlapping blocks is split into equal-width columns so conflicting courses
// show L/R instead of hiding each other. Sets `left` (%) and `widthPct` (%).
export function layoutDayColumns(blocks) {
  const sorted = blocks.sort((a, b) => a.top - b.top || (a.top + a.height) - (b.top + b.height))
  let cluster = []
  let clusterEnd = -Infinity
  const flush = () => {
    const colEnds = []
    for (const blk of cluster) {
      let col = colEnds.findIndex(end => blk.top >= end - 0.01)
      if (col === -1) { col = colEnds.length; colEnds.push(0) }
      colEnds[col] = blk.top + blk.height
      blk._col = col
    }
    const ncols = colEnds.length || 1
    for (const blk of cluster) { blk.left = (blk._col / ncols) * 100; blk.widthPct = 100 / ncols }
    cluster = []
    clusterEnd = -Infinity
  }
  for (const blk of sorted) {
    if (cluster.length && blk.top >= clusterEnd - 0.01) flush()
    cluster.push(blk)
    clusterEnd = Math.max(clusterEnd, blk.top + blk.height)
  }
  flush()
  return blocks
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
          top, height, color: r.color,
          conflict: !!(r.conflictTimes && r.conflictTimes.has(timeKey(r.code, t))),
          shared: !!r.shared, full: !!r.full,
          startLabel: msToLabel(t.startMs), endLabel: msToLabel(t.endMs),
        })
      }
    }
  }
  for (const d of [1, 2, 3, 4, 5]) layoutDayColumns(dayBlocks[d])
  return { hours, dayBlocks, colHeight }
}
