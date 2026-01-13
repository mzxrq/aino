import React, { useState } from 'react';
import { Trans } from '@lingui/react/macro';
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
import { useAuth } from '../context/useAuth';

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

const SignUpContainer = styled(Stack)(({ theme }) => ({
  height: 'calc((1 - var(--template-frame-height, 0)) * 100dvh)',
  minHeight: '100%',
  padding: theme.spacing(2),
  [theme.breakpoints.up('sm')]: {
    padding: theme.spacing(4),
  },
}));

export default function Register() {
    const { registerWithCredentials } = useAuth();
    const navigate = useNavigate();
    const [name, setName] = useState('');
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [nameError, setNameError] = useState(false);
    const [usernameError, setUsernameError] = useState(false);
    const [emailError, setEmailError] = useState(false);
    const [passwordError, setPasswordError] = useState(false);
    const [error, setError] = useState('');

    const validateInputs = () => {
        let isValid = true;
        if (!name || name.length < 2) {
            setNameError(true);
            isValid = false;
        } else {
            setNameError(false);
        }
        if (!username || username.length < 3) {
            setUsernameError(true);
            isValid = false;
        } else {
            setUsernameError(false);
        }
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
            await registerWithCredentials(email, password, name, username);
            navigate('/profile');
        } catch (err) {
            setError(err.message || 'Registration failed');
        }
    };

    return (
        <>
            <CssBaseline enableColorScheme />
            <SignUpContainer direction="column" justifyContent="space-between">
                <Card variant="outlined">
                    <Typography component="h1" variant="h4" sx={{ width: '100%', fontSize: 'clamp(2rem, 10vw, 2.15rem)' }}>
                        <Trans>Sign up</Trans>
                    </Typography>
          
                    {error && <Alert severity="error">{error}</Alert>}
          
                    <Box component="form" onSubmit={submit} noValidate sx={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 2 }}>
                        <FormControl>
                            <FormLabel htmlFor="name"><Trans>Full Name</Trans></FormLabel>
                            <TextField
                                error={nameError}
                                helperText={nameError ? 'Full name must be at least 2 characters.' : ''}
                                id="name"
                                name="name"
                                placeholder="John Doe"
                                autoComplete="name"
                                required
                                fullWidth
                                variant="outlined"
                                color={nameError ? 'error' : 'primary'}
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                            />
                        </FormControl>
                        <FormControl>
                            <FormLabel htmlFor="username"><Trans>Username</Trans></FormLabel>
                            <TextField
                                error={usernameError}
                                helperText={usernameError ? 'Username must be at least 3 characters.' : ''}
                                id="username"
                                name="username"
                                placeholder="johndoe"
                                autoComplete="username"
                                required
                                fullWidth
                                variant="outlined"
                                color={usernameError ? 'error' : 'primary'}
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                            />
                        </FormControl>
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
                                autoComplete="new-password"
                                required
                                fullWidth
                                variant="outlined"
                                color={passwordError ? 'error' : 'primary'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </FormControl>
                        <Button type="submit" fullWidth variant="contained">
                            <Trans>Create account</Trans>
                        </Button>
                    </Box>
                    <Divider><Trans>or</Trans></Divider>
                    <Typography sx={{ textAlign: 'center' }}>
                        <Trans>Already have an account?</Trans>{' '}
                        <Link component={RouterLink} to="/login" variant="body2">
                            <Trans>Sign in</Trans>
                        </Link>
                    </Typography>
                </Card>
            </SignUpContainer>
        </>
    );
}