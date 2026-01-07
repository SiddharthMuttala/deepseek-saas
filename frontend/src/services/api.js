import axios from 'axios';

// Create axios instance
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5001',
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 50000
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    console.error('API Error:', error.response?.data || error.message);
    
    // Handle 401 Unauthorized
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    
    return Promise.reject(error);
  }
);

// API endpoints
export const authAPI = {
  login: async (email, password) => {
    try {
      const response = await api.post('api/auth/login', { email, password });
      return response.data;
    } catch (error) {
      throw error.response?.data || { error: 'Login failed' };
    }
  },
  
  register: async (userData) => {
    try {
      const response = await api.post('api/auth/register', userData);
      return response.data;
    } catch (error) {
      throw error.response?.data || { error: 'Registration failed' };
    }
  },
  
  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  },
  
  getCurrentUser: () => {
    try {
      const userStr = localStorage.getItem('user');
      return userStr ? JSON.parse(userStr) : null;
    } catch (error) {
      return null;
    }
  },
  
  isAuthenticated: () => {
    return !!localStorage.getItem('token');
  }
};

export const deepseekAPI = {
  generate: async (promptType, userInput) => {
    try {
      const response = await api.post('api/deepseek/generate', { promptType, userInput });
      return response.data;
    } catch (error) {
      throw error.response?.data || { error: 'Generation failed' };
    }
  },
  
  getPrompts: async () => {
    try {
      const response = await api.get('api/deepseek/prompts');
      return response.data;
    } catch (error) {
      throw error.response?.data || { error: 'Failed to fetch prompts' };
    }
  }
};

// Test backend connection
export const testBackendConnection = async () => {
  try {
    const response = await api.get('api/health');
    return { connected: true, data: response.data };
  } catch (error) {
    return { connected: false, error: error.message };
  }
};

export default api;