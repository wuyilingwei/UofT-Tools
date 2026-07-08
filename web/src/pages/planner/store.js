import { reactive, computed, watch } from 'vue'
import { buildCourseList, computeLegality, computeSuggestions, courseCredit, courseYear, computeDistribution } from './lib/courses.js'
import {
  buildScopes, rankedSchedules,
  buildCourseAvailability, badgeTerms,
  campusOf,
} from './lib/scheduling.js'

// Subject+number+weight key shared by a course's campus variants (CSC108H5 ↔
// CSC108H1 → 'CSC108H'); the trailing campus digit is what differs.
const baseCode = (code) => (code || '').replace(/(\d)$/, '')
// The "H1"/"Y1" campus suffix shown on a cross-campus pill.
const campusSuffix = (code) => (/[HY]\d$/.exec(code || '') || ['H5'])[0]

const BASE = ''
const LS_STATUS = 'utm_course_status'
const LS_PROGRAMS = 'utm_selected_programs'
const LS_COMPLETED = 'utm_completed'
const LS_EXTRA = 'utm_extra_courses'
const LS_SCHEDULE = 'utm_schedule'
const LS_TTB_WARNING = 'utm_ttb_warning_seen'

function saveSchedule() {
  try {
    localStorage.setItem(LS_SCHEDULE, JSON.stringify({
      scopeId: state.scopeId, scheduled: state.scheduled, prefs: state.prefs,
    }))
  } catch { /* ignore quota errors */ }
}
function loadSchedule() {
  try { return JSON.parse(localStorage.getItem(LS_SCHEDULE) || '{}') } catch { return {} }
}

function loadCourseStatus() {
  const obj = {}
  try {
    const m = JSON.parse(localStorage.getItem(LS_STATUS) || '{}')
    for (const [k, v] of Object.entries(m)) obj[k] = +v
    for (const c of JSON.parse(localStorage.getItem(LS_COMPLETED) || '[]')) {
      if (obj[c] === undefined) obj[c] = 3
    }
  } catch {
    /* ignore malformed storage */
  }
  return obj
}

export const state = reactive({
  programs: null,
  courses: null,
  sessions: [],
  timetable: null,
  timetableSession: null,

  activeTab: 'planner',          // 'planner' | 'schedule'
  viewMode: 'list',              // 'list' | 'requirements'

  sectionFilter: '',
  activeSectionSlug: null,
  popupOpen: false,
  popupTop: 0,

  selectedPrograms: [],          // [{id,name,type,courses,requirementGroups,intention}]
  extraCourses: [],              // course codes added outside any program (6.1)
  courseStatus: loadCourseStatus(),  // { code: 0|1|2|3 }

  // commute: cross-campus buffer between back-to-back classes on different
  // campuses (St. George/UTM/UTSC). enabled by default at 1 hour; hours ∈ {0,1,2}.
  prefs: { density: 'any', time: 'any', freeDays: [], busyDays: [], zzOverlap: true, zzWithReg: false, commute: { enabled: true, hours: 1 } },
  scopeId: '',                 // selected scheduling scope (see lib/scheduling buildScopes)
  timetables: {},              // sessionValue → timetable data (lazy cache)
  scheduled: {},               // code → [termValue,…] : which segment(s) to schedule per course
  board: [],                   // [{value,label,results,published}] — your schedule per term
  altIndex: {},                // termValue → which ranked alternative is shown
  // Group scheduling: each friend is just a list of courses; whichever ones you
  // also take become shared (same sections), the rest only constrain feasibility.
  friends: { enabled: false, list: [] },   // list: [{ id, name, courses: [] }]
  schedNotice: '',
  ttbWarningOpen: false,
})

// Schedule Builder's timetable data comes from ttb.utoronto.ca (the university's
// own public tool) rather than ACORN, for compliance reasons — but the two have
// been observed to disagree for reasons we haven't been able to pin down. Nag
// the user once, the first time they open the Schedule Builder tab.
export function maybeShowTtbWarning() {
  try {
    if (localStorage.getItem(LS_TTB_WARNING)) return
  } catch { /* ignore */ }
  state.ttbWarningOpen = true
}

export function dismissTtbWarning() {
  state.ttbWarningOpen = false
  try { localStorage.setItem(LS_TTB_WARNING, '1') } catch { /* ignore quota errors */ }
}

// ── Derived state (reactive) ──
export const courseList = computed(() => buildCourseList(state.selectedPrograms, state.extraCourses))
export const activePrograms = computed(() => state.selectedPrograms.filter(p => !p.intention))
export const legality = computed(() => computeLegality(activePrograms.value))

// Counts of active programs by type (Specialist / Major / Minor).
export const programCounts = computed(() => {
  const a = activePrograms.value
  const has = (p, t) => (p.type || '').toLowerCase().includes(t)
  return {
    specialist: a.filter(p => has(p, 'specialist')).length,
    major: a.filter(p => has(p, 'major')).length,
    minor: a.filter(p => has(p, 'minor')).length,
  }
})
export const suggestions = computed(() => computeSuggestions(state.selectedPrograms, state.programs))
export const filteredSections = computed(() => {
  if (!state.programs) return []
  const f = state.sectionFilter.toLowerCase()
  return state.programs.sections.filter(s =>
    !f || (s.name || '').toLowerCase().includes(f) || s.slug.toLowerCase().includes(f),
  )
})
export const popupSection = computed(() =>
  state.programs?.sections.find(s => s.slug === state.activeSectionSlug) || null,
)
// Only courses explicitly marked "Plan" (status 1) are schedulable / shown on the board.
export const pendingCourses = computed(() => courseList.value.filter(c => getStatus(c.code) === 1))

// Codes that belong to a selected program (used to tell apart "outside" courses).
export const programCourseCodes = computed(() => {
  const s = new Set()
  for (const p of state.selectedPrograms) for (const c of (p.courses || [])) s.add(c)
  return s
})

// Courses marked Plan/Taking/Done that aren't part of any selected program —
// always shown (locked) in the picker so the student doesn't lose track of them.
export const lockedExtraCourses = computed(() => {
  const inProg = programCourseCodes.value
  return Object.keys(state.courseStatus)
    .filter(c => state.courseStatus[c] >= 1 && !inProg.has(c))
    .sort()
})

// UTM degree progress (total credits + Sci/SSc/Hum distribution) over every
// course the student has marked Plan/Taking/Done.
export const degreeProgress = computed(() => {
  const codes = Object.keys(state.courseStatus).filter(c => state.courseStatus[c] >= 1)
  const dist = computeDistribution(codes, courseCredit, c => state.courses?.[c]?.distribution || '')
  let upper = 0
  let upper2 = 0
  for (const code of codes) {
    const y = courseYear(code) || 0
    if (y >= 2) upper2 += courseCredit(code)
    if (y >= 3) upper += courseCredit(code)
  }
  return { ...dist, upper, upper2 }
})

// Same as degreeProgress but only counts completed/in-progress courses (status >= 2).
export const degreeProgressActual = computed(() => {
  const codes = Object.keys(state.courseStatus).filter(c => state.courseStatus[c] >= 2)
  const dist = computeDistribution(codes, courseCredit, c => state.courses?.[c]?.distribution || '')
  let upper = 0
  let upper2 = 0
  for (const code of codes) {
    const y = courseYear(code) || 0
    if (y >= 2) upper2 += courseCredit(code)
    if (y >= 3) upper += courseCredit(code)
  }
  return { ...dist, upper, upper2 }
})

// Per-status credit breakdown: plan (1) / taking (2) / done (3) / all.
export const degreeBreakdown = computed(() => {
  const byStatus = { 1: [], 2: [], 3: [] }
  for (const [code, status] of Object.entries(state.courseStatus)) {
    if (status >= 1 && status <= 3) byStatus[status].push(code)
  }
  const compute = (codes) => {
    const dist = computeDistribution(codes, courseCredit, c => state.courses?.[c]?.distribution || '')
    let upper = 0
    let upper2 = 0
    for (const code of codes) {
      const y = courseYear(code) || 0
      if (y >= 2) upper2 += courseCredit(code)
      if (y >= 3) upper += courseCredit(code)
    }
    return { total: dist.total, upper, upper2, cats: dist.cats, satisfied: dist.satisfied }
  }
  return {
    planned: compute(byStatus[1]),
    taking: compute(byStatus[2]),
    done: compute(byStatus[3]),
    all: compute([...byStatus[1], ...byStatus[2], ...byStatus[3]]),
  }
})

// ── Scheduling scopes / availability ──
export const scopes = computed(() => buildScopes(state.sessions))
export const currentScope = computed(() => scopes.value.find(s => s.id === state.scopeId) || null)

// code → [term labels it is offered in] for the selected scope (after its
// timetables are loaded). Lets the picker show availability before scheduling.
export const availability = computed(() => {
  const scope = currentScope.value
  return scope ? buildCourseAvailability(badgeTerms(scope), state.timetables) : {}
})

// Per-course term offerings in the current scope → the pills shown in the picker.
//   { code: [{ value, label, tba }, …] }  tba = offered but no meeting times yet.
export const courseOfferings = computed(() => {
  const scope = currentScope.value
  if (!scope) return {}
  // 1) Every offered code → its own per-term availability.
  const raw = {}
  for (const term of badgeTerms(scope)) {
    const tt = state.timetables[term.value]
    if (!tt || !tt.courses) continue
    for (const c of tt.courses) {
      if (!raw[c.code]) raw[c.code] = []
      if (raw[c.code].some(t => t.value === term.value)) continue
      const timed = (c.sections || []).some(s => (s.times || []).some(t => t.day >= 1 && t.day <= 5 && t.endMs > t.startMs))
      raw[c.code].push({ value: term.value, label: term.label, tba: !timed })
    }
  }
  // 2) Index codes by their cross-campus base so a UTM course can find its
  //    St. George (H1) twin.
  const byBase = {}
  for (const code of Object.keys(raw)) (byBase[baseCode(code)] = byBase[baseCode(code)] || []).push(code)
  // 3) Each UTM (campus 5) course shows its own pills plus an extra pill per
  //    term for any same-named course offered on another campus, labelled with
  //    that campus suffix (e.g. "Fall H1"). Each pill carries the code it adds.
  const map = {}
  for (const code of Object.keys(raw)) {
    if (campusOf(code) !== '5') continue
    const pills = raw[code].map(p => ({ ...p, code, campus: '5' }))
    for (const sib of (byBase[baseCode(code)] || [])) {
      if (sib === code || campusOf(sib) === '5') continue
      for (const p of raw[sib]) {
        pills.push({ value: p.value, label: `${p.label} ${campusSuffix(sib)}`, tba: p.tba, code: sib, campus: campusOf(sib) })
      }
    }
    map[code] = pills
  }
  return map
})

// Codes scheduled in at least one segment.
export const scheduledCodes = computed(() =>
  Object.keys(state.scheduled).filter(c => (state.scheduled[c] || []).length),
)

// Whether any timetable in the current scope is published yet — lets the picker
// distinguish "not offered in this range" from "timetable not published yet".
export const scopePublished = computed(() => {
  const scope = currentScope.value
  if (!scope) return false
  return badgeTerms(scope).some(t => (state.timetables[t.value]?.courseCount || 0) > 0)
})

export const scheduleSelection = computed(() => ({
  scheduled: JSON.parse(JSON.stringify(state.scheduled)),
  friendsEnabled: state.friends.enabled,
  friends: state.friends.list.map(f => ({ name: f.name, courses: [...f.courses] })),
  scopeId: state.scopeId,
  prefs: prefsObj(),
}))

// Warnings about the ACTUAL scheduled board only — never about courses you
// haven't scheduled. { type: 'conflict'|'missing'|'tba', code, term? }
export const scheduleWarnings = computed(() => {
  const out = []
  const seen = { conflict: new Set(), missing: new Set(), tba: new Set(), friend: new Set() }
  const add = (type, code, term) => {
    if (seen[type].has(code)) return
    seen[type].add(code)
    out.push({ type, code, term })
  }
  for (const term of state.board) {
    for (const r of term.results) {
      if (r.missing) add('missing', r.code, term.label)
      else if (r.conflict) add('conflict', r.code)
    }
    for (const code of (term.tba || [])) add('tba', code, term.label)
    for (const name of (term.infeasibleFriends || [])) add('friend', name, term.label)
  }
  return out
})
export const courseAvailability = availability

// ── Status helpers ──
export function getStatus(code) { return state.courseStatus[code] || 0 }
export function isDone(code) { return getStatus(code) === 3 }
export function isSatisfied(code) { return getStatus(code) >= 1 }

export function setCourseStatus(code, status) {
  if (status === 0) delete state.courseStatus[code]
  else state.courseStatus[code] = status
  savePlannerState()
}

// ── Persistence ──
export function savePlannerState() {
  localStorage.setItem(LS_STATUS, JSON.stringify({ ...state.courseStatus }))
  localStorage.setItem(LS_PROGRAMS, JSON.stringify(
    state.selectedPrograms.map(p => ({ id: p.id, intention: !!p.intention })),
  ))
  localStorage.setItem(LS_EXTRA, JSON.stringify(state.extraCourses))
}

export function loadSavedPlanner() {
  const saved = JSON.parse(localStorage.getItem(LS_PROGRAMS) || '[]')
  state.selectedPrograms = []
  for (const s of saved) {
    const p = findProgramById(s.id)
    if (p) state.selectedPrograms.push({ ...p, intention: !!s.intention })
  }
  try {
    state.extraCourses = JSON.parse(localStorage.getItem(LS_EXTRA) || '[]')
  } catch { state.extraCourses = [] }
}

const COURSE_CODE_RE = /^[A-Z]{2,4}\d{3}[HY]\d$/

export function isValidCourseCode(code) {
  return COURSE_CODE_RE.test((code || '').toUpperCase().replace(/\s+/g, ''))
}

export function addExtraCourse(code) {
  const c = (code || '').toUpperCase().replace(/\s+/g, '')
  if (!isValidCourseCode(c)) return false
  if (!state.extraCourses.includes(c)) { state.extraCourses.push(c); savePlannerState() }
  return true
}

export function removeExtraCourse(code) {
  state.extraCourses = state.extraCourses.filter(x => x !== code)
  savePlannerState()
}

// ── Program selection ──
export function findProgramById(id) {
  for (const sec of state.programs?.sections || []) {
    const p = sec.programs.find(p => p.id === id)
    if (p) return p
  }
  return null
}

export function toggleProgram(id) {
  const idx = state.selectedPrograms.findIndex(p => p.id === id)
  if (idx >= 0) {
    state.selectedPrograms.splice(idx, 1)
  } else {
    const prog = findProgramById(id)
    if (prog) state.selectedPrograms.push({ ...prog, intention: false })
  }
  savePlannerState()
}

export function toggleIntention(id) {
  const p = state.selectedPrograms.find(p => p.id === id)
  if (p) { p.intention = !p.intention; savePlannerState() }
}

export function addSuggested(id) {
  const prog = findProgramById(id)
  if (prog && !state.selectedPrograms.find(p => p.id === id)) {
    state.selectedPrograms.push({ ...prog, intention: false })
    savePlannerState()
  }
}

export function selectSection(slug, top) {
  state.activeSectionSlug = slug
  if (top != null) state.popupTop = top
  state.popupOpen = true
}

export function closePopup() { state.popupOpen = false }

// ── Import ──
export function applyImported(data) {
  if (data.courseStatus) {
    const obj = {}
    for (const [k, v] of Object.entries(data.courseStatus)) obj[k] = +v
    state.courseStatus = obj
    localStorage.setItem(LS_STATUS, JSON.stringify(data.courseStatus))
  }
  if (data.selectedPrograms && state.programs) {
    state.selectedPrograms = []
    for (const s of data.selectedPrograms) {
      const p = findProgramById(s.id)
      if (p) state.selectedPrograms.push({ ...p, intention: !!s.intention })
    }
  }
  savePlannerState()
}

// ── Schedule ──
export function isScheduledIn(code, termValue) {
  return (state.scheduled[code] || []).includes(termValue)
}

// Toggle scheduling a course in one term segment (a pill in the picker).
export function toggleScheduledTerm(code, termValue) {
  const cur = state.scheduled[code] || []
  if (cur.includes(termValue)) {
    const next = cur.filter(v => v !== termValue)
    if (next.length) state.scheduled[code] = next
    else delete state.scheduled[code]
  } else {
    state.scheduled[code] = [...cur, termValue]
  }
  queueScheduleRefresh()
}

// Prune deselected/completed courses; called when entering the schedule tab.
// Term-segment choices are kept (a course may be scheduled under another scope).
export function syncScheduledCourses() {
  const pending = new Set(pendingCourses.value.map(p => p.code))
  const pendingBase = new Set(pendingCourses.value.map(p => baseCode(p.code)))
  for (const code of Object.keys(state.scheduled)) {
    if (pending.has(code)) continue
    // Keep a cross-campus (e.g. H1) pick while its same-named UTM course stays planned.
    if (campusOf(code) !== '5' && pendingBase.has(baseCode(code))) continue
    delete state.scheduled[code]
  }
  queueScheduleRefresh()
}

async function ensureTimetable(value) {
  if (state.timetables[value]) return state.timetables[value]
  const fetchJson = (file) => fetch(BASE + `/planner/data/${file}`).then(r => r.ok ? r.json() : null).catch(() => null)
  // UTM is the primary timetable; St. George (H1) same-named courses are merged
  // in so they can be scheduled as extra cross-campus pills. They share the
  // university-wide session codes, so the files line up 1:1.
  const [utm, stg] = await Promise.all([
    fetchJson(`utm-timetable-${value}.json`),
    fetchJson(`stg-timetable-${value}.json`),
  ])
  const base = utm || { courses: [], courseCount: 0 }
  const data = { ...base, courses: [...(base.courses || []), ...((stg && stg.courses) || [])] }
  state.timetables[value] = data
  queueScheduleRefresh()
  return data
}

async function ensureScopeTimetables() {
  const scope = currentScope.value
  if (!scope) return
  const values = scope.terms.map(t => t.value)
  if (scope.full) values.push(scope.full.value)
  await Promise.all(values.map(ensureTimetable))
}

// A column's effective timetable = its own courses plus the full-session (Y)
// courses, which are shown in BOTH columns rather than a standalone table.
function mergedColumnTimetable(scope, term) {
  const tt = state.timetables[term.value] || { courses: [], courseCount: 0 }
  const fullTT = scope.full ? (state.timetables[scope.full.value] || { courses: [], courseCount: 0 }) : null
  if (!fullTT) return tt
  return {
    courses: [...(tt.courses || []), ...(fullTT.courses || [])],
    courseCount: (tt.courseCount || 0) + (fullTT.courseCount || 0),
  }
}

export async function onScopeChange() {
  state.scheduled = {}   // switching range clears all segment selections
  state.altIndex = {}
  state.board = []
  state.schedNotice = 'Loading timetable…'
  await ensureScopeTimetables()
  queueScheduleRefresh()
}

function prefsObj() {
  return {
    density: state.prefs.density,
    time: state.prefs.time,
    freeDays: state.prefs.freeDays.map(Number),
    busyDays: state.prefs.busyDays.map(Number),
    zzOverlap: state.prefs.zzOverlap,
    zzWithReg: state.prefs.zzWithReg,
    commute: { enabled: state.prefs.commute?.enabled !== false, hours: Number(state.prefs.commute?.hours) || 0 },
  }
}

// Day preference per weekday (Mon–Fri), cycling neutral → free → busy → neutral.
export function dayPref(d) {
  if (state.prefs.freeDays.includes(d)) return 'free'
  if (state.prefs.busyDays.includes(d)) return 'busy'
  return 'neutral'
}
export function cycleDayPref(d) {
  const cur = dayPref(d)
  state.prefs.freeDays = state.prefs.freeDays.filter(x => x !== d)
  state.prefs.busyDays = state.prefs.busyDays.filter(x => x !== d)
  if (cur === 'neutral') state.prefs.freeDays = [...state.prefs.freeDays, d]
  else if (cur === 'free') state.prefs.busyDays = [...state.prefs.busyDays, d]
  queueScheduleRefresh()
}

// Build the per-term schedule from the per-segment selection (state.scheduled).
// Cached ranked alternatives per column (recomputed only on selection/pref change).
let optionsCache = {}

function columnCodes(scope, term, fullCodes, fullVal) {
  const tt = mergedColumnTimetable(scope, term)
  const offered = new Set((tt.courses || []).map(c => c.code))
  return [...offered].filter(code => {
    const sel = state.scheduled[code] || []
    return sel.includes(term.value) || (fullCodes.has(code) && fullVal && sel.includes(fullVal))
  })
}

// Enumerate + rank every column's possible schedules; reset which alternative is shown.
function computeOptions(scope) {
  const fullCodes = new Set((scope.full ? (state.timetables[scope.full.value]?.courses || []) : []).map(c => c.code))
  const fullVal = scope.full?.value
  const friends = state.friends.enabled
    ? state.friends.list.filter(f => f.courses.length).map(f => ({ name: f.name, courses: [...f.courses] }))
    : []
  optionsCache = {}
  state.altIndex = {}
  for (const term of scope.terms) {
    const tt = mergedColumnTimetable(scope, term)
    const inTerm = columnCodes(scope, term, fullCodes, fullVal)
    optionsCache[term.value] = inTerm.length
      ? rankedSchedules(tt, inTerm, prefsObj(), friends)
      : [{ results: [], conflicts: 0, score: 0, infeasibleFriends: [] }]
  }
}

// Render the board from the cached options at the currently-selected alternative.
function renderSoloBoard(scope) {
  const fullCodes = new Set((scope.full ? (state.timetables[scope.full.value]?.courses || []) : []).map(c => c.code))
  state.board = scope.terms.map(term => {
    const tt = mergedColumnTimetable(scope, term)
    const options = optionsCache[term.value] || [{ results: [], conflicts: 0 }]
    const i = Math.min(Math.max(state.altIndex[term.value] || 0, 0), options.length - 1)
    const chosen = options[i] || options[0] || { results: [], conflicts: 0 }
    chosen.results.forEach(r => { if (fullCodes.has(r.code)) r.full = true })
    const tba = chosen.results.filter(r => !r.missing && !hasRenderableTimes(r)).map(r => r.code)
    return {
      value: term.value, label: term.label, results: chosen.results,
      published: (tt.courseCount || 0) > 0, tba,
      optionIndex: i, optionCount: options.length, conflicts: chosen.conflicts || 0,
      infeasibleFriends: chosen.infeasibleFriends || [],
    }
  })
}

// Step through the ranked alternatives for one column (no recompute).
export function setAlt(termValue, i) {
  const opts = optionsCache[termValue]
  if (!opts) return
  state.altIndex[termValue] = Math.min(Math.max(i, 0), opts.length - 1)
  const scope = currentScope.value
  if (scope) renderSoloBoard(scope)
}

// A scheduled result is renderable only if some section has a weekday meeting time.
function hasRenderableTimes(r) {
  return (r.sections || []).some(s => (s.times || []).some(t => t.day >= 1 && t.day <= 5 && t.endMs > t.startMs))
}

let refreshTimer = null
let refreshRun = 0

export function queueScheduleRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => { refreshSchedule() }, 100)
}

export async function refreshSchedule() {
  const run = ++refreshRun
  const scope = currentScope.value
  if (!scope) { state.schedNotice = 'Please select a scheduling range.'; return }
  if (!scheduledCodes.value.length) {
    state.board = []
    state.schedNotice = 'Pick a term segment for a course to preview a schedule.'
    return
  }

  state.schedNotice = 'Loading timetable…'
  await ensureScopeTimetables()
  if (run !== refreshRun) return

  computeOptions(scope)
  renderSoloBoard(scope)

  const unpublished = state.board.some(t => !t.published)
  state.schedNotice = unpublished ? 'One or more terms have no published timetable yet.' : ''
}

export const generateSchedule = refreshSchedule

// ── Friend group scheduling ──
let friendSeq = 0

export function toggleFriends(on) {
  state.friends.enabled = on
  if (on && !state.friends.list.length) addFriend()
  queueScheduleRefresh()
}

export function addFriend() {
  const id = ++friendSeq
  state.friends.list.push({ id, name: `Friend ${state.friends.list.length + 1}`, courses: [] })
  return id
}

export function removeFriend(id) {
  state.friends.list = state.friends.list.filter(f => f.id !== id)
  queueScheduleRefresh()
}

export function renameFriend(id, name) {
  const f = state.friends.list.find(f => f.id === id)
  if (f && (name || '').trim()) f.name = name.trim()
}

export function addFriendCourse(id, code) {
  const f = state.friends.list.find(f => f.id === id)
  if (!f) return false
  const c = (code || '').toUpperCase().replace(/\s+/g, '')
  if (!isValidCourseCode(c)) return false
  if (!f.courses.includes(c)) f.courses.push(c)
  queueScheduleRefresh()
  return true
}

export function removeFriendCourse(id, code) {
  const f = state.friends.list.find(f => f.id === id)
  if (!f) return
  f.courses = f.courses.filter(x => x !== code)
  queueScheduleRefresh()
}

watch(scheduleSelection, () => {
  saveSchedule()
  queueScheduleRefresh()
}, { deep: true })

// ── Init ──
export async function init() {
  const [progs, sess] = await Promise.all([
    fetch(BASE + '/planner/data/utm-programs.json').then(r => r.json()),
    fetch(BASE + '/planner/data/utm-sessions.json').then(r => r.json()),
  ])
  state.programs = progs
  state.sessions = sess
  loadSavedPlanner()
  const sc = buildScopes(sess)
  // Restore the saved scheduling range + segment selections + preferences.
  const saved = loadSchedule()
  if (saved.prefs && typeof saved.prefs === 'object') Object.assign(state.prefs, saved.prefs)
  const validScope = saved.scopeId && sc.find(s => s.id === saved.scopeId)
  state.scopeId = validScope ? saved.scopeId : (sc.length ? sc[0].id : '')
  if (validScope && saved.scheduled && typeof saved.scheduled === 'object') state.scheduled = saved.scheduled
  if (state.scopeId) { await ensureScopeTimetables(); queueScheduleRefresh() }

  // Background, non-blocking: prereq/exclusion metadata.
  fetch(BASE + '/planner/data/utm-courses.json')
    .then(r => r.ok ? r.json() : null)
    .then(data => { if (data) state.courses = data })
    .catch(() => {})
}
