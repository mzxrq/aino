import React, { useState } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CssBaseline from '@mui/material/CssBaseline';
import Divider from '@mui/material/Divider';
import FormLabel from '@mui/material/FormLabel';
import FormControl from '@mui/material/FormControl';
import Link from '@mui/material/Link';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import MuiCard from '@mui/material/Card';
import Alert from '@mui/material/Alert';
import { styled } from '@mui/material/styles';
import API_BASE from '../config/api';

const Card = styled(MuiCard)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  alignSelf: 'center',
  width: '100%',
  padding: theme.spacing(4),
  gap: theme.spacing(2),
  margin: 'auto',
  [theme.breakpoints.up('sm')]: {
    maxWidth: '450px',
  },
  boxShadow: 'hsla(220, 30%, 5%, 0.05) 0px 5px 15px 0px, hsla(220, 25%, 10%, 0.05) 0px 15px 35px -5px',
}));

const ResetContainer = styled(Stack)(({ theme }) => ({
  height: 'calc((1 - var(--template-frame-height, 0)) * 100dvh)',
  minHeight: '100%',
  padding: theme.spacing(2),
  [theme.breakpoints.up('sm')]: {
    padding: theme.spacing(4),
  },
  '&::before': {
    content: '""',
    display: 'block',
    position: 'absolute',
    zIndex: -1,
    inset: 0,
    backgroundImage: 'radial-gradient(ellipse at 50% 50%, hsl(210, 100%, 97%), hsl(0, 0%, 100%))',
    backgroundRepeat: 'no-repeat',
  },
}));

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [emailError, setEmailError] = useState(false);
  const [otpError, setOtpError] = useState(false);
  const [passwordError, setPasswordError] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const validateEmail = () => {
    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      setEmailError(true);
      return false;
    }
    setEmailError(false);
    return true;
  };

  const validateOtpAndPassword = () => {
    let isValid = true;
    if (!otp || otp.length === 0) {
      setOtpError(true);
      isValid = false;
    } else {
      setOtpError(false);
    }
    if (!newPassword || newPassword.length < 6) {
      setPasswordError(true);
      isValid = false;
    } else {
      setPasswordError(false);
    }
    return isValid;
  };

  const sendOtp = async () => {
    setError('');
    setSuccessMessage('');
    if (!validateEmail()) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/node/users/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || body.message || 'Failed to send OTP');
      setSuccessMessage('OTP sent! Check your email.');
      setStep(1);
    } catch (err) {
      console.error('Send OTP error', err);
      setError(err.message || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async () => {
    setError('');
    setSuccessMessage('');
    if (!validateOtpAndPassword()) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/node/users/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp, newPassword }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || body.message || 'Reset failed');
      setSuccessMessage('Password reset successful! Redirecting to login...');
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      console.error('Reset error', err);
      setError(err.message || 'Password reset failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <CssBaseline enableColorScheme />
      <ResetContainer direction="column" justifyContent="space-between">
        <Card variant="outlined">
          <Typography component="h1" variant="h4" sx={{ width: '100%', fontSize: 'clamp(2rem, 10vw, 2.15rem)' }}>
            {step === 0 ? 'Reset password' : 'Verify OTP'}
          </Typography>
          
          {error && <Alert severity="error">{error}</Alert>}
          {successMessage && <Alert severity="success">{successMessage}</Alert>}
          
          {step === 0 ? (
            <Box component="form" noValidate sx={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 2 }}>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                Enter the email associated with your account to receive an OTP.
              </Typography>
              <FormControl>
                <FormLabel htmlFor="email">Email</FormLabel>
                <TextField
                  error={emailError}
                  helperText={emailError ? 'Please enter a valid email address.' : ''}
                  id="email"
                  type="email"
                  name="email"
                  placeholder="your@email.com"
                  autoComplete="email"
                  autoFocus
                  required
                  fullWidth
                  variant="outlined"
                  color={emailError ? 'error' : 'primary'}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </FormControl>
              <Button
                fullWidth
                variant="contained"
                onClick={sendOtp}
                disabled={loading}
              >
                {loading ? 'Sending...' : 'Send OTP'}
              </Button>
              <Link component={RouterLink} to="/login" variant="body2" sx={{ alignSelf: 'center' }}>
                Back to sign in
              </Link>
            </Box>
          ) : (
            <Box component="form" noValidate sx={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 2 }}>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                Enter the OTP and choose a new password.
              </Typography>
              <FormControl>
                <FormLabel htmlFor="otp">OTP</FormLabel>
                <TextField
                  error={otpError}
                  helperText={otpError ? 'OTP is required.' : ''}
                  id="otp"
                  type="text"
                  name="otp"
                  placeholder="000000"
                  required
                  fullWidth
                  variant="outlined"
                  color={otpError ? 'error' : 'primary'}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                />
              </FormControl>
              <FormControl>
                <FormLabel htmlFor="newPassword">New Password</FormLabel>
                <TextField
                  error={passwordError}
                  helperText={passwordError ? 'Password must be at least 6 characters long.' : ''}
                  id="newPassword"
                  type="password"
                  name="newPassword"
                  placeholder="••••••"
                  required
                  fullWidth
                  variant="outlined"
                  color={passwordError ? 'error' : 'primary'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </FormControl>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <Button
                  fullWidth
                  variant="contained"
                  onClick={resetPassword}
                  disabled={loading}
                >
                  {loading ? 'Resetting...' : 'Reset Password'}
                </Button>
                <Button
                  fullWidth
                  variant="outlined"
                  onClick={() => {
                    setStep(0);
                    setOtp('');
                    setNewPassword('');
                    setError('');
                    setOtpError(false);
                    setPasswordError(false);
                  }}
                  disabled={loading}
                >
                  Back
                </Button>
              </Box>
            </Box>
          )}
        </Card>
      </ResetContainer>
    </>
  );
}
