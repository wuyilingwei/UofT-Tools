<script setup>
// Shared centered footer. Pages supply their own link set via the default slot.
</script>

<template>
  <footer>
    <p><slot /></p>
  </footer>
</template>

<style scoped>
footer {
  text-align: center;
  font-size: .78rem;
  color: var(--muted);
  padding: 1.5rem;
  border-top: 1px solid var(--border);
}
footer :slotted(a) { color: var(--blue); text-decoration: none; }
footer :slotted(a:hover) { text-decoration: underline; }
</style>
