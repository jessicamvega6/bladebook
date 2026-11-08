import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../shared/styles/harbor.css';
import './coach.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
