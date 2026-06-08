import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'node:path'

const repoRoot = import.meta.dirname
const webRoot = resolve(repoRoot, 'web')

// Multi-page app. The web app sources live in web/; scraper data lives in
// data/ and is copied into the build output by copy-data.mjs (the "build"
// npm script runs it right after `vite build`).
export default defineConfig({
  root: webRoot,
  publicDir: false,
  plugins: [vue()],
  build: {
    outDir: resolve(repoRoot, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(webRoot, 'index.html'),
        faq: resolve(webRoot, 'faq.html'),
        statement: resolve(webRoot, 'statement.html'),
        calendar: resolve(webRoot, 'calendar/index.html'),
        planner: resolve(webRoot, 'planner/index.html'),
      },
    },
  },
})
