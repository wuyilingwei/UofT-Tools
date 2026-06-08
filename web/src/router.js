import { createRouter, createWebHistory } from 'vue-router'

// Lazy-load each route so the heavy planner stays in its own chunk.
const routes = [
  { path: '/', name: 'home', component: () => import('./pages/Home.vue'), meta: { title: 'UofT Tools' } },
  { path: '/calendar', name: 'calendar', component: () => import('./pages/Calendar.vue'), meta: { title: 'Calendar Feeds — UofT Tools' } },
  { path: '/planner', name: 'planner', component: () => import('./pages/planner/PlannerApp.vue'), meta: { title: 'UTM Course Planner — UofT Tools', wide: true } },
  { path: '/faq', name: 'faq', component: () => import('./pages/Faq.vue'), meta: { title: 'FAQ — UofT Tools' } },
  { path: '/statement', name: 'statement', component: () => import('./pages/Statement.vue'), meta: { title: 'Statement — UofT Tools' } },
  // Backward-compatible redirects from the old multi-page URLs.
  { path: '/index.html', redirect: '/' },
  { path: '/faq.html', redirect: '/faq' },
  { path: '/statement.html', redirect: '/statement' },
  { path: '/calendar/', redirect: '/calendar' },
  { path: '/planner/', redirect: '/planner' },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  },
})

router.afterEach((to) => {
  if (to.meta?.title) document.title = to.meta.title
})

export default router
