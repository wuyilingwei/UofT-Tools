// Pure helpers for program/course logic — no DOM, no Vue. Unit-testable.

export const COURSE_RE = /([A-Z]{2,4}\d{3}[HY]\d)/g

export function courseYear(code) {
  const m = code.match(/\d{3}/)
  if (!m) return null
  return Math.floor(parseInt(m[0]) / 100)
}

// Credit weight of a course code: Y courses count 1.0, H (half) courses 0.5.
export function courseCredit(code) {
  return /Y\d$/i.test(code || '') ? 1.0 : 0.5
}

export function badgeClass(type) {
  if (!type) return ''
  const t = type.toLowerCase()
  if (t.includes('major')) return 'badge-major'
  if (t.includes('minor')) return 'badge-minor'
  if (t.includes('specialist')) return 'badge-specialist'
  return ''
}

export function chipClass(type) {
  const t = (type || '').toLowerCase()
  if (t.includes('major')) return 'major'
  if (t.includes('minor')) return 'minor'
  if (t.includes('specialist')) return 'specialist'
  return 'major'
}

// Build the flat, de-duplicated course list for the selected programs.
// Build the flat, de-duplicated course list for the selected programs plus any
// individually-added courses (extraCourses = codes added outside a program).
// Each entry: { code, programs:[{name,type,intention,added?}], reqLabels:Set, added? }
export function buildCourseList(selectedPrograms, extraCourses = []) {
  const courseMap = new Map()
  for (const prog of selectedPrograms) {
    for (const code of (prog.courses || [])) {
      if (!courseMap.has(code)) courseMap.set(code, { code, programs: [], reqLabels: new Set() })
      courseMap.get(code).programs.push({
        name: prog.name.split(' - ')[0],
        type: prog.type,
        intention: prog.intention,
      })
    }
    const rg = prog.requirementGroups
    if (rg) {
      const short = prog.name.split(' - ')[0]
      const clean = (s) => (s || '').replace(/:\s*$/, '').trim()
      for (const [kind, kindLabel] of [['completion', 'Completion'], ['enrolment', 'Enrolment']]) {
        let heading = ''
        for (const b of (rg[kind]?.blocks || [])) {
          if (b.heading) { heading = clean(b.lead || b.text); continue }
          const label = clean(b.lead) || heading || kindLabel
          for (const code of (b.codes || [])) {
            if (courseMap.has(code)) courseMap.get(code).reqLabels.add(short + ' · ' + label)
          }
        }
      }
    }
  }
  for (const code of extraCourses) {
    if (!courseMap.has(code)) {
      courseMap.set(code, { code, programs: [{ name: 'Added', type: '', added: true }], reqLabels: new Set(), added: true })
    } else {
      courseMap.get(code).added = true
    }
  }
  return [...courseMap.values()].sort((a, b) => a.code.localeCompare(b.code))
}

// UTM program-combination legality check.
// Returns { messages: string[], success: string }.
export function computeLegality(active) {
  if (!active.length) return { messages: [], success: '' }

  const messages = []
  const s = active.filter(p => (p.type || '').toLowerCase().includes('specialist'))
  const m = active.filter(p => (p.type || '').toLowerCase().includes('major'))
  const mi = active.filter(p => (p.type || '').toLowerCase().includes('minor'))

  const burden = s.length * 4 + m.length * 2 + mi.length * 1

  if (active.length > 3) messages.push(`⚠ ${active.length} active programs — UTM allows at most 3.`)
  if (burden < 4) messages.push('⚠ This selection isn\'t enough on its own — add a specialist, major, or more minors to form a complete degree.')
  if (!s.length && !m.length) messages.push("⚠ Minors alone won't satisfy a degree — add a specialist or major.")
  if (s.length > 1) messages.push(`⚠ ${s.length} specialists — UTM normally allows only 1.`)

  const areas = new Map()
  for (const p of active) {
    const area = p.name.split(' - ')[0] || p.name
    if (!areas.has(area)) areas.set(area, new Set())
    areas.get(area).add((p.type || '').toLowerCase())
  }
  for (const [area, types] of areas) {
    const count = [...types]
    if (count.length > 1) {
      const typeList = count.map(t => t.includes('specialist') ? 'Specialist' : t.includes('major') ? 'Major' : 'Minor').join(' + ')
      messages.push(`⚠ "${area}" has ${typeList} — cannot register multiple types in the same subject.`)
    }
  }

  if (messages.length) return { messages, success: '' }

  const nS = s.length, nM = m.length, nMi = mi.length
  let v = ''
  if (nS === 1 && nM === 0 && nMi <= 2) v = `1 specialist${nMi ? ' + ' + nMi + ' minor(s)' : ''} ✓`
  else if (nS === 0 && nM === 1 && nMi <= 2) v = `1 major${nMi ? ' + ' + nMi + ' minor(s)' : ''} ✓`
  else if (nS === 0 && nM === 2 && nMi <= 1) v = `2 majors${nMi ? ' + ' + nMi + ' minor(s)' : ''} ✓`
  else if (burden >= 4) v = 'Valid combination ✓'
  return { messages: [], success: v }
}

// Jaccard-overlap based program suggestions.
export function computeSuggestions(selectedPrograms, programs) {
  if (!selectedPrograms.length || !programs) return []

  const selectedIds = new Set(selectedPrograms.map(p => p.id))
  const mySet = new Set(selectedPrograms.flatMap(p => p.courses || []))

  const scores = []
  for (const sec of programs.sections) {
    for (const p of sec.programs) {
      if (selectedIds.has(p.id)) continue
      const pSet = new Set(p.courses || [])
      const inter = [...mySet].filter(c => pSet.has(c)).length
      const union = new Set([...mySet, ...pSet]).size
      if (inter < 2 || !union) continue
      scores.push({ id: p.id, name: p.name.split(' - ')[0], type: p.type, shared: inter, jaccard: inter / union })
    }
  }
  scores.sort((a, b) => b.shared - a.shared)
  const seen = new Set()
  return scores.filter(s => {
    const key = s.name.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, 8)
}

// Tokenise a prereq text into renderable segments (plain text + clickable codes).
export function prereqTokens(text, getStatus) {
  const tokens = []
  let last = 0
  const re = /([A-Z]{2,4}\d{3}[HY]\d)/g
  let m
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) tokens.push({ course: false, text: text.slice(last, m.index) })
    const code = m[1]
    const s = getStatus(code)
    const cls = s >= 3 ? 'prc prc-done' : s === 2 ? 'prc prc-taking' : s === 1 ? 'prc prc-planned' : 'prc'
    const next = s >= 2 ? 0 : 1
    const tip = s >= 3 ? 'Done — click to clear' : s === 2 ? 'Taking — click to clear' : s === 1 ? 'Planned — click to unplan' : 'Click to plan'
    tokens.push({ course: true, code, cls, next, tip })
    last = m.index + code.length
  }
  if (last < text.length) tokens.push({ course: false, text: text.slice(last) })
  return tokens
}

// Build the OR/AND requirement-line model used by the Requirements view.
export function buildReqLine(groups, isSatisfied) {
  const alts = groups.map(andGroup => {
    const done = andGroup.filter(c => isSatisfied(c)).length
    return { andGroup, done, total: andGroup.length, met: done === andGroup.length }
  })
  const anyMet = alts.some(a => a.met)
  const pool = alts.length >= 4
  let label = ''
  if (pool) {
    const metCount = alts.filter(a => a.met).length
    label = `${alts.length} options${metCount ? ' · ' + metCount + ' completed' : ''}`
  }
  return { alts, anyMet, pool, label }
}

// Whether a requirement block's courses are satisfied. Returns null for blocks
// with no course codes (headings / credit-only notes — no status icon shown).
//
// Credit-pool lines ("0.5 credit from A or B …", "1.0 credit from …") are met
// only when the SUM of actual credits of the satisfied courses reaches the
// stated amount (H = 0.5, Y = 1.0) — not merely when any one course is taken.
// Otherwise: "or" lines need any code; other lines need every code.
export function reqLineMet(block, isSatisfied) {
  const codes = block.codes || []
  if (!codes.length) return null
  const text = block.text || ''
  const m = text.match(/(\d+(?:\.\d+)?)\s*(?:additional\s+)?credits?\s+(?:from|of|in|at|toward)/i)
  if (m) {
    const need = parseFloat(m[1])
    const have = codes.filter(isSatisfied).reduce((n, c) => n + courseCredit(c), 0)
    return have >= need - 1e-9
  }
  return / or /i.test(text) ? codes.some(isSatisfied) : codes.every(isSatisfied)
}
