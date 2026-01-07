const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'], // Make sure Authorization is allowed
  exposedHeaders: ['Authorization'] // Expose Authorization header
}));
app.use(express.json());

// MongoDB Connection
console.log('Attempting to connect to MongoDB...');
console.log('MongoDB URI:', process.env.MONGODB_URI ? 'Set (hidden for security)' : 'Not set');

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/deepseek-saas')
  .then(() => {
    console.log('✅ MongoDB connected successfully');
    console.log(`📁 Database: ${mongoose.connection.name}`);
    console.log(`🎯 Host: ${mongoose.connection.host}`);
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err.message);
    console.log('\n💡 Troubleshooting:');
    console.log('1. Check if MongoDB is running locally: mongod');
    console.log('2. For Atlas: Check connection string in .env');
    console.log('3. Check network access/whitelist');
    console.log('4. Using mock mode for now - app will still run');
  });

// Connection events
mongoose.connection.on('connected', () => {
  console.log('🔄 Mongoose connected to DB');
});

mongoose.connection.on('error', (err) => {
  console.error('❌ Mongoose connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('⚠️  Mongoose disconnected from DB');
});

// Health check route - MUST be before other routes
app.get('/api/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState;
  let dbStatusText = 'unknown';
  
  switch(dbStatus) {
    case 0: dbStatusText = 'disconnected'; break;
    case 1: dbStatusText = 'connected'; break;
    case 2: dbStatusText = 'connecting'; break;
    case 3: dbStatusText = 'disconnecting'; break;
  }
  
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    database: dbStatusText,
    uptime: process.uptime(),
    port: process.env.PORT || 5001,
    node_version: process.version
  });
});

// Basic route
app.get('/api', (req, res) => {
  res.json({
    message: 'DeepSeek SaaS API',
    version: '1.0.0',
    status: 'running',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    endpoints: {
      health: '/api/health',
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login',
        test: 'GET /api/auth/test'
      },
      deepseek: {
        generate: 'POST /api/deepseek/generate',
        prompts: 'GET /api/deepseek/prompts',
        test: 'GET /api/deepseek/test'
      }
    }
  });
});

// Test MongoDB route
app.get('/api/test-db', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        error: 'Database not connected',
        readyState: mongoose.connection.readyState
      });
    }
    
    // Test a simple query
    const collections = await mongoose.connection.db.listCollections().toArray();
    
    res.json({
      success: true,
      message: 'Database is working!',
      database: mongoose.connection.name,
      collections: collections.map(c => c.name),
      readyState: mongoose.connection.readyState
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      readyState: mongoose.connection.readyState
    });
  }
});

// Import routes
const authRoutes = require('./routes/auth');
const deepseekRoutes = require('./routes/deepseek');

// Use routes
app.use('/api/auth', authRoutes);
app.use('/api/deepseek', deepseekRoutes);

// 404 handler
app.use('/api/*', (req, res) => {
  res.status(404).json({ 
    error: 'API endpoint not found',
    requested: req.originalUrl,
    available_endpoints: ['/api/health', '/api/auth/*', '/api/deepseek/*']
  });
});

// Root 404
app.use((req, res) => {
  if (req.path !== '/') {
    res.status(404).json({ error: 'Route not found' });
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 CORS Origin: ${process.env.CORS_ORIGIN || 'http://localhost:3000'}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🔗 Home page: http://localhost:${PORT}/`);
  console.log(`🔗 Test DB: http://localhost:${PORT}/api/test-db`);
  console.log(`🔗 Auth test: http://localhost:${PORT}/api/auth/test`);
});