import React, {useEffect, useState} from 'react';
import { createRoot } from 'react-dom/client';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';

function renderDialog(opts, resolve) {
  const div = document.createElement('div');
  document.body.appendChild(div);
  const root = createRoot(div);

  function cleanup() {
    try { root.unmount(); } catch(_e) { /* ignore */ }
    try { div.remove(); } catch(_e) { /* ignore */ }
  }

  function DialogCmp(props) {
    const [open, setOpen] = React.useState(true);
    const [isDark, setIsDark] = React.useState(document.body.classList.contains('dark'));

    useEffect(() => {
      let t = null;
      if (opts && opts.timer) {
        t = setTimeout(() => {
          setOpen(false);
          props.resolve({ isConfirmed: false, isDismissed: true });
        }, opts.timer);
      }
      return () => { if (t) clearTimeout(t); };
    }, []);

    useEffect(() => {
      // Check initial state
      setIsDark(document.body.classList.contains('dark'));

      // Watch for theme changes
      const observer = new MutationObserver(() => {
        setIsDark(document.body.classList.contains('dark'));
      });

      observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
      return () => observer.disconnect();
    }, []);

    const title = opts.title || '';
    const text = opts.text || '';
    const html = opts.html || null;
    const _icon = opts.icon || null; // unused for now, kept for compatibility

    function handleClose(reason) {
      setOpen(false);
      if (reason === 'confirm') props.resolve({ isConfirmed: true, isDenied: false, isDismissed: false, value: true });
      else props.resolve({ isConfirmed: false, isDenied: false, isDismissed: true });
    }

    const showCancel = !!opts.showCancelButton;
    const confirmText = opts.confirmButtonText || (opts.confirmButtonColor ? 'OK' : 'OK');
    const cancelText = opts.cancelButtonText || 'Cancel';

    return (
      <Dialog 
        open={open} 
        onClose={() => handleClose('cancel')} 
        maxWidth="xs" 
        fullWidth
        slotProps={{
          backdrop: {
            sx: {
              backgroundColor: isDark ? 'rgba(0, 0, 0, 0.7)' : 'rgba(0, 0, 0, 0.5)',
            }
          }
        }}
        sx={{
          '& .MuiDialog-paper': {
            backgroundColor: isDark ? '#1a1a1a' : '#ffffff',
            color: isDark ? '#e0e0e0' : '#333',
          },
          '& .MuiDialogTitle-root': {
            backgroundColor: isDark ? '#252525' : '#f5f5f5',
            color: isDark ? '#e0e0e0' : '#333',
            borderBottom: isDark ? '1px solid #333' : '1px solid #e0e0e0',
          },
          '& .MuiDialogContent-root': {
            backgroundColor: isDark ? '#1a1a1a' : '#ffffff',
            color: isDark ? '#e0e0e0' : '#333',
          },
          '& .MuiDialogActions-root': {
            backgroundColor: isDark ? '#1a1a1a' : '#ffffff',
            borderTop: isDark ? '1px solid #333' : '1px solid #e0e0e0',
          },
          '& .MuiButton-root': {
            color: isDark ? '#e0e0e0' : '#333',
          },
          '& .MuiButton-contained': {
            backgroundColor: isDark ? '#2cc17f' : '#2cc17f',
            color: isDark ? '#ffffff' : '#ffffff',
          }
        }}
      >
        {title ? <DialogTitle>{title}</DialogTitle> : null}
        <DialogContent>
          {html ? <div dangerouslySetInnerHTML={{__html: html}} /> : <div>{text}</div>}
        </DialogContent>
        <DialogActions>
          {showCancel ? <Button onClick={() => handleClose('cancel')}>{cancelText}</Button> : null}
          {opts.showConfirmButton === false ? null : <Button onClick={() => handleClose('confirm')} variant="contained">{confirmText}</Button>}
        </DialogActions>
      </Dialog>
    );
  }

  const wrappedResolve = (v) => {
    try { setTimeout(() => cleanup(), 50); } catch (_e) { /* ignore */ }
    try { resolve(v); } catch (_e) { /* ignore */ }
  };

  // make DialogCmp use wrappedResolve
  function DialogWrapper() { return React.createElement(DialogCmp, { resolve: wrappedResolve }); }
  root.render(React.createElement(DialogWrapper));
}

const muiSwal = {
  fire: (opts = {}) => new Promise((resolve) => {
    renderDialog(opts, resolve);
  })
};

export default muiSwal;
