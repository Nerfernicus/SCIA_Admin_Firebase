import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import AccessibilityMenu from './components/AccessibilityMenu'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    <AccessibilityMenu />
  </React.StrictMode>,
)
