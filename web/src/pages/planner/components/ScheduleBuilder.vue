<script setup>
import {
  state, pendingCourses, scopes, courseOfferings, scheduledCodes, scheduleWarnings, tbaCourses,
  onScopeChange, isScheduledIn, toggleScheduledTerm, dayPref, cycleDayPref,
  toggleFriend, addFriendCourse, removeFriendCourse,
} from '../store.js'
import CoursePicker from './CoursePicker.vue'

const DAYS = [
  { d: 1, label: 'Mon' }, { d: 2, label: 'Tue' }, { d: 3, label: 'Wed' },
  { d: 4, label: 'Thu' }, { d: 5, label: 'Fri' },
]
const WARN_TEXT = {
  conflict: (w) => `${w.code}: time conflict`,
  missing: (w) => `${w.code}: not offered in ${w.term}`,
  tba: (w) => `${w.code}: no meeting times posted yet (${w.term}, TBA)`,
}
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

      <div class="pref-head">Preferences <span>— best-effort, never forced</span></div>

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

      <label>Days (click to cycle: prefer free → prefer classes → any)</label>
      <div class="day-row">
        <button
          v-for="day in DAYS"
          :key="day.d"
          type="button"
          class="day-btn"
          :class="dayPref(day.d)"
          :title="'Mon–Fri preference for ' + day.label"
          @click="cycleDayPref(day.d)"
        >{{ day.label }}<span class="day-state">{{ dayPref(day.d) === 'free' ? 'free' : dayPref(day.d) === 'busy' ? 'class' : '—' }}</span></button>
      </div>

      <label>Exam-reserved (ZZ) Blocks</label>
      <div class="zz-opts">
        <label class="zz-check">
          <input type="checkbox" v-model="state.prefs.zzOverlap"> Allow ZZ blocks to overlap each other
        </label>
        <label class="zz-check">
          <input type="checkbox" v-model="state.prefs.zzWithReg"> Allow ZZ blocks to overlap regular classes
        </label>
      </div>

      <div class="sched-notice">{{ state.schedNotice }}</div>
    </section>

    <section v-if="scheduleWarnings.length" class="sched-warnings">
      <h3>Warnings</h3>
      <ul>
        <li v-for="(w, i) in scheduleWarnings" :key="i" class="warn-item" :class="w.type">{{ WARN_TEXT[w.type](w) }}</li>
      </ul>
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
          :class="{ selected: scheduledCodes.includes(c.code) }"
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
.pref-head {
  margin: 14px 0 4px; font-size: 12px; font-weight: 700; color: var(--gray-700);
  border-top: 1px solid var(--gray-200); padding-top: 10px;
}
.pref-head span { font-weight: 400; font-size: 11px; color: var(--gray-500); }
.day-row { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; margin-bottom: 6px; }
.day-btn {
  display: flex; flex-direction: column; align-items: center; gap: 1px; padding: 4px 0;
  border: 1px solid var(--gray-200); border-radius: 6px; background: #fff; cursor: pointer;
  font-size: 12px; font-weight: 600; color: var(--gray-700); transition: .1s;
}
.day-btn .day-state { font-size: 9px; font-weight: 600; text-transform: uppercase; color: var(--gray-400); }
.day-btn.free { background: #fff5f5; border-color: #f5b5b5; color: #b91c1c; }
.day-btn.free .day-state { color: #b91c1c; }
.day-btn.busy { background: #f0fdf4; border-color: #bbf7d0; color: #15803d; }
.day-btn.busy .day-state { color: #15803d; }
.friend-toggle {
  display: flex !important; align-items: center; gap: 6px; flex-direction: row !important;
  text-transform: none !important; letter-spacing: 0 !important; font-size: 13px !important;
  color: var(--gray-800) !important; margin-top: 14px;
}
.friend-hint { font-size: 11px; color: var(--gray-600); line-height: 1.5; margin: 4px 0; }
.zz-opts { display: flex; flex-direction: column; gap: 4px; margin-bottom: 6px; }
.zz-check {
  display: flex !important; align-items: flex-start; gap: 6px; flex-direction: row !important;
  text-transform: none !important; letter-spacing: 0 !important; font-weight: 400 !important;
  font-size: 12px !important; color: var(--gray-700) !important; margin: 0 !important; line-height: 1.4;
}
.zz-check input { margin-top: 1px; cursor: pointer; }
.sched-warnings { padding: 14px; border-bottom: 1px solid var(--gray-200); background: #fffbeb; }
.sched-warnings h3 { font-size: 14px; font-weight: 600; margin-bottom: 8px; color: #92400e; }
.sched-warnings ul { list-style: none; display: flex; flex-direction: column; gap: 4px; }
.warn-item { font-size: 12px; line-height: 1.4; color: #92400e; padding-left: 16px; position: relative; }
.warn-item::before { content: '⚠'; position: absolute; left: 0; }
.warn-item.conflict { color: var(--red); }
</style>
