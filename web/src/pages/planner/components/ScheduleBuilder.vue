<script setup>
import {
  state, pendingCourses, scopes, availability,
  onScopeChange, toggleScheduledCourse, generateSchedule,
  toggleFriend, addFriendCourse, removeFriendCourse,
} from '../store.js'
import CoursePicker from './CoursePicker.vue'

const DAYS = [
  { d: 1, label: 'Mon' }, { d: 2, label: 'Tue' }, { d: 3, label: 'Wed' },
  { d: 4, label: 'Thu' }, { d: 5, label: 'Fri' },
]
</script>

<template>
  <aside class="sched-sidebar">
    <h3>Build Schedule</h3>

    <label>Scheduling Range</label>
    <select v-model="state.scopeId" class="session-select" @change="onScopeChange">
      <option v-if="!scopes.length" value="">No sessions available</option>
      <option v-for="s in scopes" :key="s.id" :value="s.id">{{ s.label }}</option>
    </select>

    <label>Courses to Schedule</label>
    <div class="course-picks">
      <div v-if="!pendingCourses.length" style="font-size:12px;color:var(--gray-600)">
        No pending courses. Add programs or courses in the Planner tab.
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
        <span class="avail">
          <span v-for="t in (availability[c.code] || [])" :key="t" class="avail-badge">{{ t }}</span>
          <span v-if="!(availability[c.code] || []).length" class="avail-none" title="Not offered in this range (or not yet published)">—</span>
        </span>
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

    <!-- Friend co-scheduling -->
    <label class="friend-toggle">
      <input type="checkbox" :checked="state.friend.enabled" @change="toggleFriend($event.target.checked)">
      Schedule with a friend
    </label>
    <p v-if="state.friend.enabled" class="friend-hint">
      Courses you both pick are placed in the same lecture &amp; lab. Add your friend&rsquo;s courses:
    </p>
    <CoursePicker
      v-if="state.friend.enabled"
      label="Friend's courses"
      placeholder="Search a course to add…"
      :items="state.friend.courses"
      :add="addFriendCourse"
      :remove="removeFriendCourse"
    />

    <button class="gen-btn" @click="generateSchedule">Generate Schedule</button>
    <div style="margin-top:8px;font-size:12px;color:var(--gray-600)">{{ state.schedNotice }}</div>
  </aside>
</template>

<style scoped>
.avail { margin-left: auto; display: inline-flex; gap: 3px; align-items: center; }
.avail-badge {
  font-size: 9px; font-weight: 600; padding: 1px 5px; border-radius: 8px;
  background: #e8f4f8; color: var(--teal); white-space: nowrap;
}
.avail-none { font-size: 10px; color: var(--gray-400); }
.friend-toggle {
  display: flex !important; align-items: center; gap: 6px; flex-direction: row !important;
  text-transform: none !important; letter-spacing: 0 !important; font-size: 13px !important;
  color: var(--gray-800) !important; margin-top: 14px;
}
.friend-hint { font-size: 11px; color: var(--gray-600); line-height: 1.5; margin: 4px 0; }
</style>
