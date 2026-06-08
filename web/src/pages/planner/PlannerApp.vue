<script setup>
import { onMounted, onBeforeUnmount } from 'vue'
import { state, syncScheduledCourses, closePopup } from './store.js'
import ProgramSidebar from './components/ProgramSidebar.vue'
import ProgramSelector from './components/ProgramSelector.vue'
import CourseListView from './components/CourseListView.vue'
import RequirementsView from './components/RequirementsView.vue'
import SuggestionBar from './components/SuggestionBar.vue'
import ScheduleBuilder from './components/ScheduleBuilder.vue'
import ScheduleGrid from './components/ScheduleGrid.vue'

function switchTab(tab) {
  state.activeTab = tab
  if (tab === 'schedule') syncScheduledCourses()
}

// Close the program popup when clicking outside the sidebar.
function onDocClick(e) {
  if (!e.target.closest('.sidebar')) closePopup()
}
onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>

<template>
  <header class="site-header">
    <h1>UTM Course Planner</h1>
    <a href="/">← UofT Tools</a>
  </header>

  <div class="tabs">
    <button class="tab-btn" :class="{ active: state.activeTab === 'planner' }" @click="switchTab('planner')">Program Planner</button>
    <button class="tab-btn" :class="{ active: state.activeTab === 'schedule' }" @click="switchTab('schedule')">Schedule Builder</button>
  </div>

  <!-- Program Planner -->
  <div class="tab-panel" :class="{ active: state.activeTab === 'planner' }">
    <ProgramSidebar />

    <div class="main">
      <ProgramSelector />

      <div class="course-area">
        <div v-if="!state.selectedPrograms.length" class="empty-state">
          <div style="font-size:36px">📚</div>
          <p>Select a subject from the left, then add a program to see course requirements.</p>
        </div>
        <template v-else>
          <div class="view-toggle">
            <button class="view-btn" :class="{ active: state.viewMode === 'list' }" @click="state.viewMode = 'list'">Course List</button>
            <button class="view-btn" :class="{ active: state.viewMode === 'requirements' }" @click="state.viewMode = 'requirements'">Requirements</button>
          </div>
          <CourseListView v-if="state.viewMode === 'list'" />
          <RequirementsView v-else />
        </template>
      </div>

      <SuggestionBar />
    </div>
  </div>

  <!-- Schedule Builder -->
  <div id="schedule-panel" class="tab-panel" :class="{ active: state.activeTab === 'schedule' }">
    <ScheduleBuilder />
    <div class="grid-area">
      <ScheduleGrid />
    </div>
  </div>
</template>
