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

    <div class="summary" title="Counts courses you marked Plan / Taking / Done">
      <!-- Program combination + total credits -->
      <div class="sum-block">
        <div class="sum-head">Program &amp; Credits</div>
        <div id="prog-legality">
          <template v-if="legality.messages.length">
            <div v-for="(m, i) in legality.messages" :key="i" class="sum-warn">{{ m }}</div>
          </template>
          <div v-else-if="legality.success" class="sum-ok">✓ {{ legality.success }}</div>
        </div>
        <div class="sum-line">Total marked: <b>{{ degreeProgress.total.toFixed(1) }}</b> credits</div>
      </div>

      <!-- Distribution / diversity -->
      <div class="sum-block">
        <div class="sum-head">Distribution <span class="sum-note">(≥1.0 in each)</span></div>
        <div class="dp-row">
          <span class="dp-cat" :class="{ met: degreeProgress.cats.Science >= 1 }">Sci {{ degreeProgress.cats.Science.toFixed(1) }}</span>
          <span class="dp-cat" :class="{ met: degreeProgress.cats['Social Science'] >= 1 }">SSc {{ degreeProgress.cats['Social Science'].toFixed(1) }}</span>
          <span class="dp-cat" :class="{ met: degreeProgress.cats.Humanities >= 1 }">Hum {{ degreeProgress.cats.Humanities.toFixed(1) }}</span>
        </div>
      </div>

      <!-- Degree requirements (ordinary / honours, Arts & Science) -->
      <div class="sum-block">
        <div class="sum-head">Degree Requirements</div>
        <div class="sum-line">
          <span :class="{ met: degreeProgress.total >= 15 }">Ordinary: {{ degreeProgress.total.toFixed(1) }} / 15.0 cr</span>
        </div>
        <div class="sum-line">
          <span :class="{ met: degreeProgress.total >= 20 }">Honours (HBA/HBSc): {{ degreeProgress.total.toFixed(1) }} / 20.0 cr</span>
          <span class="sum-sep">·</span>
          <span :class="{ met: degreeProgress.upper >= 6 }">300/400-level {{ degreeProgress.upper.toFixed(1) }} / 6.0</span>
        </div>
      </div>
    </div>

    <CoursePicker />
  </div>
</template>
