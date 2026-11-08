import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '@/App';
import '@/index.css';

// The shell document is what a crawler reads. An inline script already drops it
// before paint; this covers a browser that skipped that script.
document.getElementById('u365-static')?.remove();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
