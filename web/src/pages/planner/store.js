import { reactive, computed, watch } from 'vue'
import { buildCourseList, computeLegality, computeSuggestions, courseCredit, computeDistribution } from './lib/courses.js'
import {
  buildSchedule, buildScopes, buildPairSchedule,
  buildCourseAvailability, badgeTerms,
} from './lib/scheduling.js'

const BASE = ''
const LS_STATUS = 'utm_course_status'
const LS_PROGRAMS = 'utm_selected_programs'
const LS_COMPLETED = 'utm_completed'
const LS_EXTRA = 'utm_extra_courses'

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

  prefs: { density: 'compact', time: 'any', freeDays: [], busyDays: [], zzOverlap: true, zzWithReg: false },
  scopeId: '',                 // selected scheduling scope (see lib/scheduling buildScopes)
  timetables: {},              // sessionValue → timetable data (lazy cache)
  scheduled: {},               // code → [termValue,…] : which segment(s) to schedule per course
  board: [],                   // [{value,label,results,published}] — your schedule per term
  friend: { enabled: false, courses: [] },  // friend co-scheduling (Phase E)
  friendBoard: [],             // friend's schedule per term
  scheduleView: 'you',         // 'you' | 'friend'
  schedNotice: '',
})

// ── Derived state (reactive) ──
export const courseList = computed(() => buildCourseList(state.selectedPrograms, state.extraCourses))
export const activePrograms = computed(() => state.selectedPrograms.filter(p => !p.intention))
export const legality = computed(() => computeLegality(activePrograms.value))
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
  return computeDistribution(codes, courseCredit, c => state.courses?.[c]?.distribution || '')
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

// Codes offered in the current scope but with NO weekday meeting time in any of
// its timetables (TBA) — surfaced as a badge in the picker rather than a board note.
export const tbaCourses = computed(() => {
  const scope = currentScope.value
  if (!scope) return new Set()
  const timed = new Map()  // code → has any meeting time across the scope
  for (const term of badgeTerms(scope)) {
    const tt = state.timetables[term.value]
    if (!tt || !tt.courses) continue
    for (const c of tt.courses) {
      const has = (c.sections || []).some(s => (s.times || []).some(t => t.day >= 1 && t.day <= 5 && t.endMs > t.startMs))
      timed.set(c.code, (timed.get(c.code) || false) || has)
    }
  }
  const out = new Set()
  for (const [code, has] of timed) if (!has) out.add(code)
  return out
})

// Per-course term offerings in the current scope → the pills shown in the picker.
//   { code: [{ value, label }, …] }
export const courseOfferings = computed(() => {
  const scope = currentScope.value
  if (!scope) return {}
  const map = {}
  for (const term of badgeTerms(scope)) {
    const tt = state.timetables[term.value]
    if (!tt || !tt.courses) continue
    for (const c of tt.courses) {
      if (!map[c.code]) map[c.code] = []
      if (!map[c.code].some(t => t.value === term.value)) map[c.code].push({ value: term.value, label: term.label })
    }
  }
  return map
})

// Codes scheduled in at least one segment.
export const scheduledCodes = computed(() =>
  Object.keys(state.scheduled).filter(c => (state.scheduled[c] || []).length),
)

export const scheduleSelection = computed(() => ({
  scheduled: JSON.parse(JSON.stringify(state.scheduled)),
  friendEnabled: state.friend.enabled,
  friendCourses: [...state.friend.courses],
  scopeId: state.scopeId,
  prefs: prefsObj(),
}))

// Warnings about the ACTUAL scheduled board only — never about courses you
// haven't scheduled. { type: 'conflict'|'missing'|'tba', code, term? }
export const scheduleWarnings = computed(() => {
  const out = []
  const seen = { conflict: new Set(), missing: new Set(), tba: new Set() }
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
  for (const code of Object.keys(state.scheduled)) {
    if (!pending.has(code)) delete state.scheduled[code]
  }
  queueScheduleRefresh()
}

async function ensureTimetable(value) {
  if (state.timetables[value]) return state.timetables[value]
  let data
  try {
    data = await fetch(BASE + `/planner/data/utm-timetable-${value}.json`).then(r => r.json())
  } catch { data = { courses: [], courseCount: 0 } }
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
  state.board = []
  state.friendBoard = []
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
// A course lands in a column when its pill for that column is on, or when its
// full-session pill is on (a Y course spans both columns).
function scheduleScope(scope) {
  const fullTT = scope.full ? state.timetables[scope.full.value] : null
  const fullCodes = new Set((fullTT?.courses || []).map(c => c.code))
  const fullVal = scope.full?.value
  return scope.terms.map(term => {
    const tt = mergedColumnTimetable(scope, term)
    const offered = new Set((tt.courses || []).map(c => c.code))
    const inTerm = [...offered].filter(code => {
      const sel = state.scheduled[code] || []
      return sel.includes(term.value) || (fullCodes.has(code) && fullVal && sel.includes(fullVal))
    })
    const results = inTerm.length ? buildSchedule(tt, inTerm, prefsObj()) : []
    results.forEach(r => { if (fullCodes.has(r.code)) r.full = true })
    // Offered but with no published meeting times → won't draw on the grid.
    const tba = results.filter(r => !r.missing && !hasRenderableTimes(r)).map(r => r.code)
    return { value: term.value, label: term.label, results, published: (tt.courseCount || 0) > 0, tba }
  })
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
  const friendOn = state.friend.enabled && state.friend.courses.length
  if (!scheduledCodes.value.length && !friendOn) {
    state.board = []
    state.friendBoard = []
    state.schedNotice = 'Pick a term segment for a course to preview a schedule.'
    return
  }

  state.schedNotice = 'Loading timetable…'
  await ensureScopeTimetables()
  if (run !== refreshRun) return

  if (friendOn) {
    buildPairBoards(scope)
  } else {
    state.board = scheduleScope(scope)
    state.friendBoard = []
    state.scheduleView = 'you'
  }

  const unpublished = state.board.some(t => !t.published)
  state.schedNotice = unpublished ? 'One or more terms have no published timetable yet.' : 'Schedule updated.'
}

export const generateSchedule = refreshSchedule

// ── Friend co-scheduling (Phase E) ──
export function toggleFriend(on) {
  state.friend.enabled = on
  if (!on) {
    state.friend.courses = []
    state.friendBoard = []
    state.scheduleView = 'you'
  }
  queueScheduleRefresh()
}

export function addFriendCourse(code) {
  const c = (code || '').toUpperCase().replace(/\s+/g, '')
  if (!isValidCourseCode(c)) return false
  if (!state.friend.courses.includes(c)) state.friend.courses.push(c)
  queueScheduleRefresh()
  return true
}

export function removeFriendCourse(code) {
  state.friend.courses = state.friend.courses.filter(x => x !== code)
  queueScheduleRefresh()
}

function buildPairBoards(scope) {
  const fullTT = scope.full ? state.timetables[scope.full.value] : null
  const fullCodes = new Set((fullTT?.courses || []).map(c => c.code))
  const fullVal = scope.full?.value
  const friendSolo = state.friend.courses.filter(c => !scheduledCodes.value.includes(c))
  const you = []
  const friend = []
  for (const term of scope.terms) {
    const tt = mergedColumnTimetable(scope, term)
    // Your courses scheduled in THIS column (per-segment pills).
    const yourCodes = scheduledCodes.value.filter(code => {
      const sel = state.scheduled[code] || []
      return sel.includes(term.value) || (fullCodes.has(code) && fullVal && sel.includes(fullVal))
    })
    const shared = yourCodes.filter(c => state.friend.courses.includes(c))
    const yourSolo = yourCodes.filter(c => !shared.includes(c))
    const pair = buildPairSchedule(tt, shared, yourSolo, friendSolo, prefsObj())
    const published = (tt.courseCount || 0) > 0
    const tbaYou = pair.you.filter(r => !r.missing && !hasRenderableTimes(r)).map(r => r.code)
    const tbaFriend = pair.friend.filter(r => !r.missing && !hasRenderableTimes(r)).map(r => r.code)
    you.push({ value: term.value, label: term.label, results: pair.you, published, tba: tbaYou })
    friend.push({ value: term.value, label: term.label, results: pair.friend, published, tba: tbaFriend })
  }
  state.board = you
  state.friendBoard = friend
}

watch(scheduleSelection, () => {
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
  if (sc.length) { state.scopeId = sc[0].id; onScopeChange() }

  // Background, non-blocking: prereq/exclusion metadata.
  fetch(BASE + '/planner/data/utm-courses.json')
    .then(r => r.ok ? r.json() : null)
    .then(data => { if (data) state.courses = data })
    .catch(() => {})
}
