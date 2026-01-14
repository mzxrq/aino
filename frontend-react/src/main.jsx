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

// Initialize i18n before rendering
await initializeI18n();

// Inject Authorization header from localStorage into all fetch requests
// Ensures frontend GETs (and other requests) include the Bearer token automatically.
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