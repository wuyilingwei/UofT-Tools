<script setup>
import { computed } from 'vue'
import {
  state, pendingCourses, onSessionChange, toggleScheduledCourse, generateSchedule,
} from '../store.js'

const DAYS = [
  { d: 1, label: 'Mon' }, { d: 2, label: 'Tue' }, { d: 3, label: 'Wed' },
  { d: 4, label: 'Thu' }, { d: 5, label: 'Fri' },
]

const availableSessions = computed(() => state.sessions.filter(s => s.value))
</script>

<template>
  <aside class="sched-sidebar">
    <h3>Build Schedule</h3>

    <label>Session</label>
    <select v-model="state.sessionValue" class="session-select" @change="onSessionChange">
      <option v-if="!availableSessions.length" value="">No sessions available</option>
      <option v-for="s in availableSessions" :key="s.value" :value="s.value">{{ s.label }}</option>
    </select>

    <label>Courses to Schedule</label>
    <div class="course-picks">
      <div v-if="!pendingCourses.length" style="font-size:12px;color:var(--gray-600)">
        No pending courses. Add programs in the Planner tab.
      </div>
      <label
        v-for="c in pendingCourses"
        :key="c.code"
        class="course-pick"
        :class="{ selected: state.scheduledCourses.includes(c.code) }"
      >
        <input
          type="checkbox"
          :checked="state.scheduledCourses.includes(c.code)"
          @change="toggleScheduledCourse(c.code, $event.target.checked)"
        >
        <span class="course-code" style="font-size:12px">{{ c.code }}</span>
      </label>
    </div>

    <label>Schedule Density</label>
    <div class="pref-group">
      <button class="pref-btn" :class="{ active: state.prefs.density === 'compact' }" @click="state.prefs.density = 'compact'">Compact</button>
      <button class="pref-btn" :class="{ active: state.prefs.density === 'spread' }" @click="state.prefs.density = 'spread'">Spread out</button>
    </div>

    <label>Time of Day</label>
    <div class="pref-group">
      <button class="pref-btn" :class="{ active: state.prefs.time === 'any' }" @click="state.prefs.time = 'any'">Any</button>
      <button class="pref-btn" :class="{ active: state.prefs.time === 'morning' }" @click="state.prefs.time = 'morning'">Morning</button>
      <button class="pref-btn" :class="{ active: state.prefs.time === 'afternoon' }" @click="state.prefs.time = 'afternoon'">Afternoon</button>
    </div>

    <label>Free Days (no classes)</label>
    <div class="day-checks">
      <label v-for="day in DAYS" :key="'free-' + day.d" class="day-check">
        <input type="checkbox" :value="day.d" v-model="state.prefs.freeDays"> {{ day.label }}
      </label>
    </div>

    <label>Busy Days (prefer classes here)</label>
    <div class="day-checks">
      <label v-for="day in DAYS" :key="'busy-' + day.d" class="day-check">
        <input type="checkbox" :value="day.d" v-model="state.prefs.busyDays"> {{ day.label }}
      </label>
    </div>

    <button class="gen-btn" @click="generateSchedule">Generate Schedule</button>
    <div style="margin-top:8px;font-size:12px;color:var(--gray-600)">{{ state.schedNotice }}</div>
  </aside>
</template>
