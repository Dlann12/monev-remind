import { createApp } from 'vue'
import './assets/main.css'
import App from './App.vue'

if (typeof chrome !== 'undefined' && Boolean(chrome?.runtime?.id)) {
  if (window.innerWidth < 650 && window.innerHeight < 700) {
    document.documentElement.classList.add('extension-popup')
    document.body.classList.add('extension-popup')
  }
}

createApp(App).mount('#app')

