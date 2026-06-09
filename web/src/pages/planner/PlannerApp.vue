<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import './planner.css'
import { state, init, syncScheduledCourses, closePopup } from './store.js'
import ProgramSidebar from './components/ProgramSidebar.vue'
import ProgramSelector from './components/ProgramSelector.vue'
import CourseListView from './components/CourseListView.vue'
import RequirementsView from './components/RequirementsView.vue'
import ScheduleBuilder from './components/ScheduleBuilder.vue'
import ScheduleBoard from './components/ScheduleBoard.vue'

const sidebarOpen = ref(false)

function switchTab(tab) {
  state.activeTab = tab
  if (tab === 'schedule') syncScheduledCourses()
  sidebarOpen.value = false
}

// Close the program popup when clicking outside the sidebar.
function onDocClick(e) {
  if (!e.target.closest('.sidebar')) closePopup()
}
onMounted(() => {
  document.addEventListener('click', onDocClick)
  if (!state.programs) init()
})
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>

<template>
  <div class="planner-scope">
    <div class="tabs">
      <button class="tab-btn" :class="{ active: state.activeTab === 'planner' }" @click="switchTab('planner')">Program Planner</button>
      <button class="tab-btn" :class="{ active: state.activeTab === 'schedule' }" @click="switchTab('schedule')">Schedule Builder</button>
    </div>

    <!-- Program Planner -->
    <div class="tab-panel" :class="{ active: state.activeTab === 'planner' }">
      <div class="mob-bar">
        <button class="mob-sidebar-btn" @click="sidebarOpen = !sidebarOpen">☰ Programs</button>
      </div>
      <div v-if="sidebarOpen" class="mob-backdrop" @click="sidebarOpen = false" />
      <ProgramSidebar :class="{ 'mob-open': sidebarOpen }" />

      <div class="main">
        <ProgramSelector />

        <div v-if="state.selectedPrograms.length || state.extraCourses.length" class="view-toggle">
          <button class="view-btn" :class="{ active: state.viewMode === 'list' }" @click="state.viewMode = 'list'">Course List</button>
          <button class="view-btn" :class="{ active: state.viewMode === 'requirements' }" @click="state.viewMode = 'requirements'">Program Requirements</button>
        </div>

        <div class="course-area">
          <div v-if="!state.selectedPrograms.length && !state.extraCourses.length" class="empty-state">
            <div style="font-size:36px">📚</div>
            <p>Select a subject from the left, then add a program — or add individual courses below.</p>
          </div>
          <template v-else>
            <CourseListView v-if="state.viewMode === 'list'" />
            <RequirementsView v-else />
          </template>
        </div>
      </div>
    </div>

    <!-- Schedule Builder -->
    <div id="schedule-panel" class="tab-panel" :class="{ active: state.activeTab === 'schedule' }">
      <ScheduleBuilder />
      <div class="grid-area">
        <ScheduleBoard />
      </div>
    </div>
  </div>
</template>
