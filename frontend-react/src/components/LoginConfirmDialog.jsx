import React from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';

export default function LoginConfirmDialog({ open, onClose, onConfirm, title, text, confirmLabel, cancelLabel }){
  return (
    <Dialog
      open={Boolean(open)}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      aria-labelledby="login-confirm-title"
    >
      <DialogTitle id="login-confirm-title">{title || 'Please log in'}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {text || 'You must be logged in to continue.'}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">{cancelLabel || 'Cancel'}</Button>
        <Button onClick={onConfirm} variant="contained">{confirmLabel || 'Log in'}</Button>
      </DialogActions>
    </Dialog>
  );
}
