<script setup>
import UoftFooter from '../../components/UoftFooter.vue'
</script>

<template>
  <header class="bar">
    <h1>Statement</h1>
  </header>

  <main>
    <a class="back-link" href="/">&#8592; Back to UofT Tools</a>
    <div class="disclaimer">
      <strong>&#9888; Unofficial Tool &mdash; Please Read Before Using.</strong>
      <p>This project is developed and maintained by a student and is <em>not</em> affiliated with or endorsed by the University of Toronto.</p>
      <p>This service is provided <strong>AS IS</strong> with no warranty of any kind, express or implied, including accuracy, completeness, or timeliness.</p>
      <p>This tool is intended for supplementary reference only and should not be used as the sole basis for academic or financial planning.</p>
      <p><strong>The dates shown are not guaranteed to be accurate or complete.</strong> You are solely responsible for regularly verifying all academic, payment, and refund deadlines at your campus&rsquo;s official registrar page.</p>
      <p>As the university makes clear, <em>being unaware of an academic, payment, or refund deadline is not a typical reason to receive an exception or extension.</em></p>
      <p>Use of this tool is strictly at your own risk; I assume no liability for any errors, omissions, or consequences resulting from its use.</p>
    </div>
  </main>

  <UoftFooter>
    Not affiliated with the University of Toronto &bull;
    <a href="/faq.html">FAQ</a> &bull;
    <a href="https://github.com/wuyilingwei/UofT-Tools" target="_blank" rel="noopener noreferrer">View on GitHub</a>
  </UoftFooter>
</template>

<style scoped>
.bar { background: var(--blue); color: #fff; padding: 1.25rem 1.5rem; }
main { max-width: 820px; margin: 2.25rem auto; padding: 0 1.25rem; flex: 1; }
.disclaimer {
  border-left: 4px solid var(--grey);
  background: #fff8ec;
  padding: 1rem;
  border-radius: 0 var(--radius) var(--radius) 0;
  color: #6b4c00;
  font-size: 0.95rem;
}
.disclaimer p { margin-top: .5rem; }
.back-link {
  display: inline-block;
  margin-bottom: 1rem;
  color: var(--blue);
  text-decoration: none;
  font-weight: 600;
}
</style>
