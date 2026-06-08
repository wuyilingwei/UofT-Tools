// Browser file import/export helpers for planner state.

export function exportPlanner(courseStatus, selectedPrograms) {
  const data = {
    version: 2,
    courseStatus: { ...courseStatus },
    selectedPrograms: selectedPrograms.map(p => ({ id: p.id, intention: p.intention })),
  }
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })),
    download: 'utm-planner.json',
  })
  a.click()
  URL.revokeObjectURL(a.href)
}

export function importPlanner(onData) {
  const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.json' })
  input.onchange = e => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        onData(JSON.parse(ev.target.result))
      } catch (err) {
        alert('Import failed: ' + err.message)
      }
    }
    reader.readAsText(file)
  }
  input.click()
}
