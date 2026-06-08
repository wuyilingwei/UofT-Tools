import { reactive, computed } from 'vue'
import { buildCourseList, computeLegality, computeSuggestions } from './lib/courses.js'
import { buildSchedule } from './lib/scheduling.js'

const BASE = ''
const LS_STATUS = 'utm_course_status'
const LS_PROGRAMS = 'utm_selected_programs'
const LS_COMPLETED = 'utm_completed'

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
  courseStatus: loadCourseStatus(),  // { code: 0|1|2|3 }

  prefs: { density: 'compact', time: 'any', freeDays: [], busyDays: [] },
  sessionValue: '',
  scheduledCourses: [],
  scheduleResult: [],
  schedNotice: '',
})

// ── Derived state (reactive) ──
export const courseList = computed(() => buildCourseList(state.selectedPrograms))
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
export const pendingCourses = computed(() => courseList.value.filter(c => !isDone(c.code)))

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
}

export function loadSavedPlanner() {
  const saved = JSON.parse(localStorage.getItem(LS_PROGRAMS) || '[]')
  state.selectedPrograms = []
  for (const s of saved) {
    const p = findProgramById(s.id)
    if (p) state.selectedPrograms.push({ ...p, intention: !!s.intention })
  }
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
export function onSessionChange() {
  state.timetable = null
  state.timetableSession = null
}

export function toggleScheduledCourse(code, checked) {
  if (checked) {
    if (!state.scheduledCourses.includes(code)) state.scheduledCourses.push(code)
  } else {
    state.scheduledCourses = state.scheduledCourses.filter(c => c !== code)
  }
}

// Prune deselected/completed courses; called when entering the schedule tab.
export function syncScheduledCourses() {
  const pending = pendingCourses.value
  state.scheduledCourses = state.scheduledCourses.filter(c => pending.find(p => p.code === c))
}

async function loadTimetable(session) {
  if (state.timetableSession === session && state.timetable) return state.timetable
  const data = await fetch(BASE + `/planner/data/utm-timetable-${session}.json`).then(r => r.json())
  state.timetable = data
  state.timetableSession = session
  return data
}

export async function generateSchedule() {
  const session = state.sessionValue
  if (!session) { state.schedNotice = 'Please select a session.'; return }
  if (!state.scheduledCourses.length) { state.schedNotice = 'Select at least one course to schedule.'; return }

  state.schedNotice = 'Loading timetable…'
  const tt = await loadTimetable(session)
  if (!tt.courseCount) {
    state.schedNotice = 'Timetable not yet published for this session.'
    state.scheduleResult = []
    return
  }

  const results = buildSchedule(tt, state.scheduledCourses, {
    density: state.prefs.density,
    time: state.prefs.time,
    freeDays: state.prefs.freeDays.map(Number),
    busyDays: state.prefs.busyDays.map(Number),
  })
  state.scheduleResult = results

  const missing = results.filter(r => r.missing).length
  const conflicts = results.filter(r => r.conflict).length
  state.schedNotice = missing ? `⚠ ${missing} course(s) not found in this session's timetable.`
    : conflicts ? `⚠ ${conflicts} time conflict(s) detected.`
      : `✓ Schedule generated for ${results.length} course(s).`
}

// ── Init ──
export async function init() {
  const [progs, sess] = await Promise.all([
    fetch(BASE + '/planner/data/utm-programs.json').then(r => r.json()),
    fetch(BASE + '/planner/data/utm-sessions.json').then(r => r.json()),
  ])
  state.programs = progs
  state.sessions = sess
  loadSavedPlanner()
  const available = sess.filter(s => s.value)
  if (available.length) state.sessionValue = available[0].value

  // Background, non-blocking: prereq/exclusion metadata.
  fetch(BASE + '/planner/data/utm-courses.json')
    .then(r => r.ok ? r.json() : null)
    .then(data => { if (data) state.courses = data })
    .catch(() => {})
}
