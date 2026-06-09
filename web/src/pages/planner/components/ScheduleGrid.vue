<script setup>
import { computed } from 'vue'
import { buildGrid, DAY_LABELS, HOUR_PX, msToLabel } from '../lib/scheduling.js'

const props = defineProps({
  results: { type: Array, default: () => [] },
})

const DAYS = [1, 2, 3, 4, 5]
const grid = computed(() => buildGrid(props.results))

const blockTitle = (b) => {
  const inst = (b.instructors || []).map(i => `${i.firstName} ${i.lastName}`).join(', ')
  return `${b.code} ${b.sec}${b.shared ? ' (shared)' : ''}${b.full ? ' (full-session — runs both terms)' : ''}\n${b.startLabel}–${b.endLabel}\n${b.room}${inst ? '\n' + inst : ''}`
}
</script>

<template>
  <div class="grid-wrap">
    <div v-if="!results.length" class="no-data">No courses scheduled for this term.</div>

    <template v-else>
      <div class="grid-header">
        <div></div>
        <div v-for="d in DAYS" :key="d" class="grid-day-label">{{ DAY_LABELS[d] }}</div>
      </div>
      <div class="grid-body">
        <div class="time-col" :style="{ height: grid.colHeight + 'px' }">
          <div v-for="h in grid.hours" :key="h" class="time-slot" :style="{ height: HOUR_PX + 'px' }">{{ msToLabel(h) }}</div>
        </div>
        <div v-for="d in DAYS" :key="d" class="day-col" :style="{ height: grid.colHeight + 'px' }">
          <div class="day-col-bg">
            <div v-for="(h, i) in grid.hours" :key="i" class="hour-block"><div class="half-block"></div></div>
          </div>
          <div
            v-for="(b, i) in grid.dayBlocks[d]"
            :key="i"
            class="course-block"
            :class="{ conflict: b.conflict, shared: b.shared }"
            :style="{ top: b.top + 'px', height: b.height + 'px', left: 'calc(' + (b.left || 0) + '% + 2px)', width: 'calc(' + (b.widthPct || 100) + '% - 4px)', background: b.color, color: '#fff' }"
            :title="blockTitle(b)"
          >
            <div class="cb-code">{{ b.code }}<span v-if="b.shared" class="cb-shared">★</span><span v-if="b.full" class="cb-full" title="Full-session course — runs in both terms">Y</span></div>
            <div class="cb-room">{{ b.sec }} {{ b.room }}</div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
