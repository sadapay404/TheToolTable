import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { applyTheme, savedTheme } from './themes.js'
import './styles.css'

applyTheme(savedTheme())
ReactDOM.createRoot(document.getElementById('root')).render(<App />)
