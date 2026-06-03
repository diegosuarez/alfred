import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App.tsx'

// Register the Service Worker as early as possible. Two reasons:
//  - PWA installability: Chrome / Edge only show the "Install" prompt
//    when the page has a registered SW with a fetch handler.
//  - Web Push: the same SW receives reminder pushes when the page is
//    closed; subscribing it on app boot (instead of on the first
//    notification call) shortens the warm-up.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch((err) => console.warn('SW registration failed', err))
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
