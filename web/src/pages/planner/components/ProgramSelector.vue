<script setup>
import { computed } from 'vue'
import { state, legality, degreeProgress, programCounts, activePrograms, toggleProgram, toggleIntention, applyImported } from '../store.js'
import { chipClass } from '../lib/courses.js'
import { exportPlanner, importPlanner } from '../lib/dataio.js'
import CoursePicker from './CoursePicker.vue'

const shortName = (p) => p.name.split(' - ')[0] || p.name
const chipTitle = (p) => p.intention ? 'Intention (planning)' : p.type + ' — ' + (p.code || '')

// Projected graduation outlook from the marked courses + valid program combination.
const outlook = computed(() => {
  const dp = degreeProgress.value
  const valid = activePrograms.value.length > 0 && legality.value.messages.length === 0
  const distOk = dp.satisfied
  return {
    honours: valid && distOk && dp.total >= 20 && dp.upper2 >= 13 && dp.upper >= 6,
    ordinary: valid && distOk && dp.total >= 15,
  }
})
const outlookText = computed(() => outlook.value.honours
  ? '✓ On track for an Honours degree (HBA / HBSc, by program area).'
  : outlook.value.ordinary
    ? '✓ On track for an Ordinary degree (Honours requirements not yet met).'
    : '✗ Not yet on track to graduate — see unmet items above.')

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
      <div class="sum-block">
        <div class="sum-head">Programs</div>
        <div class="sum-line">Specialist: <b>{{ programCounts.specialist }}</b></div>
        <div class="sum-line">Major: <b>{{ programCounts.major }}</b></div>
        <div class="sum-line">Minor: <b>{{ programCounts.minor }}</b></div>
      </div>

      <!-- 2. Distribution (diversity) -->
      <div class="sum-block">
        <div class="sum-head">Distribution <span class="sum-note">(≥1.0 each)</span></div>
        <div class="sum-line"><span :class="{ met: degreeProgress.cats.Science >= 1 }">Science: {{ degreeProgress.cats.Science.toFixed(1) }} / 1.0</span></div>
        <div class="sum-line"><span :class="{ met: degreeProgress.cats['Social Science'] >= 1 }">Social Science: {{ degreeProgress.cats['Social Science'].toFixed(1) }} / 1.0</span></div>
        <div class="sum-line"><span :class="{ met: degreeProgress.cats.Humanities >= 1 }">Humanities: {{ degreeProgress.cats.Humanities.toFixed(1) }} / 1.0</span></div>
      </div>

      <!-- 3. Ordinary degree -->
      <div class="sum-block">
        <div class="sum-head">Ordinary Degree</div>
        <div class="sum-line"><span :class="{ met: degreeProgress.total >= 15 }">Total: {{ degreeProgress.total.toFixed(1) }} / 15.0 cr</span></div>
      </div>

      <!-- 4. Honours degree -->
      <div class="sum-block">
        <div class="sum-head">Honours Degree</div>
        <div class="sum-line"><span :class="{ met: degreeProgress.total >= 20 }">Total: {{ degreeProgress.total.toFixed(1) }} / 20.0 cr</span></div>
        <div class="sum-line"><span :class="{ met: degreeProgress.upper2 >= 13 }">200+ level: {{ degreeProgress.upper2.toFixed(1) }} / 13.0</span></div>
        <div class="sum-line"><span :class="{ met: degreeProgress.upper >= 6 }">300/400 level: {{ degreeProgress.upper.toFixed(1) }} / 6.0</span></div>
      </div>

      <!-- 5. Projected outcome -->
      <div class="sum-block outlook">
        <div class="sum-head">Projected Outcome</div>
        <div v-if="legality.messages.length">
          <div v-for="(m, i) in legality.messages" :key="i" class="sum-warn">{{ m }}</div>
        </div>
        <div class="sum-line" :class="{ 'sum-ok': outlook.ordinary }">{{ outlookText }}</div>
        <div class="sum-disclaimer">Estimate only — verify your cGPA and any other graduation requirements with the Registrar.</div>
      </div>
    </div>

    <CoursePicker />
  </div>
</template>
