<script setup>
import { computed } from 'vue'
import { state, legality, degreeProgress, degreeProgressActual, degreeBreakdown, programCounts, activePrograms, toggleProgram, toggleIntention, applyImported } from '../store.js'
import { chipClass } from '../lib/courses.js'
import { exportPlanner, importPlanner } from '../lib/dataio.js'
import CoursePicker from './CoursePicker.vue'

const shortName = (p) => p.name.split(' - ')[0] || p.name
const chipTitle = (p) => p.intention ? 'Intention (planning)' : p.type + ' — ' + (p.code || '')

const comboValid = computed(() => activePrograms.value.length > 0 && legality.value.messages.length === 0)

// Projected graduation outlook from the marked courses + valid program combination.
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
const outlook = computed(() => outlookPlan.value)

const nowText = computed(() => outlookNow.value.honours
  ? 'Honours (HBA/HBSc)'
  : outlookNow.value.ordinary
    ? 'Ordinary'
    : 'Not enough')
const planText = computed(() => outlookPlan.value.honours
  ? 'Honours (HBA/HBSc)'
  : outlookPlan.value.ordinary
    ? 'Ordinary'
    : 'Not enough')

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

const ordinaryBorder = computed(() => {
  const b = degreeBreakdown.value
  if (b.done.total >= 15) return 'bd-done'
  if (b.done.total + b.taking.total >= 15) return 'bd-taking'
  if (b.all.total >= 15) return 'bd-planned'
  return ''
})

const honoursBorder = computed(() => {
  const b = degreeBreakdown.value
  const met = (g) => g.total >= 20 && g.upper2 >= 13 && g.upper >= 6
  if (met(b.done)) return 'bd-done'
  const dtTotal = b.done.total + b.taking.total
  const dtUpper2 = b.done.upper2 + b.taking.upper2
  const dtUpper = b.done.upper + b.taking.upper
  if (dtTotal >= 20 && dtUpper2 >= 13 && dtUpper >= 6) return 'bd-taking'
  if (met(b.all)) return 'bd-planned'
  return ''
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
        <div class="sum-line"><span :class="{ met: degreeProgress.cats.Science >= 1 }">Science: {{ fmt(degreeProgress.cats.Science) }} / 1.0</span></div>
        <div class="sum-line"><span :class="{ met: degreeProgress.cats['Social Science'] >= 1 }">Social Science: {{ fmt(degreeProgress.cats['Social Science']) }} / 1.0</span></div>
        <div class="sum-line"><span :class="{ met: degreeProgress.cats.Humanities >= 1 }">Humanities: {{ fmt(degreeProgress.cats.Humanities) }} / 1.0</span></div>
        <div class="sum-breakdown">P:{{ fmt(degreeBreakdown.planned.total) }} · T:{{ fmt(degreeBreakdown.taking.total) }} · D:{{ fmt(degreeBreakdown.done.total) }}</div>
      </div>

      <!-- 3. Ordinary degree -->
      <div class="sum-block" :class="[degreeProgress.total >= 15 ? 'done' : '', ordinaryBorder]">
        <div class="sum-head">Ordinary Degree</div>
        <div class="sum-line"><span :class="{ met: degreeProgress.total >= 15 }">Total: {{ fmt(degreeProgress.total) }} / 15.0 cr</span></div>
        <div class="sum-breakdown">P:{{ fmt(degreeBreakdown.planned.total) }} · T:{{ fmt(degreeBreakdown.taking.total) }} · D:{{ fmt(degreeBreakdown.done.total) }}</div>
      </div>

      <!-- 4. Honours degree -->
      <div class="sum-block" :class="[degreeProgress.total >= 20 && degreeProgress.upper2 >= 13 && degreeProgress.upper >= 6 ? 'done' : '', honoursBorder]">
        <div class="sum-head">Honours Degree</div>
        <div class="sum-line"><span :class="{ met: degreeProgress.total >= 20 }">Total: {{ fmt(degreeProgress.total) }} / 20.0 cr</span></div>
        <div class="sum-line"><span :class="{ met: degreeProgress.upper2 >= 13 }">200+ level: {{ fmt(degreeProgress.upper2) }} / 13.0</span></div>
        <div class="sum-line"><span :class="{ met: degreeProgress.upper >= 6 }">300/400 level: {{ fmt(degreeProgress.upper) }} / 6.0</span></div>
        <div class="sum-breakdown">P:{{ fmt(degreeBreakdown.planned.total) }} · T:{{ fmt(degreeBreakdown.taking.total) }} · D:{{ fmt(degreeBreakdown.done.total) }}</div>
      </div>

      <!-- 5. Projected outcome -->
      <div class="sum-block outlook" :class="{ done: outlookNow.ordinary || outlookNow.honours || outlookPlan.ordinary || outlookPlan.honours }">
        <div class="sum-head">Projected Outcome</div>
        <div class="sum-line">Current (Done + Taking): <b>{{ nowText }}</b></div>
        <div class="sum-line">Projected (+ Planned): <b>{{ planText }}</b></div>
        <div class="sum-disclaimer">Estimate only — other requirements (cGPA, etc.) not checked.</div>
      </div>
    </div>

    <CoursePicker />
  </div>
</template>
