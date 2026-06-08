import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'node:path'

const repoRoot = import.meta.dirname
const webRoot = resolve(repoRoot, 'web')

// Single-page app (vue-router). Web sources live in web/; scraper data lives
// in data/ and is copied into the build output by copy-data.mjs (the "build"
// npm script runs it right after `vite build`). The lone entry is web/index.html.
export default defineConfig({
  root: webRoot,
  publicDir: false,
  plugins: [vue()],
  build: {
    outDir: resolve(repoRoot, 'dist'),
    emptyOutDir: true,
  },
})
