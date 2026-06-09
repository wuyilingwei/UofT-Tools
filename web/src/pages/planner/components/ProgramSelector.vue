<script setup>
import { state, legality, degreeProgress, toggleProgram, toggleIntention, applyImported } from '../store.js'
import { chipClass } from '../lib/courses.js'
import { exportPlanner, importPlanner } from '../lib/dataio.js'
import CoursePicker from './CoursePicker.vue'

const shortName = (p) => p.name.split(' - ')[0] || p.name
const chipTitle = (p) => p.intention ? 'Intention (planning)' : p.type + ' — ' + (p.code || '')

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

    <div id="prog-legality" style="font-size:12px;margin-bottom:6px">
      <template v-if="legality.messages.length">
        <template v-for="(m, i) in legality.messages" :key="i">
          <span style="color:#856404">{{ m }}</span><br>
        </template>
      </template>
      <span v-else-if="legality.success" style="color:var(--green)">✓ {{ legality.success }}</span>
    </div>

    <div class="degree-progress" title="Counts courses you marked Plan / Taking / Done">
      <span class="dp-total">{{ degreeProgress.total.toFixed(1) }} / 20.0 cr</span>
      <span class="dp-cat" :class="{ met: degreeProgress.cats.Science >= 1 }">Sci {{ degreeProgress.cats.Science.toFixed(1) }}</span>
      <span class="dp-cat" :class="{ met: degreeProgress.cats['Social Science'] >= 1 }">SSc {{ degreeProgress.cats['Social Science'].toFixed(1) }}</span>
      <span class="dp-cat" :class="{ met: degreeProgress.cats.Humanities >= 1 }">Hum {{ degreeProgress.cats.Humanities.toFixed(1) }}</span>
      <span class="dp-hint">distribution needs ≥1.0 in each</span>
    </div>

    <CoursePicker />
  </div>
</template>
