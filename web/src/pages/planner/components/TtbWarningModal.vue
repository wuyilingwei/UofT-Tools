<script setup>
import { dismissTtbWarning } from '../store.js'
</script>

<template>
  <div class="ttb-warn-backdrop" @click.self="dismissTtbWarning">
    <div class="ttb-warn-card" role="alertdialog" aria-labelledby="ttb-warn-title">
      <h3 id="ttb-warn-title">⚠️ Please double-check on ACORN</h3>
      <p>
        To keep this tool compliant, the Schedule Builder&rsquo;s timetable data is sourced from the
        University of Toronto&rsquo;s own public
        <a href="https://ttb.utoronto.ca" target="_blank" rel="noopener noreferrer">Timetable Builder (ttb.utoronto.ca)</a>,
        rather than scraped from ACORN.
      </p>
      <p>
        For reasons we haven&rsquo;t been able to determine, this data has occasionally been found to
        differ from what ACORN shows. Before enrolling based on a schedule generated here,
        <strong>please verify on ACORN that the course session/section you plan to take actually exists.</strong>
      </p>
      <button type="button" class="ttb-warn-ack" @click="dismissTtbWarning">I understand</button>
    </div>
  </div>
</template>

<style scoped>
.ttb-warn-backdrop {
  position: fixed; inset: 0; background: rgba(0, 0, 0, .45);
  display: flex; align-items: center; justify-content: center;
  z-index: 300; padding: 16px;
}
.ttb-warn-card {
  background: #fff; border-radius: var(--radius); box-shadow: var(--shadow);
  max-width: 440px; width: 100%; padding: 20px; border-top: 4px solid var(--amber);
}
.ttb-warn-card h3 { font-size: 16px; font-weight: 700; color: var(--gray-800); margin-bottom: 10px; }
.ttb-warn-card p { font-size: 13px; line-height: 1.55; color: var(--gray-700); margin-bottom: 10px; }
.ttb-warn-card a { color: var(--teal); }
.ttb-warn-ack {
  margin-top: 4px; padding: 8px 16px; border: none; border-radius: 6px;
  background: var(--blue); color: #fff; font-size: 13px; font-weight: 600; cursor: pointer;
}
.ttb-warn-ack:hover { background: var(--blue-light); }
</style>
