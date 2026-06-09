<script setup>
import { suggestions, addSuggested } from '../store.js'
</script>

<template>
  <div v-if="suggestions.length" class="suggestion-bar">
    <h4>Similar Programs</h4>
    <div class="suggestion-chips">
      <span
        v-for="s in suggestions"
        :key="s.id"
        class="sugg-chip"
        :title="s.name + ' (' + s.type + ') — ' + s.shared + ' shared courses'"
        @click="addSuggested(s.id)"
      >
        {{ s.name.split(' - ')[0] }}<span class="sugg-count">{{ s.shared }}</span>
      </span>
    </div>
  </div>
</template>
