import React from 'react';
import { Trans } from '@lingui/react/macro';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';

export default function LoginConfirmDialog({ open, onClose, onConfirm, title, text, confirmLabel, cancelLabel }){
  const isDark = document.body.classList.contains('dark');
  
  return (
    <Dialog
      open={Boolean(open)}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      aria-labelledby="login-confirm-title"
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
      }}
    >
      <DialogTitle id="login-confirm-title">{title || <Trans>Please log in</Trans>}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {text || <Trans>You must be logged in to continue.</Trans>}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">{cancelLabel || <Trans>Cancel</Trans>}</Button>
        <Button onClick={onConfirm} variant="contained">{confirmLabel || <Trans>Log in</Trans>}</Button>
      </DialogActions>
    </Dialog>
  );
}
