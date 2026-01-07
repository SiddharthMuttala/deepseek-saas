import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  TextField,
  Button,
  Container,
  Typography,
  Box,
  Paper,
  Alert,
  CircularProgress,
  Snackbar,
  FormControl,
  InputLabel,
  OutlinedInput,
  InputAdornment,
  IconButton
} from '@mui/material';
import { Visibility, VisibilityOff, PersonAdd, CheckCircle, Error as ErrorIcon } from '@mui/icons-material';
import { authAPI, testBackendConnection } from '../services/api';

const Register = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [backendStatus, setBackendStatus] = useState(null);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success'
  });
  const navigate = useNavigate();

  useEffect(() => {
    checkBackendConnection();
  }, []);

  const checkBackendConnection = async () => {
    const result = await testBackendConnection();
    setBackendStatus(result);
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const showSnackbar = (message, severity = 'success') => {
    setSnackbar({ open: true, message, severity });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validation
    if (!formData.name || !formData.email || !formData.password || !formData.confirmPassword) {
      showSnackbar('All fields are required', 'error');
      return;
    }
    
    if (formData.password.length < 6) {
      showSnackbar('Password must be at least 6 characters', 'error');
      return;
    }
    
    if (formData.password !== formData.confirmPassword) {
      showSnackbar('Passwords do not match', 'error');
      return;
    }
    
    if (!formData.email.includes('@')) {
      showSnackbar('Please enter a valid email address', 'error');
      return;
    }
    
    setLoading(true);

    try {
      console.log('Attempting registration:', formData.email);
      
      const response = await authAPI.register({
        name: formData.name,
        email: formData.email,
        password: formData.password
      });
      
      if (response.success) {
        // Save token and user data
        localStorage.setItem('token', response.token);
        localStorage.setItem('user', JSON.stringify(response.user));
        
        showSnackbar('Registration successful! Redirecting...');
        
        // Redirect after a short delay
        setTimeout(() => {
          navigate('/');
        }, 1500);
      } else {
        showSnackbar(response.error || 'Registration failed', 'error');
      }
    } catch (error) {
      console.error('Registration error:', error);
      showSnackbar(
        error.error || error.message || 'Registration failed',
        'error'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="sm">
      <Box
        sx={{
          marginTop: 4,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <Paper elevation={3} sx={{ p: 4, width: '100%' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 2 }}>
            <PersonAdd color="primary" sx={{ mr: 1, fontSize: 32 }} />
            <Typography component="h1" variant="h4" align="center">
              Create Account
            </Typography>
          </Box>

          {/* Backend Status */}
          {backendStatus && (
            <Alert 
              severity={backendStatus.connected ? "success" : "error"}
              sx={{ mb: 3 }}
              icon={backendStatus.connected ? <CheckCircle /> : <ErrorIcon />}
            >
              Backend: {backendStatus.connected ? 'Connected' : 'Not Connected'}
              {!backendStatus.connected && (
                <Typography variant="body2" sx={{ mt: 1 }}>
                  Make sure backend is running on port 5001
                </Typography>
              )}
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
            <TextField
              margin="normal"
              required
              fullWidth
              id="name"
              label="Full Name"
              name="name"
              autoComplete="name"
              autoFocus
              value={formData.name}
              onChange={handleChange}
              disabled={loading}
            />
            
            <TextField
              margin="normal"
              required
              fullWidth
              id="email"
              label="Email Address"
              name="email"
              autoComplete="email"
              value={formData.email}
              onChange={handleChange}
              disabled={loading}
            />
            
            <FormControl fullWidth margin="normal" variant="outlined">
              <InputLabel htmlFor="password">Password *</InputLabel>
              <OutlinedInput
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={handleChange}
                disabled={loading}
                endAdornment={
                  <InputAdornment position="end">
                    <IconButton
                      aria-label="toggle password visibility"
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                }
                label="Password *"
              />
            </FormControl>
            
            <FormControl fullWidth margin="normal" variant="outlined">
              <InputLabel htmlFor="confirmPassword">Confirm Password *</InputLabel>
              <OutlinedInput
                id="confirmPassword"
                name="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                value={formData.confirmPassword}
                onChange={handleChange}
                disabled={loading}
                endAdornment={
                  <InputAdornment position="end">
                    <IconButton
                      aria-label="toggle password visibility"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      edge="end"
                    >
                      {showConfirmPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                }
                label="Confirm Password *"
              />
            </FormControl>

            <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 2 }}>
              Password must be at least 6 characters long.
            </Typography>
            
            <Button
              type="submit"
              fullWidth
              variant="contained"
              color="primary"
              disabled={loading || (backendStatus && !backendStatus.connected)}
              sx={{ mt: 2, mb: 2, py: 1.5 }}
            >
              {loading ? (
                <CircularProgress size={24} color="inherit" />
              ) : (
                'Create Account'
              )}
            </Button>
            
            <Box sx={{ textAlign: 'center', mt: 2 }}>
              <Typography variant="body2">
                Already have an account?{' '}
                <Link to="/login" style={{ color: '#1976d2', fontWeight: 'bold' }}>
                  Login here
                </Link>
              </Typography>
            </Box>
          </form>

          {/* Sample Accounts for Testing */}
          <Box sx={{ mt: 3, p: 2, bgcolor: '#f5f5f5', borderRadius: 1 }}>
            <Typography variant="caption" color="text.secondary">
              <strong>Test Accounts (create these first):</strong><br/>
              1. Email: user1@test.com | Password: password123<br/>
              2. Email: user2@test.com | Password: password123<br/>
              3. Or create your own account
            </Typography>
          </Box>
        </Paper>
      </Box>

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        message={snackbar.message}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Container>
  );
};

export default Register;