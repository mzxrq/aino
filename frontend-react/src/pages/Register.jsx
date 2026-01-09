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
}));

const SignUpContainer = styled(Stack)(({ theme }) => ({
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
                        Sign up
                    </Typography>
          
                    {error && <Alert severity="error">{error}</Alert>}
          
                    <Box component="form" onSubmit={submit} noValidate sx={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 2 }}>
                        <FormControl>
                            <FormLabel htmlFor="name">Full Name</FormLabel>
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
                            <FormLabel htmlFor="username">Username</FormLabel>
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
                            <FormLabel htmlFor="email">Email</FormLabel>
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
                            <FormLabel htmlFor="password">Password</FormLabel>
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
                            Create account
                        </Button>
                    </Box>
                    <Divider>or</Divider>
                    <Typography sx={{ textAlign: 'center' }}>
                        Already have an account?{' '}
                        <Link component={RouterLink} to="/login" variant="body2">
                            Sign in
                        </Link>
                    </Typography>
                </Card>
            </SignUpContainer>
        </>
    );
}