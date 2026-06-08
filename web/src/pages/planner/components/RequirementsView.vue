<script setup>
import { computed } from 'vue'
import { activePrograms, getStatus, setCourseStatus, isSatisfied } from '../store.js'
import { badgeClass, buildReqLine } from '../lib/courses.js'

const KINDS = [
  ['enrolment', 'Enrolment Requirements'],
  ['completion', 'Completion Requirements'],
]

const programsModel = computed(() => activePrograms.value.map(prog => {
  const rg = prog.requirementGroups
  const hasReqs = rg && ((rg.enrolment?.sections?.length) || (rg.completion?.sections?.length))
  const kinds = []
  if (hasReqs) {
    for (const [kind, label] of KINDS) {
      const sections = rg[kind]?.sections || []
      if (!sections.length) continue
      kinds.push({
        label,
        sections: sections.map(sec => ({
          label: sec.label,
          lines: sec.groups.map(g => buildReqLine(g, isSatisfied)),
        })),
      })
    }
  }
  return { prog, hasReqs, kinds }
}))

function altClass(alt) {
  return alt.met ? 'met' : alt.done > 0 ? 'partial' : ''
}
function rcClass(code) {
  const s = getStatus(code)
  return s === 3 ? 'done' : s === 2 ? 's-progress' : s === 1 ? 's-planned' : ''
}
function rcNext(code) {
  return getStatus(code) < 3 ? 3 : 0
}
</script>

<template>
  <div>
    <div v-if="!activePrograms.length" class="empty-state">
      <p>All programs are in intention mode.</p>
    </div>

    <template v-else>
      <div v-for="entry in programsModel" :key="entry.prog.id" class="req-prog-block">
        <div class="req-prog-header">
          {{ entry.prog.name }} <span class="badge" :class="badgeClass(entry.prog.type)">{{ entry.prog.type }}</span>
        </div>

        <div v-if="!entry.hasReqs" style="font-size:12px;color:var(--gray-500);font-style:italic;padding:4px 0">
          No structured requirements available.
        </div>

        <template v-else>
          <template v-for="kind in entry.kinds" :key="kind.label">
            <div class="req-kind-label">{{ kind.label }}</div>
            <template v-for="(sec, si) in kind.sections" :key="si">
              <div v-if="sec.label" class="req-sec-label">{{ sec.label }}</div>

              <template v-for="(line, li) in sec.lines" :key="li">
                <!-- Collapsible elective pool -->
                <details v-if="line.pool" class="req-pool" :class="{ met: line.anyMet }">
                  <summary>
                    <span class="req-status">{{ line.anyMet ? '✓' : '○' }}</span>
                    Elective — pick 1 <span style="font-size:11px;color:var(--gray-500)">{{ line.label }}</span>
                  </summary>
                  <div class="req-pool-items">
                    <div v-for="(alt, ai) in line.alts" :key="ai" class="req-line" :class="{ met: alt.met }">
                      <span class="req-status">{{ alt.met ? '✓' : '○' }}</span>
                      <div class="req-alts">
                        <span class="req-alt" :class="altClass(alt)">
                          <template v-for="(c, ci) in alt.andGroup" :key="ci"><span v-if="ci > 0" class="req-plus">+</span><span class="rc" :class="rcClass(c)" title="Click to toggle" @click="setCourseStatus(c, rcNext(c))">{{ c }}</span> <a class="code-link" style="font-size:9px" :href="'https://utm.calendar.utoronto.ca/course/' + c.toLowerCase()" target="_blank" title="Open course page" @click="$event.stopPropagation()">↗</a></template>
                        </span>
                      </div>
                    </div>
                  </div>
                </details>

                <!-- Regular line (1–3 alternatives) -->
                <div v-else class="req-line" :class="{ met: line.anyMet }">
                  <span class="req-status">{{ line.anyMet ? '✓' : '○' }}</span>
                  <div class="req-alts">
                    <template v-for="(alt, ai) in line.alts" :key="ai"><span v-if="ai > 0" class="req-sep">or</span><span class="req-alt" :class="altClass(alt)"><template v-for="(c, ci) in alt.andGroup" :key="ci"><span v-if="ci > 0" class="req-plus">+</span><span class="rc" :class="rcClass(c)" title="Click to toggle" @click="setCourseStatus(c, rcNext(c))">{{ c }}</span> <a class="code-link" style="font-size:9px" :href="'https://utm.calendar.utoronto.ca/course/' + c.toLowerCase()" target="_blank" title="Open course page" @click="$event.stopPropagation()">↗</a></template></span></template>
                  </div>
                </div>
              </template>
            </template>
          </template>
        </template>
      </div>
    </template>
  </div>
</template>
