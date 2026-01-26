import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './css/index.css'
import { BrowserRouter } from 'react-router-dom'
import { LoginPromptProvider } from './context/LoginPromptContext'
import { I18nProvider } from '@lingui/react'
import { i18n } from '@lingui/core'

// Load messages using dynamic import (ES module format)
const loadMessages = async (locale) => {
  try {
    const module = await import(`./locales/${locale}/messages.js`);
    // ES module exports: export const messages = {...}
    return module.messages;
  } catch (e) {
    console.error(`Failed to load messages for locale ${locale}:`, e);
    return null;
  }
};

// Initialize i18n with default locale
const initializeI18n = async () => {
  try {
    const locale = localStorage.getItem('locale') || 'en';
    const messages = await loadMessages(locale);
    if (messages) {
      i18n.load(locale, messages);
      i18n.activate(locale);
      return;
    }
  } catch (e) {
    console.error('Failed to initialize i18n:', e);
  }

  // Fallback to English
  try {
    const messages = await loadMessages('en');
    if (messages) {
      i18n.load('en', messages);
      i18n.activate('en');
    }
  } catch (fallbackError) {
    console.error('Failed to load fallback locale:', fallbackError);
  }
};

// Start the app: setup fetch override, render React and register service worker
function startApp() {
  try {
    const _origFetch = window.fetch.bind(window);
    window.fetch = (input, init = {}) => {
      try {
        const token = localStorage.getItem('token');
        const headers = new Headers(init && init.headers ? init.headers : {});
        if (token) headers.set('Authorization', `Bearer ${token}`);
        init = { ...(init || {}), headers };
      } catch (e) {
        // ignore errors accessing localStorage or Headers
      }
      return _origFetch(input, init);
    };
  } catch (e) {
    // environment may not allow overriding fetch; ignore
  }

  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <I18nProvider i18n={i18n}>
        <BrowserRouter>
          <LoginPromptProvider>
            <App />
          </LoginPromptProvider>
        </BrowserRouter>
      </I18nProvider>
    </React.StrictMode>,
  )

  // Register service worker to cache external logos (improves repeat-visit caching)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').then((reg) => {
        console.log('ServiceWorker registration successful with scope: ', reg.scope);
      }).catch((err) => {
        console.warn('ServiceWorker registration failed:', err);
      });
    });
  }
}

// Initialize i18n before starting the app; if initialization fails, still start the app.
initializeI18n().then(() => startApp()).catch((err) => {
  console.error('i18n initialization failed, starting app anyway:', err);
  startApp();
});