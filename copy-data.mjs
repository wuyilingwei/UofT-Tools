// Post-build step: copy the scraper-generated static data (data/) into the
// Vite build output (dist/), preserving paths so the deployed site serves
// /calendar/*.ics and /planner/data/*.json exactly as before.
//
// Run automatically by `npm run build` (vite build && node copy-data.mjs).
import { cpSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = dirname(fileURLToPath(import.meta.url))
const dataDir = resolve(repoRoot, 'data')
const distDir = resolve(repoRoot, 'dist')

if (!existsSync(distDir)) {
  console.error('copy-data: dist/ not found — run `vite build` first.')
  process.exit(1)
}
if (!existsSync(dataDir)) {
  console.error('copy-data: data/ not found — nothing to copy.')
  process.exit(1)
}

cpSync(dataDir, distDir, { recursive: true })
console.log('copy-data: copied data/ → dist/')
