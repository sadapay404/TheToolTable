import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource/roboto/latin-400.css'
import '@fontsource/roboto/latin-500.css'
import '@fontsource/roboto/latin-700.css'
import App from './App.jsx'
import { applyTheme, savedTheme } from './themes.js'
import { initSafeArea } from './lib/safe-area.js'
import './styles.css'

/* Tauri sets `withGlobalTauri`, and Android's WebView identifies itself in the
   user agent. Detect the native shell from either signal so a desktop build that
   somehow reports an Android UA still gets the right safe-area treatment. */
const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : ''
const isTauri = typeof window !== 'undefined' && !!(window.__TAURI_INTERNALS__ || window.__TAURI__)
const isAndroid = isTauri && (/android/i.test(ua) || !!(window.__TTT_ANDROID_RUNNER__))
const root = document.documentElement
root.classList.add('native-shell')
if (isAndroid) root.classList.add('android-native')

/* Resolve the real display cutout / status bar insets before first paint. When
   Android's WebView reports zero `env()` values this measures a usable fallback,
   which is what stops the header from sitting under the punch hole. The
   pre-JS fallback lives in `html.android-native` in styles.css; this call then
   publishes the measured, per-device values as `--safe-*`. */
initSafeArea({ isAndroidNative: isAndroid })

applyTheme(savedTheme())
ReactDOM.createRoot(document.getElementById('root')).render(<App />)

/* Offline + installable (web build). Native shells (Tauri) already ship their files locally. */
if (import.meta.env.PROD && 'serviceWorker' in navigator && !isTauri && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}