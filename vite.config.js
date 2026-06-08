import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'node:path'

const root = import.meta.dirname

// Multi-page app: each page is its own entry HTML mounting an isolated Vue app.
// publicDir defaults to ./public — the scraper-generated *.ics and planner data
// JSON are copied verbatim into dist/, so runtime fetch paths stay unchanged.
export default defineConfig({
  plugins: [vue()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(root, 'index.html'),
        faq: resolve(root, 'faq.html'),
        statement: resolve(root, 'statement.html'),
        calendar: resolve(root, 'calendar/index.html'),
        planner: resolve(root, 'planner/index.html'),
      },
    },
  },
})
