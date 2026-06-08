import { createApp } from 'vue'
import './planner.css'
import PlannerApp from './PlannerApp.vue'
import { init } from './store.js'

createApp(PlannerApp).mount('#app')
init()
