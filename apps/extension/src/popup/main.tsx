import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from '@/popup/App';
import '@/styles/globals.css';

// Le thème sombre de shadcn s'active par une classe, pas par media query.
if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
  document.documentElement.classList.add('dark');
}

const container = document.getElementById('root');
if (!container) throw new Error('#root not found in popup.html');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
