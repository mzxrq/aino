import React, {useEffect} from 'react';
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
    try { root.unmount(); } catch(e){}
    try { div.remove(); } catch(e){}
  }

  function DialogCmp(props) {
    const [open, setOpen] = React.useState(true);

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

    const title = opts.title || '';
    const text = opts.text || '';
    const html = opts.html || null;
    const icon = opts.icon || null; // unused for now, kept for compatibility

    function handleClose(reason) {
      setOpen(false);
      if (reason === 'confirm') props.resolve({ isConfirmed: true, isDenied: false, isDismissed: false, value: true });
      else props.resolve({ isConfirmed: false, isDenied: false, isDismissed: true });
    }

    const showCancel = !!opts.showCancelButton;
    const confirmText = opts.confirmButtonText || (opts.confirmButtonColor ? 'OK' : 'OK');
    const cancelText = opts.cancelButtonText || 'Cancel';

    return (
      <Dialog open={open} onClose={() => handleClose('cancel')} maxWidth="xs" fullWidth>
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
    try { setTimeout(() => cleanup(), 50); } catch (e) {}
    try { resolve(v); } catch (e) {}
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
