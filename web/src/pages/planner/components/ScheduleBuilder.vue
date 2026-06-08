<script setup>
import {
  state, pendingCourses, scopes, availability, courseConflictHints,
  onScopeChange, toggleScheduledCourse,
  toggleFriend, addFriendCourse, removeFriendCourse,
} from '../store.js'
import CoursePicker from './CoursePicker.vue'

const DAYS = [
  { d: 1, label: 'Mon' }, { d: 2, label: 'Tue' }, { d: 3, label: 'Wed' },
  { d: 4, label: 'Thu' }, { d: 5, label: 'Fri' },
]
</script>

<template>
  <aside class="sched-controls">
    <section class="sched-left">
      <h3>Courses</h3>
      <label>Courses to Schedule</label>
      <div class="course-picks">
        <div v-if="!pendingCourses.length" class="sched-empty">
          No pending courses. Add programs or courses in the Planner tab.
        </div>
        <label
          v-for="c in pendingCourses"
          :key="c.code"
          class="course-pick"
          :class="{
            selected: state.scheduledCourses.includes(c.code),
            conflict: !!courseConflictHints[c.code],
          }"
        >
          <input
            type="checkbox"
            :checked="state.scheduledCourses.includes(c.code)"
            @change="toggleScheduledCourse(c.code, $event.target.checked)"
          >
          <span class="course-code">{{ c.code }}</span>
          <span class="avail">
            <span
              v-for="t in (availability[c.code] || [])"
              :key="t"
              class="avail-badge"
              :class="{ full: /Full/.test(t) }"
            >{{ t }}</span>
            <span v-if="!(availability[c.code] || []).length" class="avail-none" title="Not offered in this range (or not yet published)">—</span>
          </span>
          <span v-if="courseConflictHints[c.code]" class="conflict-badge">
            {{ courseConflictHints[c.code].reason }}
          </span>
        </label>
      </div>

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
    </section>

    <section class="sched-settings">
      <h3>Settings</h3>
      <label>Scheduling Range</label>
      <select v-model="state.scopeId" class="session-select" @change="onScopeChange">
        <option v-if="!scopes.length" value="">No sessions available</option>
        <option v-for="s in scopes" :key="s.id" :value="s.id">{{ s.label }}</option>
      </select>

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

      <div class="sched-notice">{{ state.schedNotice }}</div>
    </section>
  </aside>
</template>

<style scoped>
.avail { margin-left: auto; display: inline-flex; gap: 3px; align-items: center; flex-wrap: wrap; justify-content: flex-end; }
.avail-badge {
  font-size: 9px; font-weight: 600; padding: 1px 5px; border-radius: 8px;
  background: #e8f4f8; color: var(--teal); white-space: nowrap;
}
.avail-badge.full { background: #fef3c7; color: #92400e; }
.avail-none { font-size: 10px; color: var(--gray-400); }
.conflict-badge {
  flex-basis: 100%; margin-left: 22px; font-size: 10px; color: var(--red); font-weight: 600;
}
.friend-toggle {
  display: flex !important; align-items: center; gap: 6px; flex-direction: row !important;
  text-transform: none !important; letter-spacing: 0 !important; font-size: 13px !important;
  color: var(--gray-800) !important; margin-top: 14px;
}
.friend-hint { font-size: 11px; color: var(--gray-600); line-height: 1.5; margin: 4px 0; }
</style>
