<script setup>
// Formal terms of use & privacy agreement. Header/footer come from the app shell.
</script>

<template>
  <div class="container">
    <h1 class="page-title">Terms of Use &amp; Privacy</h1>
    <p class="updated">Please read this agreement before using UofT Tools. By using this site you accept the terms below.</p>

    <div class="disclaimer">
      <strong>&#9888; Unofficial Tool</strong>
      <p>This project is developed and maintained by a student and is <em>not</em> affiliated with, endorsed by, or operated by the University of Toronto.</p>
    </div>

    <section class="agreement">
      <h2>Data Stored on Your Device</h2>
      <p>This site uses cookie-like technologies (such as your browser&rsquo;s local storage) to keep a persistent cache on your device. This lets the tools remember your previous choices &mdash; selected programs, course statuses, schedule preferences, and similar settings &mdash; so they are available the next time you visit.</p>
      <p>This information stays in your browser on your device. You can clear it at any time through your browser&rsquo;s settings.</p>

      <h2>What We Do and Do Not Collect</h2>
      <p>We do <strong>not</strong> collect any data about how you use the features of this site. Your selections, clicks, and choices are not transmitted to us.</p>
      <p>We do record basic aggregate request metadata &mdash; the source (referrer) of requests and overall visit counts &mdash; solely to understand how much the tools are used and where visitors come from.</p>
      <p>None of this data is provided to any party outside the University of Toronto community.</p>

      <h2>Advertising</h2>
      <p>To help cover development and maintenance costs, this site may display advertising. We do <strong>not</strong> share any of your data with advertising providers. Blocking advertisements will not affect your ability to use this site.</p>

      <h2>No Warranty</h2>
      <p>This service is provided <strong>AS IS</strong> with no warranty of any kind, express or implied, including accuracy, completeness, or timeliness. It is intended for supplementary reference only and should not be the sole basis for academic or financial planning.</p>
      <p><strong>The information shown is not guaranteed to be accurate or complete.</strong> You are solely responsible for regularly verifying all academic, payment, and refund details against your campus&rsquo;s official registrar and Academic Calendar. As the university makes clear, being unaware of a deadline is not typically a valid reason for an exception or extension.</p>
      <p>Use of this tool is strictly at your own risk; the maintainer assumes no liability for any errors, omissions, or consequences resulting from its use.</p>
    </section>
  </div>
</template>

<style scoped>
.container { max-width: 820px; margin: 2.25rem auto; padding: 0 1.25rem; width: 100%; }
.page-title { font-size: 1.5rem; font-weight: 700; color: var(--blue); margin-bottom: .5rem; }
.updated { color: var(--muted); font-size: .9rem; margin-bottom: 1.25rem; }
.disclaimer {
  border-left: 4px solid var(--grey);
  background: #fff8ec;
  padding: 1rem;
  border-radius: 0 var(--radius) var(--radius) 0;
  color: #6b4c00;
  font-size: 0.95rem;
  margin-bottom: 1.5rem;
}
.disclaimer p { margin-top: .5rem; }
.agreement h2 { font-size: 1.05rem; font-weight: 700; color: var(--blue); margin: 1.4rem 0 .5rem; }
.agreement p { margin-top: .5rem; font-size: 0.95rem; line-height: 1.6; color: var(--text); }
</style>
