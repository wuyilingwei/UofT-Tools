<script setup>
import {
  state, pendingCourses, scopes, courseOfferings, scheduledCodes, courseConflictHints, tbaCourses,
  onScopeChange, isScheduledIn, toggleScheduledTerm,
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

      <details class="day-pref">
        <summary>Day Preferences</summary>
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
      </details>

      <div class="sched-notice">{{ state.schedNotice }}</div>
    </section>

    <section class="sched-left">
      <h3>Courses</h3>
      <label>Courses to Schedule</label>
      <div class="course-picks">
        <div v-if="!pendingCourses.length" class="sched-empty">
          No planned courses yet. Mark courses as &ldquo;Plan&rdquo; in the Program Planner tab to schedule them.
        </div>
        <div
          v-for="c in pendingCourses"
          :key="c.code"
          class="course-pick"
          :class="{
            selected: scheduledCodes.includes(c.code),
            conflict: !!courseConflictHints[c.code],
          }"
        >
          <span class="course-code">{{ c.code }}</span>
          <span class="seg-pills">
            <button
              v-for="t in (courseOfferings[c.code] || [])"
              :key="t.value"
              type="button"
              class="seg-pill"
              :class="{ active: isScheduledIn(c.code, t.value), full: /Full|Year/.test(t.label) }"
              @click="toggleScheduledTerm(c.code, t.value)"
            >{{ t.label }}</button>
            <span v-if="tbaCourses.has(c.code)" class="avail-badge tba" title="Offered, but no meeting times posted yet (TBA)">TBA</span>
            <span v-if="!(courseOfferings[c.code] || []).length" class="avail-none" title="Not offered in this range (or not yet published)">—</span>
          </span>
          <span v-if="courseConflictHints[c.code]" class="conflict-badge">
            {{ courseConflictHints[c.code].reason }}
          </span>
        </div>
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
  </aside>
</template>

<style scoped>
.seg-pills { display: inline-flex; gap: 4px; align-items: center; flex-wrap: wrap; justify-content: flex-end; }
.seg-pill {
  font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 10px; cursor: pointer;
  border: 1px solid var(--gray-300); background: #fff; color: var(--gray-600); white-space: nowrap; transition: .1s;
}
.seg-pill:hover { border-color: var(--teal); color: var(--teal); }
.seg-pill.active { background: var(--teal); border-color: var(--teal); color: #fff; }
.seg-pill.full.active { background: #92400e; border-color: #92400e; }
.avail-badge.tba { font-size: 9px; font-weight: 600; padding: 1px 6px; border-radius: 8px; background: #f3f4f6; color: #6b7280; white-space: nowrap; }
.avail-none { font-size: 10px; color: var(--gray-400); }
.conflict-badge {
  grid-column: 1 / -1; margin-left: 2px; font-size: 10px; color: var(--red); font-weight: 600; line-height: 1.4;
}
.friend-toggle {
  display: flex !important; align-items: center; gap: 6px; flex-direction: row !important;
  text-transform: none !important; letter-spacing: 0 !important; font-size: 13px !important;
  color: var(--gray-800) !important; margin-top: 14px;
}
.friend-hint { font-size: 11px; color: var(--gray-600); line-height: 1.5; margin: 4px 0; }
.day-pref { margin-top: 12px; border-top: 1px solid var(--gray-200); padding-top: 8px; }
.day-pref > summary {
  cursor: pointer; list-style: none; font-size: 12px; font-weight: 600;
  color: var(--gray-600); text-transform: uppercase; letter-spacing: .3px;
  display: flex; align-items: center; gap: 6px; user-select: none;
}
.day-pref > summary::-webkit-details-marker { display: none; }
.day-pref > summary::before { content: '▸'; font-size: 10px; color: var(--gray-400); transition: transform .15s; }
.day-pref[open] > summary::before { transform: rotate(90deg); }
</style>
