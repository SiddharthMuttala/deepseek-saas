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
  Snackbar
} from '@mui/material';
import { LockOpen, CheckCircle, Error as ErrorIcon } from '@mui/icons-material';
import { authAPI, testBackendConnection } from '../services/api';

const Login = () => {
  const [formData, setFormData] = useState({
    email: 'demo@example.com',
    password: 'demo123'
  });
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
    
    if (!formData.email || !formData.password) {
      showSnackbar('Please enter both email and password', 'error');
      return;
    }

    setLoading(true);

    try {
      console.log('Attempting login with:', formData.email);
      
      const response = await authAPI.login(formData.email, formData.password);
      
      if (response.success) {
        // Save token and user data
        localStorage.setItem('token', response.token);
        localStorage.setItem('user', JSON.stringify(response.user));
        
        showSnackbar('Login successful! Redirecting...');
        
        // Redirect after a short delay
        setTimeout(() => {
          navigate('/');
        }, 1000);
      } else {
        showSnackbar(response.error || 'Login failed', 'error');
      }
    } catch (error) {
      console.error('Login error:', error);
      showSnackbar(
        error.error || error.message || 'Login failed. Check backend connection.',
        'error'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = () => {
    setFormData({
      email: 'demo@example.com',
      password: 'demo123'
    });
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
            <LockOpen color="primary" sx={{ mr: 1, fontSize: 32 }} />
            <Typography component="h1" variant="h4" align="center">
              Login
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

          {/* Demo Credentials */}
          <Alert severity="info" sx={{ mb: 3 }}>
            <Typography variant="body2">
              <strong>Demo Account:</strong><br/>
              Email: demo@example.com<br/>
              Password: demo123
            </Typography>
            <Button 
              size="small" 
              onClick={handleDemoLogin}
              sx={{ mt: 1 }}
            >
              Use Demo Credentials
            </Button>
          </Alert>

          <form onSubmit={handleSubmit}>
            <TextField
              margin="normal"
              required
              fullWidth
              id="email"
              label="Email Address"
              name="email"
              autoComplete="email"
              autoFocus
              value={formData.email}
              onChange={handleChange}
              disabled={loading}
            />
            
            <TextField
              margin="normal"
              required
              fullWidth
              name="password"
              label="Password"
              type="password"
              id="password"
              autoComplete="current-password"
              value={formData.password}
              onChange={handleChange}
              disabled={loading}
            />
            
            <Button
              type="submit"
              fullWidth
              variant="contained"
              color="primary"
              disabled={loading || (backendStatus && !backendStatus.connected)}
              sx={{ mt: 3, mb: 2, py: 1.5 }}
            >
              {loading ? (
                <CircularProgress size={24} color="inherit" />
              ) : (
                'Sign In'
              )}
            </Button>
            
            <Box sx={{ textAlign: 'center', mt: 2 }}>
              <Typography variant="body2">
                Don't have an account?{' '}
                <Link to="/register" style={{ color: '#1976d2', fontWeight: 'bold' }}>
                  Create Account
                </Link>
              </Typography>
            </Box>
          </form>

          {/* Debug Info */}
          <Box sx={{ mt: 3, p: 2, bgcolor: '#f5f5f5', borderRadius: 1 }}>
            <Typography variant="caption" color="text.secondary">
              <strong>Debug Info:</strong><br/>
              • Backend URL: http://localhost:5001/api<br/>
              • MongoDB: {backendStatus?.connected ? 'Connected' : 'Check connection'}<br/>
              • Check browser Console for detailed errors
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

export default Login;