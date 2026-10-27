import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/globals.css';
import './i18n';
import { applyTheme, initialTheme } from '@/features/shell/theme';
import { App } from './App';

applyTheme(initialTheme());

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
