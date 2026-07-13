import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// Registers the `beforeinstallprompt` listener at module load. Chrome fires it
// once, often before React mounts, so this import must happen up here.
import './lib/installPrompt'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Fade out the boot splash (defined in index.html) once React has mounted,
// holding it briefly so the pulse animation is always seen.
const splash = document.getElementById('splash')
if (splash) {
  const MIN_VISIBLE_MS = 900
  setTimeout(() => {
    splash.classList.add('splash-hide')
    splash.addEventListener('transitionend', () => splash.remove(), { once: true })
  }, MIN_VISIBLE_MS)
}
