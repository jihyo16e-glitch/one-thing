import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Self-hosted font (gate 4 loaded it from Google Fonts; the real app must work offline).
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import './shell-reset.css';
import './styles.css';
import { AppProvider } from './app/AppContext';
import App from './App';
import { registerSW } from './registerSW';

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing from index.html');

createRoot(root).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>,
);

// Offline support (production build only; never throws).
registerSW();
