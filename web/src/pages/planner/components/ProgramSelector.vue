<script setup>
import { ref, computed } from 'vue'
import { state, legality, degreeProgress, degreeProgressActual, degreeBreakdown, programCounts, activePrograms, toggleProgram, toggleIntention, applyImported } from '../store.js'
import { chipClass } from '../lib/courses.js'
import { exportPlanner, importPlanner } from '../lib/dataio.js'
import CoursePicker from './CoursePicker.vue'

const shortName = (p) => p.name.split(' - ')[0] || p.name
const chipTitle = (p) => p.intention ? 'Intention (planning)' : p.type + ' — ' + (p.code || '')

const comboValid = computed(() => activePrograms.value.length > 0 && legality.value.messages.length === 0)

const degreeTarget = ref('honours')

// Projected graduation outlook from the marked courses + valid program combination.
const outlookDone = computed(() => {
  const b = degreeBreakdown.value.done
  const valid = activePrograms.value.length > 0 && legality.value.messages.length === 0
  const distOk = b.satisfied
  return {
    honours: valid && distOk && b.total >= 20 && b.upper2 >= 13 && b.upper >= 6,
    ordinary: valid && distOk && b.total >= 15,
  }
})
const outlookNow = computed(() => {
  const dp = degreeProgressActual.value
  const valid = activePrograms.value.length > 0 && legality.value.messages.length === 0
  const distOk = dp.satisfied
  return {
    honours: valid && distOk && dp.total >= 20 && dp.upper2 >= 13 && dp.upper >= 6,
    ordinary: valid && distOk && dp.total >= 15,
  }
})
const outlookPlan = computed(() => {
  const dp = degreeProgress.value
  const valid = activePrograms.value.length > 0 && legality.value.messages.length === 0
  const distOk = dp.satisfied
  return {
    honours: valid && distOk && dp.total >= 20 && dp.upper2 >= 13 && dp.upper >= 6,
    ordinary: valid && distOk && dp.total >= 15,
  }
})

const outlookBorder = computed(() => {
  const t = degreeTarget.value
  if (outlookDone.value[t]) return 'bd-done'
  if (outlookNow.value[t]) return 'bd-taking'
  if (outlookPlan.value[t]) return 'bd-planned'
  return ''
})

const nowText = computed(() => {
  if (outlookNow.value[degreeTarget.value]) return degreeTarget.value === 'honours' ? 'Honours (HBA/HBSc)' : 'Ordinary'
  return 'Not enough'
})
const planText = computed(() => {
  if (outlookPlan.value[degreeTarget.value]) return degreeTarget.value === 'honours' ? 'Honours (HBA/HBSc)' : 'Ordinary'
  return 'Not enough'
})

const fmt = (n) => n.toFixed(1)

const distBorder = computed(() => {
  const b = degreeBreakdown.value
  const sat = (g) => g.cats.Science >= 1 && g.cats['Social Science'] >= 1 && g.cats.Humanities >= 1
  if (sat(b.done)) return 'bd-done'
  const dtCats = {
    Science: b.done.cats.Science + b.taking.cats.Science,
    'Social Science': b.done.cats['Social Science'] + b.taking.cats['Social Science'],
    Humanities: b.done.cats.Humanities + b.taking.cats.Humanities,
  }
  if (dtCats.Science >= 1 && dtCats['Social Science'] >= 1 && dtCats.Humanities >= 1) return 'bd-taking'
  if (sat(b.all)) return 'bd-planned'
  return ''
})

const degreeBorder = computed(() => {
  const b = degreeBreakdown.value
  if (degreeTarget.value === 'honours') {
    const met = (g) => g.total >= 20 && g.upper2 >= 13 && g.upper >= 6
    if (met(b.done)) return 'bd-done'
    const dtTotal = b.done.total + b.taking.total
    const dtUpper2 = b.done.upper2 + b.taking.upper2
    const dtUpper = b.done.upper + b.taking.upper
    if (dtTotal >= 20 && dtUpper2 >= 13 && dtUpper >= 6) return 'bd-taking'
    if (met(b.all)) return 'bd-planned'
  } else {
    if (b.done.total >= 15) return 'bd-done'
    if (b.done.total + b.taking.total >= 15) return 'bd-taking'
    if (b.all.total >= 15) return 'bd-planned'
  }
  return ''
})

const degreeMet = computed(() => {
  const dp = degreeProgress.value
  if (degreeTarget.value === 'honours') return dp.total >= 20 && dp.upper2 >= 13 && dp.upper >= 6
  return dp.total >= 15
})

function onExport() {
  exportPlanner(state.courseStatus, state.selectedPrograms)
}
function onImport() {
  importPlanner(applyImported)
}
</script>

<template>
  <div class="prog-header">
    <div style="display:flex;align-items:center;justify-content:space-between">
      <h2>Selected Programs</h2>
      <div class="data-btns" style="margin:0">
        <button class="data-btn" @click="onExport">Export</button>
        <button class="data-btn" @click="onImport">Import</button>
      </div>
    </div>

    <div class="prog-list">
      <span v-if="!state.selectedPrograms.length" style="font-size:12px;color:var(--gray-600)">No programs selected</span>
      <div
        v-for="p in state.selectedPrograms"
        :key="p.id"
        class="prog-chip"
        :class="[chipClass(p.type), { intention: p.intention }]"
        :title="chipTitle(p)"
      >
        <span title="Toggle intention" @click="toggleIntention(p.id)">{{ shortName(p) }}</span>
        <a
          class="code-link"
          style="font-size:10px;opacity:.7"
          :href="'https://utm.calendar.utoronto.ca/program/' + p.id"
          target="_blank"
          title="Open program page"
          @click="$event.stopPropagation()"
        >{{ p.code || '' }}</a>
        <span class="chip-x" @click="toggleProgram(p.id)">×</span>
      </div>
    </div>

    <div class="summary" title="Counts courses you marked Plan / Taking / Done">
      <!-- 1. Programs (counts) -->
      <div class="sum-block" :class="{ done: comboValid }">
        <div class="sum-head">Programs</div>
        <div class="sum-line">Specialist: <b>{{ programCounts.specialist }}</b></div>
        <div class="sum-line">Major: <b>{{ programCounts.major }}</b></div>
        <div class="sum-line">Minor: <b>{{ programCounts.minor }}</b></div>
        <div v-for="(m, i) in legality.messages" :key="i" class="sum-warn">{{ m }}</div>
      </div>

      <!-- 2. Distribution (diversity) -->
      <div class="sum-block" :class="[degreeProgress.satisfied ? 'done' : '', distBorder]">
        <div class="sum-head">Distribution <span class="sum-note">(≥1.0 each)</span></div>
        <div class="sum-line"><span :class="{ met: degreeProgress.cats.Science >= 1 }">Science: <span class="seg-planned">{{ fmt(degreeBreakdown.planned.cats.Science) }}</span>/<span class="seg-taking">{{ fmt(degreeBreakdown.taking.cats.Science) }}</span>/<span class="seg-done">{{ fmt(degreeBreakdown.done.cats.Science) }}</span>/<span class="seg-req">1.0</span></span></div>
        <div class="sum-line"><span :class="{ met: degreeProgress.cats['Social Science'] >= 1 }">Social Science: <span class="seg-planned">{{ fmt(degreeBreakdown.planned.cats['Social Science']) }}</span>/<span class="seg-taking">{{ fmt(degreeBreakdown.taking.cats['Social Science']) }}</span>/<span class="seg-done">{{ fmt(degreeBreakdown.done.cats['Social Science']) }}</span>/<span class="seg-req">1.0</span></span></div>
        <div class="sum-line"><span :class="{ met: degreeProgress.cats.Humanities >= 1 }">Humanities: <span class="seg-planned">{{ fmt(degreeBreakdown.planned.cats.Humanities) }}</span>/<span class="seg-taking">{{ fmt(degreeBreakdown.taking.cats.Humanities) }}</span>/<span class="seg-done">{{ fmt(degreeBreakdown.done.cats.Humanities) }}</span>/<span class="seg-req">1.0</span></span></div>
      </div>

      <!-- 3. Degree (Honours/Ordinary toggle) -->
      <div class="sum-block" :class="[degreeMet ? 'done' : '', degreeBorder]">
        <div class="sum-head">Degree
          <span class="deg-toggle">
            <button class="deg-btn" :class="{ active: degreeTarget === 'honours' }" @click="degreeTarget = 'honours'">Honours</button>
            <button class="deg-btn" :class="{ active: degreeTarget === 'ordinary' }" @click="degreeTarget = 'ordinary'">Ordinary</button>
          </span>
        </div>
        <template v-if="degreeTarget === 'honours'">
          <div class="sum-line"><span :class="{ met: degreeProgress.total >= 20 }">Total: <span class="seg-planned">{{ fmt(degreeBreakdown.planned.total) }}</span>/<span class="seg-taking">{{ fmt(degreeBreakdown.taking.total) }}</span>/<span class="seg-done">{{ fmt(degreeBreakdown.done.total) }}</span>/<span class="seg-req">20.0</span></span></div>
          <div class="sum-line"><span :class="{ met: degreeProgress.upper2 >= 13 }">200+ level: <span class="seg-planned">{{ fmt(degreeBreakdown.planned.upper2) }}</span>/<span class="seg-taking">{{ fmt(degreeBreakdown.taking.upper2) }}</span>/<span class="seg-done">{{ fmt(degreeBreakdown.done.upper2) }}</span>/<span class="seg-req">13.0</span></span></div>
          <div class="sum-line"><span :class="{ met: degreeProgress.upper >= 6 }">300/400 level: <span class="seg-planned">{{ fmt(degreeBreakdown.planned.upper) }}</span>/<span class="seg-taking">{{ fmt(degreeBreakdown.taking.upper) }}</span>/<span class="seg-done">{{ fmt(degreeBreakdown.done.upper) }}</span>/<span class="seg-req">6.0</span></span></div>
        </template>
        <template v-else>
          <div class="sum-line"><span :class="{ met: degreeProgress.total >= 15 }">Total: <span class="seg-planned">{{ fmt(degreeBreakdown.planned.total) }}</span>/<span class="seg-taking">{{ fmt(degreeBreakdown.taking.total) }}</span>/<span class="seg-done">{{ fmt(degreeBreakdown.done.total) }}</span>/<span class="seg-req">15.0</span></span></div>
        </template>
      </div>

      <!-- 4. Projected outcome -->
      <div class="sum-block outlook" :class="outlookBorder">
        <div class="sum-head">Projected Outcome</div>
        <div class="sum-line">Current: <b>{{ nowText }}</b></div>
        <div class="sum-line">Projected: <b>{{ planText }}</b></div>
        <div class="sum-disclaimer">Estimate only — other requirements (cGPA, etc.) not checked.</div>
      </div>
    </div>

    <CoursePicker />
  </div>
</template>
