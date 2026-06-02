import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/app.css'
import App from './App.tsx'
import { ErrorBoundary } from './ErrorBoundary.tsx'

/** Block browser pinch/ctrl-zoom outside the diagram canvas (canvas handles its own zoom). */
function usePreventBrowserZoom() {
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) e.preventDefault();
    };
    const onGesture = (e: Event) => {
      e.preventDefault();
    };
    document.addEventListener('wheel', onWheel, { passive: false });
    document.addEventListener('gesturestart', onGesture);
    document.addEventListener('gesturechange', onGesture);
    document.addEventListener('gestureend', onGesture);
    return () => {
      document.removeEventListener('wheel', onWheel);
      document.removeEventListener('gesturestart', onGesture);
      document.removeEventListener('gesturechange', onGesture);
      document.removeEventListener('gestureend', onGesture);
    };
  }, []);
}

function Root() {
  usePreventBrowserZoom();
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

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
    <Root />
  </StrictMode>,
)
