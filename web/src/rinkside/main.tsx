import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../shared/styles/harbor.css';
import './rinkside.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Keeps a copy of the page for the rink with no signal (public/coach/rinkside/sw.js). Built site only: in development
// Vite serves the page and a cached copy would hide changes.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('/coach/rinkside/sw.js', { scope: '/coach/rinkside/' }); });
}
