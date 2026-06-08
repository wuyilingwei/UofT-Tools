<script setup>
import { computed } from 'vue'
import { state } from '../store.js'
import ScheduleGrid from './ScheduleGrid.vue'

const activeBoard = computed(() => (state.scheduleView === 'friend' ? state.friendBoard : state.board))
const showViews = computed(() => state.friend.enabled && state.friendBoard.length > 0)
</script>

<template>
  <div class="board">
    <div v-if="showViews" class="board-views">
      <button class="bv-btn" :class="{ active: state.scheduleView === 'you' }" @click="state.scheduleView = 'you'">You</button>
      <button class="bv-btn" :class="{ active: state.scheduleView === 'friend' }" @click="state.scheduleView = 'friend'">Friend</button>
      <span class="bv-hint">★ = shared course (same lecture &amp; lab)</span>
    </div>

    <div v-if="!activeBoard.length" class="no-data">
      Select a scheduling range and courses, then click Generate Schedule.
    </div>

    <div v-else class="term-cols">
      <div v-for="term in activeBoard" :key="term.value" class="term-col">
        <div class="term-head">
          {{ term.label }}
          <span v-if="!term.published" class="term-unpub">timetable not published yet</span>
        </div>
        <ScheduleGrid :results="term.results" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.board { display: flex; flex-direction: column; min-height: 0; }
.board-views { display: flex; align-items: center; gap: 6px; margin-bottom: 10px; }
.bv-btn {
  padding: 4px 14px; border: 1px solid var(--gray-300); border-radius: 6px;
  background: #fff; cursor: pointer; font-size: 13px; color: var(--gray-700); transition: .1s;
}
.bv-btn.active { background: var(--blue); color: #fff; border-color: var(--blue); }
.bv-hint { font-size: 11px; color: var(--gray-500); margin-left: auto; }
.term-cols { display: flex; gap: 18px; align-items: flex-start; }
.term-col { flex: 1 1 0; min-width: 560px; }
.term-head {
  display: flex; align-items: baseline; gap: 8px; font-size: 13px; font-weight: 700;
  color: var(--blue); margin-bottom: 8px; padding-bottom: 4px; border-bottom: 2px solid var(--gray-200);
}
.term-unpub { font-size: 11px; font-weight: 500; font-style: italic; color: #856404; }
</style>
