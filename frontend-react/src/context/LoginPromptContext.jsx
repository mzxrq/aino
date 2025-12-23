import React, { createContext, useContext, useRef, useState } from 'react';
import LoginConfirmDialog from '../components/LoginConfirmDialog';

const LoginPromptContext = createContext(null);

export function LoginPromptProvider({ children }){
  const resolveRef = useRef(null);
  const [state, setState] = useState({ open: false, options: {} });

  const showLoginPrompt = (options = {}) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setState({ open: true, options });
    });
  };

  const handleClose = () => {
    setState({ open: false, options: {} });
    if (resolveRef.current) { resolveRef.current(false); resolveRef.current = null; }
  };

  const handleConfirm = () => {
    setState({ open: false, options: {} });
    if (resolveRef.current) { resolveRef.current(true); resolveRef.current = null; }
  };

  return (
    <LoginPromptContext.Provider value={{ showLoginPrompt }}>
      {children}
      <LoginConfirmDialog
        open={state.open}
        onClose={handleClose}
        onConfirm={handleConfirm}
        title={state.options.title}
        text={state.options.text}
        confirmLabel={state.options.confirmLabel}
        cancelLabel={state.options.cancelLabel}
      />
    </LoginPromptContext.Provider>
  );
}

export function useLoginPrompt(){
  const ctx = useContext(LoginPromptContext);
  if (!ctx) {
    // Fallback: synchronous confirm
    return async (opts={}) => window.confirm(opts.text || 'You must be logged in to continue.');
  }
  return ctx.showLoginPrompt;
}

export default LoginPromptContext;
