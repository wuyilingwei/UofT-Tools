<script setup>
// Global site footer (fixed at the bottom of the app shell).
</script>

<template>
  <footer class="site-footer">
    <span>Not affiliated with the University of Toronto</span>
    <span class="sep">&bull;</span>
    <router-link to="/faq">FAQ</router-link>
    <span class="sep">&bull;</span>
    <router-link to="/statement">Statement</router-link>
    <span class="sep">&bull;</span>
    <a href="https://github.com/wuyilingwei/UofT-Tools" target="_blank" rel="noopener noreferrer">GitHub</a>
  </footer>
</template>

<style scoped>
.site-footer {
  flex-shrink: 0;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: .5rem;
  padding: .7rem 1rem;
  font-size: .76rem;
  color: var(--muted);
  background: #fff;
  border-top: 1px solid var(--border);
}
.site-footer a { color: var(--blue); text-decoration: none; }
.site-footer a:hover { text-decoration: underline; }
.sep { opacity: .5; }
</style>
