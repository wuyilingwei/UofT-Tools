<script setup>
import { suggestions, addSuggested } from '../store.js'
</script>

<template>
  <div v-if="suggestions.length" class="suggestion-bar">
    <h4>Similar Programs You Might Like</h4>
    <div class="suggestion-chips">
      <span
        v-for="s in suggestions"
        :key="s.id"
        class="sugg-chip"
        :title="'Add ' + s.name"
        @click="addSuggested(s.id)"
      >
        {{ s.name }} <span class="sugg-type">{{ s.type }}</span>
        <span class="sugg-score">({{ s.shared }} shared)</span>
      </span>
    </div>
  </div>
</template>
