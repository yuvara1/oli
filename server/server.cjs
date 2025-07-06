require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');

// Import configurations
const { corsMiddleware } = require('./middleware/cors.cjs');
const { initDatabase } = require('./config/database.cjs');

// Import routes
const authRoutes = require('./routes/auth.cjs');
const movieRoutes = require('./routes/movies.cjs');
const seriesRoutes = require('./routes/series.cjs');
const paymentRoutes = require('./routes/payments.cjs');
const userRoutes = require('./routes/users.cjs');
const adminRoutes = require('./Admin/admin.cjs'); // Add this line

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(corsMiddleware);
app.use(bodyParser.json({ limit: '1024mb' }));
app.use(bodyParser.urlencoded({ limit: '1024mb', extended: true }));

// Initialize database connection
initDatabase();

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/movies', movieRoutes);
app.use('/api/series', seriesRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes); // Add this line

// Legacy routes (for backward compatibility)
app.use('/', authRoutes);
app.use('/', movieRoutes);
app.use('/', seriesRoutes);
app.use('/', paymentRoutes);
app.use('/', userRoutes);
app.use('/', adminRoutes); // Add this line

// Test endpoints
app.get('/test-cors', (req, res) => {
     res.json({
          message: 'CORS is working!',
          origin: req.headers.origin,
          timestamp: new Date().toISOString()
     });
});

app.get('/health', (req, res) => {
     res.json({
          status: 'OK',
          timestamp: new Date().toISOString(),
          uptime: process.uptime()
     });
});

// Start server
app.listen(port, () => {
     console.log(`Server is running on http://localhost:${port}`);
     console.log('CORS enabled for:');
     console.log('- http://localhost:5173');
     console.log('- http://localhost:3000');
     console.log('- https://appsail-50028934332.development.catalystappsail.in');
     console.log('- https://olii-ott.web.app');
});