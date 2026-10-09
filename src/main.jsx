import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import AccessibilityMenu from './components/AccessibilityMenu'
import { initMonitoring, ErrorBoundary } from './lib/monitoring'

initMonitoring()

// Shown instead of a blank page if the app crashes. Plain markup on purpose: it
// must work even if the app's own providers are what failed.
function CrashScreen() {
  return (
    <div role="alert" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 22, margin: 0 }}>Something went wrong / May problema po</h1>
      <p style={{ margin: 0, maxWidth: 420 }}>The error was reported. Please reload the page. / Naiulat na po ang problema. Paki-reload ang pahina.</p>
      <button onClick={() => window.location.reload()} style={{ padding: '10px 20px', fontSize: 16, borderRadius: 10, border: 0, background: '#0f52ba', color: '#fff', cursor: 'pointer' }}>Reload / I-reload</button>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary fallback={<CrashScreen />}>
      <App />
      <AccessibilityMenu />
    </ErrorBoundary>
  </React.StrictMode>,
)
