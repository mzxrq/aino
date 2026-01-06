import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './css/index.css'
import { BrowserRouter } from 'react-router-dom'
import { LoginPromptProvider } from './context/LoginPromptContext'

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
    <BrowserRouter>
      <LoginPromptProvider>
        <App />
      </LoginPromptProvider>
    </BrowserRouter>
  </React.StrictMode>,
)