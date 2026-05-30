import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/app.css'
import App from './App.tsx'
import { ErrorBoundary } from './ErrorBoundary.tsx'

// A service worker from another app sharing this dev port can hijack module
// requests and break Vite (e.g. a stale `/@react-refresh`). In dev only, drop
// any stray worker + caches and reload once so the page loads clean.
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.getRegistrations().then(async (registrations) => {
    if (registrations.length === 0) return
    await Promise.all(registrations.map((r) => r.unregister()))
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }
    if (!sessionStorage.getItem('sw-cleared')) {
      sessionStorage.setItem('sw-cleared', '1')
      location.reload()
    }
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
