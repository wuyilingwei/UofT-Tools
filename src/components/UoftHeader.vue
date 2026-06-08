<script setup>
// Bar-style dark-blue header used by content pages (faq / statement / calendar).
defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  backHref: { type: String, default: '/' },
  backText: { type: String, default: '← UofT Tools' },
})
</script>

<template>
  <header>
    <div>
      <h1>{{ title }}</h1>
      <p v-if="subtitle">{{ subtitle }}</p>
    </div>
    <a v-if="backHref" class="back-link" :href="backHref">{{ backText }}</a>
  </header>
</template>

<style scoped>
header {
  background: var(--blue);
  color: #fff;
  padding: 1.25rem 1.5rem;
  display: flex;
  align-items: center;
  gap: 1rem;
}
header h1 { font-size: 1.2rem; font-weight: 600; }
header p { font-size: .8rem; opacity: .7; margin-top: .15rem; }
.back-link {
  margin-left: auto;
  font-size: .8rem;
  color: rgba(255, 255, 255, .75);
  text-decoration: none;
  white-space: nowrap;
}
.back-link:hover { color: #fff; }
</style>
