/**
 * @file Renderer entry point.
 *
 * Uses `BrowserRouter` for clean URLs (e.g. `/me/hours`); the server falls back to
 * `index.html` for any non-API path so deep links and reloads work. Global handlers catch any promise
 * rejection that escapes a component so nothing fails silently (NFR-2).
 */
import '@fontsource-variable/inter';
import '@fontsource/barlow-semi-condensed/600.css';
import '@fontsource/barlow-semi-condensed/700.css';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import './styles/index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AppRoutes } from './app/AppRoutes';
import { ErrorBoundary } from './app/ErrorBoundary';
import { AccessibilityProvider } from './context/AccessibilityContext';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';

window.addEventListener('unhandledrejection', (event) => {
  console.error('[Onboard] Unhandled promise rejection', event.reason);
  event.preventDefault();
});

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <ErrorBoundary>
      <AccessibilityProvider>
        <ToastProvider>
          <BrowserRouter>
            <AuthProvider>
              <AppRoutes />
            </AuthProvider>
          </BrowserRouter>
        </ToastProvider>
      </AccessibilityProvider>
    </ErrorBoundary>
  </StrictMode>,
);
