import { describe, it, expect } from 'vitest'
import {
  courseYear, badgeClass, chipClass, buildCourseList,
  computeLegality, computeSuggestions, prereqTokens, buildReqLine, reqLineMet, courseCredit, yearMarker, computeDistribution,
} from '../web/src/pages/planner/lib/courses.js'

describe('courseYear', () => {
  it('derives the year level from the course number', () => {
    expect(courseYear('CSC108H5')).toBe(1)
    expect(courseYear('MAT232H5')).toBe(2)
    expect(courseYear('STA457H5')).toBe(4)
  })
  it('returns null when no number is present', () => {
    expect(courseYear('XYZ')).toBeNull()
  })
})

describe('badgeClass / chipClass', () => {
  it('maps program types to css classes', () => {
    expect(badgeClass('Major')).toBe('badge-major')
    expect(badgeClass('Minor')).toBe('badge-minor')
    expect(badgeClass('Specialist')).toBe('badge-specialist')
    expect(badgeClass('')).toBe('')
    expect(chipClass('Minor')).toBe('minor')
    expect(chipClass('unknown')).toBe('major') // defaults to major
  })
})

describe('buildCourseList', () => {
  it('dedupes and sorts course codes across programs, tagging programs', () => {
    const programs = [
      { id: 'a', name: 'Computer Science - Major', type: 'Major', courses: ['CSC108H5', 'MAT102H5'] },
      { id: 'b', name: 'Mathematics - Minor', type: 'Minor', courses: ['MAT102H5', 'MAT134H5'] },
    ]
    const list = buildCourseList(programs)
    expect(list.map(c => c.code)).toEqual(['CSC108H5', 'MAT102H5', 'MAT134H5'])
    const shared = list.find(c => c.code === 'MAT102H5')
    expect(shared.programs).toHaveLength(2)
  })

  it('merges year + enrolment markers into one per-program tag', () => {
    const programs = [{
      id: 'a', name: 'Computer Science - Major', type: 'Major', courses: ['CSC148H5'],
      requirementGroups: {
        enrolment: { blocks: [
          { text: 'Limited: CSC148H5', codes: ['CSC148H5'], heading: false, lead: null, note: false },
        ] },
        completion: { blocks: [
          { text: 'First Year: CSC148H5', codes: ['CSC148H5'], heading: false, lead: 'First Year:', note: false },
        ] },
      },
    }]
    const list = buildCourseList(programs)
    // Single merged tag with Y1 (not "First Year") + Enrol — not two separate tags.
    expect([...list[0].reqLabels]).toEqual(['Computer Science · Y1, Enrol'])
  })
  it('abbreviates Higher Years to Y3+', () => {
    const programs = [{
      id: 'a', name: 'Game Studies - Minor', type: 'Minor', courses: ['ENG319H5'],
      requirementGroups: {
        completion: { blocks: [
          { text: 'Higher Years:', codes: [], heading: true, lead: 'Higher Years:', note: false },
          { text: '0.5 credit from ENG319H5', codes: ['ENG319H5'], heading: false, lead: null, note: false },
        ] },
      },
    }]
    const list = buildCourseList(programs)
    expect([...list[0].reqLabels]).toEqual(['Game Studies · Y3+'])
  })
})

describe('computeDistribution', () => {
  const credit = (c) => (/Y\d$/.test(c) ? 1.0 : 0.5)
  const dist = { CSC148H5: 'Science', SOC100H5: 'Social Science', ENG110Y5: 'Humanities', AAA000H5: '' }
  const distOf = (c) => dist[c] || ''
  it('sums total credits (H=0.5, Y=1.0)', () => {
    const r = computeDistribution(['CSC148H5', 'ENG110Y5'], credit, distOf)
    expect(r.total).toBe(1.5)
  })
  it('requires >=1.0 credit in each of Science / Social Science / Humanities', () => {
    const r = computeDistribution(['CSC148H5', 'SOC100H5', 'ENG110Y5'], credit, distOf)
    expect(r.cats).toEqual({ Science: 0.5, 'Social Science': 0.5, Humanities: 1.0 })
    expect(r.metCount).toBe(1) // only Humanities reached 1.0
    expect(r.satisfied).toBe(false)
  })
  it('is satisfied when all three divisions reach 1.0', () => {
    const r = computeDistribution(['CSC148H5', 'CSC148H5', 'SOC100H5', 'SOC100H5', 'ENG110Y5'], credit, distOf)
    expect(r.satisfied).toBe(true)
  })
})

describe('yearMarker', () => {
  it('maps year phrasings to compact markers (Y3+ folds in third/fourth year)', () => {
    expect(yearMarker('First Year:')).toBe('Y1')
    expect(yearMarker('Second Year')).toBe('Y2')
    expect(yearMarker('Third Year')).toBe('Y3+')
    expect(yearMarker('Fourth Year')).toBe('Y3+')
    expect(yearMarker('Higher Years:')).toBe('Y3+')
    expect(yearMarker('Core')).toBe(null)
  })
})

describe('computeLegality', () => {
  it('returns empty when no active programs', () => {
    expect(computeLegality([])).toEqual({ messages: [], success: '' })
  })
  it('flags a selection that is not enough on its own', () => {
    const res = computeLegality([{ name: 'X - Minor', type: 'Minor' }])
    expect(res.messages.join(' ')).toMatch(/enough on its own/)
  })
  it('accepts a single specialist as a valid combination (no trailing check mark)', () => {
    const res = computeLegality([{ name: 'CS - Specialist', type: 'Specialist' }])
    expect(res.messages).toHaveLength(0)
    expect(res.success).toBe('1 specialist')
  })
  it('rejects two program types in the same subject area', () => {
    const res = computeLegality([
      { name: 'Biology - Major', type: 'Major' },
      { name: 'Biology - Minor', type: 'Minor' },
    ])
    expect(res.messages.join(' ')).toMatch(/cannot register multiple types/)
  })
})

describe('computeSuggestions', () => {
  it('suggests programs sharing >= 2 courses, excluding selected', () => {
    const programs = {
      sections: [{
        programs: [
          { id: 'sel', name: 'CS - Major', type: 'Major', courses: ['A', 'B', 'C'] },
          { id: 'near', name: 'Software - Minor', type: 'Minor', courses: ['A', 'B', 'D'] },
          { id: 'far', name: 'Art - Minor', type: 'Minor', courses: ['Z'] },
        ],
      }],
    }
    const selected = [{ id: 'sel', name: 'CS - Major', type: 'Major', courses: ['A', 'B', 'C'] }]
    const out = computeSuggestions(selected, programs)
    expect(out.map(s => s.id)).toEqual(['near'])
    expect(out[0].shared).toBe(2)
  })
})

describe('prereqTokens', () => {
  it('splits text into plain segments and clickable course tokens', () => {
    const tokens = prereqTokens('CSC108H5 or MAT102H5', code => (code === 'CSC108H5' ? 3 : 0))
    const codes = tokens.filter(t => t.course)
    expect(codes.map(t => t.code)).toEqual(['CSC108H5', 'MAT102H5'])
    expect(codes[0].cls).toContain('prc-done')
    expect(codes[1].next).toBe(1)
  })
})

describe('buildReqLine', () => {
  it('marks a line met when an alternative is fully satisfied', () => {
    const line = buildReqLine([['CSC108H5'], ['CSC148H5']], code => code === 'CSC108H5')
    expect(line.anyMet).toBe(true)
    expect(line.pool).toBe(false)
  })
  it('flags a large elective set as a collapsible pool', () => {
    const line = buildReqLine([['A'], ['B'], ['C'], ['D']], () => false)
    expect(line.pool).toBe(true)
    expect(line.label).toMatch(/4 options/)
  })
})

describe('courseCredit', () => {
  it('weights H courses as 0.5 and Y courses as 1.0', () => {
    expect(courseCredit('ENG110H5')).toBe(0.5)
    expect(courseCredit('BIO299Y5')).toBe(1.0)
  })
})

describe('reqLineMet', () => {
  const done = (...codes) => (c) => codes.includes(c)
  it('returns null for blocks with no course codes (headings/notes)', () => {
    expect(reqLineMet({ text: 'Higher Years:', codes: [] }, () => true)).toBe(null)
  })
  it('a 0.5-credit pool is met by one H course', () => {
    const b = { text: '0.5 credit from ENG218H5 or ENG279H5', codes: ['ENG218H5', 'ENG279H5'] }
    expect(reqLineMet(b, done('ENG279H5'))).toBe(true)
  })
  it('a 1.0-credit pool of H courses needs two satisfied (not any one)', () => {
    const b = { text: '1.0 credit from ENG218H5 or ENG279H5 or ENG319H5', codes: ['ENG218H5', 'ENG279H5', 'ENG319H5'] }
    expect(reqLineMet(b, done('ENG279H5'))).toBe(false)
    expect(reqLineMet(b, done('ENG279H5', 'ENG319H5'))).toBe(true)
  })
  it('a 1.0-credit pool is met by a single Y course', () => {
    const b = { text: '1.0 credit from BIO299Y5 or BIO399Y5', codes: ['BIO299Y5', 'BIO399Y5'] }
    expect(reqLineMet(b, done('BIO299Y5'))).toBe(true)
  })
  it('an "and" line with no credit amount needs every code satisfied', () => {
    const b = { text: 'First Year: ENG110H5 and CCT109H5', codes: ['ENG110H5', 'CCT109H5'] }
    expect(reqLineMet(b, done('ENG110H5'))).toBe(false)
    expect(reqLineMet(b, done('ENG110H5', 'CCT109H5'))).toBe(true)
  })
  it('treats a global "completed N credits" prereq line as all-required, not a pool', () => {
    const b = { text: 'completed 4.0 credits and a 65% grade in each of ENG110H5 and CCT109H5', codes: ['ENG110H5', 'CCT109H5'] }
    expect(reqLineMet(b, done('ENG110H5'))).toBe(false)
    expect(reqLineMet(b, done('ENG110H5', 'CCT109H5'))).toBe(true)
  })
  it('checks a broad credit threshold ("X credits and …") against total credits', () => {
    const b = { text: '7.5 credits and GGR337H5 and (GGR276H5 or GGR278H5)', codes: ['GGR337H5', 'GGR276H5', 'GGR278H5'] }
    const sat = done('GGR337H5')
    expect(reqLineMet(b, sat, { totalCredits: 7.0 })).toBe(false) // course ok but < 7.5
    expect(reqLineMet(b, sat, { totalCredits: 8.0 })).toBe(true)
  })
  it('checks "N credits in <subject> courses, which must include …" against the program pool', () => {
    const b = { text: '3.0 credits in Game Studies courses, which must include CCT270H5 and ENG263H5', codes: ['CCT270H5', 'ENG263H5'] }
    const sat = done('CCT270H5', 'ENG263H5')
    expect(reqLineMet(b, sat, { poolCredits: 2.5 })).toBe(false) // both listed done but pool < 3.0
    expect(reqLineMet(b, sat, { poolCredits: 3.0 })).toBe(true)
    expect(reqLineMet(b, done('CCT270H5'), { poolCredits: 3.0 })).toBe(false) // missing mandatory ENG263H5
  })
  it('skips broad credit thresholds when no context is supplied (judges on courses)', () => {
    const b = { text: '3.0 credits in Game Studies courses, which must include CCT270H5 and ENG263H5', codes: ['CCT270H5', 'ENG263H5'] }
    expect(reqLineMet(b, done('CCT270H5', 'ENG263H5'))).toBe(true)
  })
})
