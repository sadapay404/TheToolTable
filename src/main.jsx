import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource/roboto/latin-400.css'
import '@fontsource/roboto/latin-500.css'
import '@fontsource/roboto/latin-700.css'
import App from './App.jsx'
import { applyTheme, savedTheme } from './themes.js'
import './styles.css'

applyTheme(savedTheme())
ReactDOM.createRoot(document.getElementById('root')).render(<App />)

// Offline + installable (web build). Native shells (Tauri) already ship their files locally.
if (import.meta.env.PROD && 'serviceWorker' in navigator && !window.__TAURI_INTERNALS__ && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}
