import React, { useState } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { Trans } from '@lingui/react/macro';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import CssBaseline from '@mui/material/CssBaseline';
import FormControlLabel from '@mui/material/FormControlLabel';
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
import { useAuth } from '../context/useAuth';
import lineLogo from '../assets/LINE_Brand_icon.png';

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
  color: 'var(--text-primary)',
  '& .MuiOutlinedInput-root': {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    color: 'inherit',
    '& fieldset': {
      borderColor: 'rgba(0, 195, 0, 0.15)',
    },
    '&:hover fieldset': {
      borderColor: '#00c300',
    },
    '&.Mui-focused fieldset': {
      borderColor: '#00c300',
    },
  },
  '& .MuiInputBase-input::placeholder': {
    color: 'rgba(0, 0, 0, 0.55)',
  },
  '& .MuiFormLabel-root': {
    color: 'var(--text-primary)',
  },
  '& .MuiInputLabel-root': {
    color: 'var(--text-primary)',
  },
  'body.dark &': {
    boxShadow: 'hsla(0, 0%, 0%, 0.5) 0px 5px 15px 0px, hsla(0, 0%, 0, 0.7) 0px 15px 35px -5px',
    backgroundColor: 'hsl(218, 15%, 7%)',
    color: '#e8f0f8',
    '& .MuiOutlinedInput-root': {
      backgroundColor: 'rgba(255, 255, 255, 0.06)',
      '& fieldset': {
        borderColor: 'rgba(0, 195, 0, 0.25)',
      },
      '&:hover fieldset': {
        borderColor: '#00c300',
      },
      '&.Mui-focused fieldset': {
        borderColor: '#00c300',
      },
    },
    '& .MuiInputBase-input::placeholder': {
      color: 'rgba(232, 240, 248, 0.65)',
    },
    '& .MuiFormLabel-root': {
      color: '#cfd8e3',
      '&.Mui-focused': {
        color: '#00c300',
      },
    },
    '& .MuiInputLabel-root': {
      color: '#cfd8e3',
      '&.Mui-focused': {
        color: '#00c300',
      },
    },
  },
}));

const SignInContainer = styled(Stack)(({ theme }) => ({
  height: 'calc((1 - var(--template-frame-height, 0)) * 100dvh)',
  minHeight: '100%',
  padding: theme.spacing(2),
  [theme.breakpoints.up('sm')]: {
    padding: theme.spacing(4),
  },
}));

// Lightweight inline LINE logo badge (white box with LINE text)
const LineBadge = () => (
  <Box
    component="span"
    sx={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 22,
      height: 22,
      borderRadius: 0.75,
      bgcolor: '#ffffff',
      color: '#00C300',
      fontWeight: 800,
      fontSize: 11,
      lineHeight: '11px',
    }}
  >
    LINE
  </Box>
);

export default function Login() {
  const { loginWithCredentials } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState(false);
  const [passwordError, setPasswordError] = useState(false);
  const [error, setError] = useState('');

  const validateInputs = () => {
    let isValid = true;
    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      setEmailError(true);
      isValid = false;
    } else {
      setEmailError(false);
    }
    if (!password || password.length < 6) {
      setPasswordError(true);
      isValid = false;
    } else {
      setPasswordError(false);
    }
    return isValid;
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!validateInputs()) return;
    try {
      await loginWithCredentials(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Login failed');
    }
  };

  const handleLineLogin = () => {
    const clientID = "2008465838";
    const redirectURI = window.location.origin + "/auth/callback";
    const state = Math.random().toString(36).slice(2);
    const lineUrl = `https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=${clientID}&redirect_uri=${redirectURI}&state=${state}&scope=profile%20openid`;
    window.location.href = lineUrl;
  };

  return (
    <>
      <CssBaseline enableColorScheme />
      <SignInContainer direction="column" justifyContent="space-between">
        <Card variant="outlined">
          <Typography component="h1" variant="h4" sx={{ width: '100%', fontSize: 'clamp(2rem, 10vw, 2.15rem)' }}>
            <Trans>Sign in</Trans>
          </Typography>
          
          {error && <Alert severity="error">{error}</Alert>}
          
          <Box component="form" onSubmit={submit} noValidate sx={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 2 }}>
            <FormControl>
              <FormLabel htmlFor="email"><Trans>Email</Trans></FormLabel>
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
            <FormControl>
              <FormLabel htmlFor="password"><Trans>Password</Trans></FormLabel>
              <TextField
                error={passwordError}
                helperText={passwordError ? 'Password must be at least 6 characters long.' : ''}
                name="password"
                placeholder="••••••"
                type="password"
                id="password"
                autoComplete="current-password"
                required
                fullWidth
                variant="outlined"
                color={passwordError ? 'error' : 'primary'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </FormControl>
            <FormControlLabel control={<Checkbox value="remember" color="primary" />} label={<Trans>Remember me</Trans>} />
            <Button type="submit" fullWidth variant="contained">
              <Trans>Sign in</Trans>
            </Button>
            <Link component={RouterLink} to="/forgot-password" variant="body2" sx={{ alignSelf: 'center' }}>
              Forgot your password?
            </Link>
          </Box>
          <Divider>or</Divider>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Button
              fullWidth
              variant="outlined"
              startIcon={
                <Box
                  component="span"
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 22,
                    height: 22,
                    borderRadius: 0.75,
                    bgcolor: '#ffffff',
                    overflow: 'hidden',
                  }}
                >
                  <Box component="img" src={lineLogo} alt="LINE" sx={{ width: 18, height: 18 }} />
                </Box>
              }
              onClick={handleLineLogin}
              sx={{
                borderColor: '#00C300',
                color: '#00C300',
                '&:hover': {
                  bgcolor: 'rgba(0, 195, 0, 0.08)',
                  borderColor: '#00a600',
                  color: '#00a600',
                },
              }}
            >
              <Trans>Sign in with LINE</Trans>
            </Button>
            <Typography sx={{ textAlign: 'center' }}>
              <Trans>Don&apos;t have an account?</Trans>{' '}
              <Link component={RouterLink} to="/register" variant="body2">
                <Trans>Sign up</Trans>
              </Link>
            </Typography>
          </Box>
        </Card>
      </SignInContainer>
    </>
  );
}
