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
          backgroundColor: isDark ? '#141414' : '#ffffff',
          color: isDark ? '#e6e6e6' : '#111',
          borderRadius: 4,
          boxShadow: isDark ? '0 10px 30px rgba(0,0,0,0.6)' : '0 8px 20px rgba(16,24,40,0.08)',
          overflow: 'hidden',
        },
        '& .MuiDialogTitle-root': {
          backgroundColor: 'transparent',
          color: isDark ? '#ffffff' : '#111',
          borderBottom: isDark ? '1px solid rgba(255,255,255,0.04)' : '1px solid #f0f0f0',
          padding: '16px 24px',
          fontWeight: 600,
        },
        '& .MuiDialogContent-root': {
          backgroundColor: 'transparent',
          color: isDark ? '#d6d6d6' : '#333',
          padding: '12px 24px 16px 24px',
        },
        '& .MuiDialogActions-root': {
          backgroundColor: 'transparent',
          borderTop: isDark ? '1px solid rgba(255,255,255,0.03)' : '1px solid #f0f0f0',
          padding: '12px 16px',
        },
        '& .MuiButton-root': {
          color: isDark ? '#e6e6e6' : '#111',
        },
      }}
    >
      <DialogTitle id="login-confirm-title">{title || <Trans>Sign in required</Trans>}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: isDark ? '#d6d6d6' : 'text.secondary' }}>
          {text || <Trans>You must be signed in to continue.</Trans>}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="outlined" sx={{ borderRadius: 8, px: 2.5, py: 1, borderColor: isDark ? 'rgba(255,255,255,0.06)' : undefined, color: isDark ? '#e6e6e6' : undefined }}>{cancelLabel || <Trans>Cancel</Trans>}</Button>
        <Button onClick={onConfirm} variant="contained" sx={{ borderRadius: 8, px: 2.5, py: 1, textTransform: 'none', backgroundColor: isDark ? '#1976d2' : undefined }}>{confirmLabel || <Trans>Login</Trans>}</Button>
      </DialogActions>
    </Dialog>
  );
}
