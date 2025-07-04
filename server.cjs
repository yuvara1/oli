require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mysql = require('mysql2');
const multer = require('multer');
const ImageKit = require("imagekit");
const { Mux } = require('@mux/mux-node');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const app = express();
const port = 3000;

// Razorpay initialization
const razorpay = new Razorpay({
     key_id: process.env.RAZORPAY_KEY_ID,
     key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Add error checking for Razorpay credentials
if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
     console.error('Razorpay credentials missing! Please check your .env file');
     console.log('Required variables: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET');
     process.exit(1);
}

console.log('Razorpay initialized successfully');

// Simplified and more reliable CORS configuration
app.use((req, res, next) => {
     const allowedOrigins = [
          'http://localhost:5173',
          'http://localhost:3000',
          'https://appsail-50028934332.development.catalystappsail.in',
          'https://olii-ott.web.app'
     ];

     const origin = req.headers.origin;

     // Allow requests from allowed origins or if no origin (same-origin requests)
     if (allowedOrigins.includes(origin) || !origin) {
          res.header('Access-Control-Allow-Origin', origin || '*');
     }

     res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
     res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
     res.header('Access-Control-Allow-Credentials', 'true');
     res.header('Access-Control-Max-Age', '3600');

     // Handle preflight requests
     if (req.method === 'OPTIONS') {
          res.status(200).end();
          return;
     }

     next();
});

// Body parser middleware
app.use(bodyParser.json({ limit: '1024mb' }));
app.use(bodyParser.urlencoded({ limit: '1024mb', extended: true }));

// Multer config for memory uploads
const memoryUpload = multer({ storage: multer.memoryStorage() });

// Create connection pool with better timeout settings
const pool = mysql.createPool({
     host: process.env.MYSQL_HOST || 'localhost',
     user: process.env.MYSQL_USER || 'root',
     password: process.env.MYSQL_PASSWORD || '',
     database: process.env.MYSQL_DATABASE || 'ott',
     port: process.env.MYSQL_PORT || 3306,
     waitForConnections: true,
     connectionLimit: 10,
     queueLimit: 0,
     acquireTimeout: 60000,    // 60 seconds
     timeout: 60000,           // 60 seconds
     reconnect: true,
     idleTimeout: 300000,      // 5 minutes
     enableKeepAlive: true,
     keepAliveInitialDelay: 0
});

// Promisify the pool.query method
const queryDB = (query, params = []) => {
     return new Promise((resolve, reject) => {
          pool.execute(query, params, (err, results) => {
               if (err) {
                    console.error('Database query error:', err);
                    reject(err);
               } else {
                    resolve(results);
               }
          });
     });
};

// Test database connection on startup
pool.getConnection((err, connection) => {
     if (err) {
          console.error('Database connection failed:', err);
          console.log('Please check your database configuration in .env file');
     } else {
          console.log('Connected to MySQL database successfully');
          connection.release();
     }
});

// ImageKit configuration
const imagekit = new ImageKit({
     publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
     privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
     urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
});

// Add debug logging for environment variables
console.log('Environment check:');
console.log('SERIES_IMAGEKIT_PUBLIC_KEY:', process.env.SERIES_IMAGEKIT_PUBLIC_KEY ? 'Set' : 'Missing');
console.log('SERIES_IMAGEKIT_PRIVATE_KEY:', process.env.SERIES_IMAGEKIT_PRIVATE_KEY ? 'Set' : 'Missing');
console.log('SERIES_IMAGEKIT_URL_ENDPOINT:', process.env.SERIES_IMAGEKIT_URL_ENDPOINT);
console.log('SERIES_MUX_TOKEN_ID:', process.env.SERIES_MUX_TOKEN_ID ? 'Set' : 'Missing');
console.log('SERIES_MUX_TOKEN_SECRET:', process.env.SERIES_MUX_TOKEN_SECRET ? 'Set' : 'Missing');

// Series ImageKit configuration (separate from movies)
const seriesImagekit = new ImageKit({
     publicKey: process.env.SERIES_IMAGEKIT_PUBLIC_KEY,
     privateKey: process.env.SERIES_IMAGEKIT_PRIVATE_KEY,
     urlEndpoint: process.env.SERIES_IMAGEKIT_URL_ENDPOINT
});

// Series Mux configuration (separate from movies)
const seriesMux = new Mux({
     tokenId: process.env.SERIES_MUX_TOKEN_ID,
     tokenSecret: process.env.SERIES_MUX_TOKEN_SECRET
});

// Test configurations
console.log('Series ImageKit URL Endpoint:', process.env.SERIES_IMAGEKIT_URL_ENDPOINT);
console.log('Series Mux Token ID:', process.env.SERIES_MUX_TOKEN_ID);

// Initialize Mux client
const mux = new Mux({
     tokenId: process.env.MUX_TOKEN_ID,
     tokenSecret: process.env.MUX_TOKEN_SECRET
});

// **EXISTING APIs - Updated with better error handling**

// 1. Get all movie IDs for homepage
app.get('/movie-ids', async (req, res) => {
     console.log('Movie IDs requested');
     try {
          const results = await queryDB('SELECT id, movie_title FROM movieslist ORDER BY id');
          console.log('Movie IDs fetched:', results);
          res.json(results);
     } catch (err) {
          console.error('Error fetching movie IDs:', err);
          res.status(500).json({ error: 'Error fetching movie IDs' });
     }
});

// 2. Get single movie by ID
app.get('/movie/:id', async (req, res) => {
     const movieId = req.params.id;
     try {
          const results = await queryDB('SELECT * FROM movieslist WHERE id = ?', [movieId]);
          if (!results.length) {
               return res.status(404).json({ error: 'Movie not found' });
          }
          res.json(results[0]);
     } catch (err) {
          console.error('Database error:', err);
          res.status(500).json({ error: 'Database error' });
     }
});
app.get('/movies/:id', async (req, res) => {
     const movieId = req.params.id;
     try {
          const results = await queryDB('SELECT * FROM movieslist WHERE id = ?', [movieId]);
          if (!results.length) {
               return res.status(404).json({ error: 'Movie not found' });
          }
          res.json(results[0]);
     } catch (err) {
          console.error('Database error:', err);
          res.status(500).json({ error: 'Database error' });
     }
});


// Google OAuth login endpoint
app.post('/google-login', async (req, res) => {
     console.log('Google login request received', { username: req.body.username, email: req.body.email });
     const { email, username } = req.body;

     if (!email || !username) {
          return res.status(400).json({ error: 'Email and username are required' });
     }

     try {
          // Check if user already exists
          console.log('Checking if user exists...');
          const existingUsers = await Promise.race([
               queryDB('SELECT * FROM users WHERE email = ?', [email]),
               new Promise((_, reject) => setTimeout(() => reject(new Error('Database query timeout')), 10000))
          ]);

          if (existingUsers.length > 0) {
               console.log('User already exists:', existingUsers[0]);
               return res.json({
                    id: existingUsers[0].id,
                    username: existingUsers[0].username,
                    email: existingUsers[0].email,
                    premium: existingUsers[0].premium === 1, // Include premium status
                    message: 'Login successful'
               });
          }

          // Create new user with premium defaulting to false (0)
          console.log('Creating new user...');
          const result = await Promise.race([
               queryDB('INSERT INTO users (username, email, password, premium) VALUES (?, ?, ?, ?)',
                    [username, email, 'google-auth', 0]), // Set premium to 0 by default
               new Promise((_, reject) => setTimeout(() => reject(new Error('Database insert timeout')), 10000))
          ]);

          console.log('New user created:', { id: result.insertId, username, email });
          res.json({
               id: result.insertId,
               username,
               email,
               premium: false, // New users start with premium false
               message: 'Account created and login successful'
          });
     } catch (err) {
          console.error('Error during Google login:', err);

          if (err.code === 'ETIMEDOUT' || err.message === 'Database query timeout' || err.message === 'Database insert timeout') {
               res.status(503).json({ error: 'Database connection timeout. Please try again.' });
          } else if (err.code === 'ECONNREFUSED') {
               res.status(503).json({ error: 'Database connection refused. Please check database server.' });
          } else if (err.code === 'ER_DUP_ENTRY') {
               res.status(409).json({ error: 'User already exists with this email.' });
          } else {
               res.status(500).json({ error: 'Internal server error: ' + err.message });
          }
     }
});

// 3. User login
app.post('/login', async (req, res) => {
     console.log('Login request received');
     const { username, password } = req.body;

     if (!username || !password) {
          return res.status(400).json({ error: 'Username and password are required' });
     }


     try {
          const query = 'SELECT * FROM users WHERE (username = ? OR email = ?) AND password = ?';
          const results = await queryDB(query, [username, username, password]);

          if (results.length > 0) {
               console.log('User found:', results[0]);
               return res.json({
                    ...results[0],
                    premium: results[0].premium === 1 // Convert tinyint to boolean
               });
          } else {
               console.log('Invalid credentials');
               return res.status(401).json({ error: 'Invalid username or password' });
          }
     } catch (err) {
          console.error('Database error:', err);
          res.status(500).json({ error: 'Database error' });
     }
});
// Check premium status endpoint
app.get('/check-premium/:userId', async (req, res) => {
     const userId = req.params.userId;

     if (!userId) {
          return res.status(400).json({
               success: false,
               error: 'User ID is required'
          });
     }

     try {
          // Get user premium status from database
          const userResults = await queryDB('SELECT premium FROM users WHERE id = ?', [userId]);

          if (userResults.length === 0) {
               return res.status(404).json({
                    success: false,
                    error: 'User not found'
               });
          }

          const isPremium = userResults[0].premium === 1;

          res.json({
               success: true,
               isPremium: isPremium,
               userId: userId
          });

     } catch (err) {
          console.error('Error checking premium status:', err);
          res.status(500).json({
               success: false,
               error: 'Error checking premium status'
          });
     }
});

// Get user ID by username endpoint
app.get('/get-user-id/:username', async (req, res) => {
     const username = req.params.username;

     if (!username) {
          return res.status(400).json({
               error: 'Username is required'
          });
     }

     try {
          const userResults = await queryDB('SELECT id FROM users WHERE username = ?', [username]);

          if (userResults.length === 0) {
               return res.status(404).json({
                    error: 'User not found'
               });
          }

          res.json({
               id: userResults[0].id,
               username: username
          });

     } catch (err) {
          console.error('Error fetching user ID:', err);
          res.status(500).json({
               error: 'Error fetching user ID'
          });
     }
});
// 4. User registration
app.post('/register', async (req, res) => {
     console.log('Registration request received');
     console.log('Request body:', req.body);
     const { username, email, password } = req.body;

     if (!username || !email || !password) {
          return res.status(400).json({ error: 'Missing required fields' });
     }

     try {
          // Check if user already exists
          const existingUsers = await queryDB('SELECT * FROM users WHERE email = ? OR username = ?', [email, username]);

          if (existingUsers.length > 0) {
               return res.status(409).json({ error: 'User already exists' });
          }

          // Create new user
          const result = await queryDB('INSERT INTO users (username, email, password) VALUES (?, ?, ?)', [username, email, password]);
          res.json({ success: true, id: result.insertId });

     } catch (err) {
          console.error('Error creating user:', err);
          res.status(500).json({ error: 'Error creating user' });
     }
});

// 5. Create Mux direct upload URL
app.post('/mux-direct-upload', async (req, res) => {
     try {
          const upload = await mux.video.uploads.create({
               new_asset_settings: { 
                    playback_policy: 'public'
                    // Remove deprecated options
               },
               cors_origin: '*'
          });
          res.json({ url: upload.url, uploadId: upload.id });
     } catch (err) {
          console.error('Mux direct upload error:', err);
          res.status(500).json({ error: 'Mux direct upload failed: ' + err.message });
     }
});

// 6. Check Mux asset status
app.get('/mux-asset-status/:uploadId', async (req, res) => {
     console.log(`Checking Mux asset status for upload ID: ${req.params.uploadId}`);
     try {
          const upload = await mux.video.uploads.retrieve(req.params.uploadId);
          if (upload.asset_id) {
               const asset = await mux.video.assets.retrieve(upload.asset_id);
               const playbackId = asset.playback_ids && asset.playback_ids.length > 0
                    ? asset.playback_ids[0].id
                    : null;
               return res.json({ ready: asset.status === 'ready', playbackId });
          }
          res.json({ ready: false });
     } catch (err) {
          console.error('Mux asset status error:', err);
          res.status(500).json({ error: 'Mux asset status failed: ' + err.message });
     }
});

// 7. Upload movie with Mux playback ID
app.post('/upload-movie-mux', async (req, res) => {
     const { movieTitle, description, playbackId } = req.body;

     if (!movieTitle || !description || !playbackId) {
          return res.status(400).json({ error: 'Missing required fields' });
     }

     try {
          const result = await queryDB('INSERT INTO movieslist (movie_title, description, mux_playback_id) VALUES (?, ?, ?)',
               [movieTitle, description, playbackId]);
          res.json({ success: true, id: result.insertId });
     } catch (err) {
          console.error('Error uploading movie:', err);
          res.status(500).json({ error: 'Error uploading movie' });
     }
});

// 8. Upload trailer and poster to ImageKit
app.post('/upload-trailer-poster/:id', memoryUpload.fields([
     { name: 'trailer', maxCount: 1 },
     { name: 'poster', maxCount: 1 }
]), async (req, res) => {
     console.log(`Upload trailer and poster for movie ID: ${req.params.id}`);

     const movieId = req.params.id;
     const trailerBuffer = req.files?.trailer?.[0]?.buffer;
     const posterBuffer = req.files?.poster?.[0]?.buffer;
     const movieTitle = req.body.title || 'Untitled Movie';

     if (!trailerBuffer || !posterBuffer) {
          return res.status(400).json({ error: 'Both trailer and poster files are required' });
     }

     try {
          const safeTitle = movieTitle.replace(/[^a-z0-9]/gi, '_');

          // Upload trailer to ImageKit
          const trailerResponse = await imagekit.upload({
               file: trailerBuffer,
               fileName: `${safeTitle}-trailer-${movieId}.mp4`,
               isPrivateFile: false,
               folder: '/trailers'
          });

          // Upload poster to ImageKit
          const posterResponse = await imagekit.upload({
               file: posterBuffer,
               fileName: `${safeTitle}-poster-${movieId}.jpg`,
               isPrivateFile: false,
               folder: '/posters'
          });

          console.log('Trailer uploaded to ImageKit:', trailerResponse.url);
          console.log('Poster uploaded to ImageKit:', posterResponse.url);

          // Update database with ImageKit URLs
          await queryDB('UPDATE movieslist SET trailer = ?, poster = ? WHERE id = ?',
               [trailerResponse.url, posterResponse.url, movieId]);

          console.log(`Successfully updated movie ${movieId} with ImageKit URLs`);
          res.json({
               success: true,
               trailerUrl: trailerResponse.url,
               posterUrl: posterResponse.url
          });

     } catch (error) {
          console.error('Error uploading to ImageKit:', error);
          res.status(500).json({ error: 'Error uploading to ImageKit: ' + error.message });
     }
});

// **SERIES APIs - Updated with better error handling**

// Get all series
app.get('/series', async (req, res) => {
     console.log('Series list requested');
     try {
          const results = await queryDB('SELECT * FROM series ORDER BY id DESC');
          console.log('Series fetched:', results);
          res.json(results);
     } catch (err) {
          console.error('Error fetching series:', err);
          res.status(500).json({ error: 'Error fetching series' });
     }
});

// Get single series by ID
app.get('/series/:id', async (req, res) => {
     const seriesId = req.params.id;
     try {
          const results = await queryDB('SELECT * FROM series WHERE id = ?', [seriesId]);
          if (!results.length) {
               return res.status(404).json({ error: 'Series not found' });
          }
          res.json(results[0]);
     } catch (err) {
          console.error('Database error:', err);
          res.status(500).json({ error: 'Database error' });
     }
});



// Create Series Mux direct upload URL
app.post('/series-mux-direct-upload', async (req, res) => {
     console.log('Creating Series Mux direct upload...');
     try {
          const upload = await seriesMux.video.uploads.create({
               new_asset_settings: { 
                    playback_policy: 'public'
                    // Remove the deprecated mp4_support and master_access options
               },
               cors_origin: '*'
          });
          
          console.log('Series Mux upload created:', upload.id);
          res.json({ url: upload.url, uploadId: upload.id });
     } catch (err) {
          console.error('Series Mux direct upload error:', err);
          res.status(500).json({ error: 'Series Mux direct upload failed: ' + err.message });
     }
});

// Check Series Mux asset status
app.get('/series-mux-asset-status/:uploadId', async (req, res) => {
     const uploadId = req.params.uploadId;
     console.log(`Checking Series Mux asset status for upload ID: ${uploadId}`);
     
     try {
          const upload = await seriesMux.video.uploads.retrieve(uploadId);
          console.log('Series Mux upload status:', upload.status);
          
          if (upload.asset_id) {
               const asset = await seriesMux.video.assets.retrieve(upload.asset_id);
               console.log('Series Mux asset status:', asset.status);
               
               const playbackId = asset.playback_ids && asset.playback_ids.length > 0
                    ? asset.playback_ids[0].id
                    : null;
               
               console.log('Series Mux playback ID:', playbackId);
               
               return res.json({ 
                    ready: asset.status === 'ready', 
                    playbackId: playbackId,
                    status: asset.status,
                    assetId: asset.id
               });
          }
          
          res.json({ ready: false, status: upload.status });
     } catch (err) {
          console.error('Series Mux asset status error:', err);
          res.status(500).json({ error: 'Series Mux asset status failed: ' + err.message });
     }
});

// Upload series with poster to ImageKit and video to Mux
app.post('/upload-series', memoryUpload.fields([
     { name: 'poster', maxCount: 1 },
     { name: 'video', maxCount: 1 }
]), async (req, res) => {
     console.log('Upload series request received');
     console.log('Request body:', req.body);
     console.log('Files:', req.files);

     const { title, description, playbackId } = req.body;
     const posterBuffer = req.files?.poster?.[0]?.buffer;

     if (!title || !posterBuffer) {
          console.log('Missing required fields:', { title: !!title, poster: !!posterBuffer });
          return res.status(400).json({ error: 'Title and poster are required' });
     }

     try {
          const safeTitle = title.replace(/[^a-z0-9]/gi, '_');
          const timestamp = Date.now();

          console.log('Uploading poster to Series ImageKit...');
          
          // Upload poster to Series ImageKit
          const posterResponse = await seriesImagekit.upload({
               file: posterBuffer,
               fileName: `${safeTitle}-poster-${timestamp}.jpg`,
               isPrivateFile: false,
               folder: '/series/posters',
               tags: ['series', 'poster', safeTitle]
          });

          console.log('Poster uploaded successfully:', posterResponse.url);

          // Store only playback ID in video field, not the full URL
          const videoData = playbackId || '';
          console.log('Storing playback ID in video field:', videoData);

          // Save to database - store only playback ID in video field
          console.log('Saving series to database...');
          const result = await queryDB(
               'INSERT INTO series (title, description, poster, video) VALUES (?, ?, ?, ?)',
               [title, description || '', posterResponse.url, videoData]
          );

          console.log(`Successfully saved series with ID: ${result.insertId}`);
          
          res.json({
               success: true,
               id: result.insertId,
               posterUrl: posterResponse.url,
               playbackId: playbackId,
               message: 'Series uploaded successfully'
          });

     } catch (error) {
          console.error('Error uploading series:', error);
          console.error('Error details:', error.response?.data || error.message);
          
          res.status(500).json({ 
               error: 'Error uploading series: ' + error.message,
               details: error.response?.data || 'No additional details'
          });
     }
});

// premium handles
app.post('/create-order', async (req, res) => {
     console.log('Create order request:', req.body);

     const { amount, currency = 'INR', receipt, userId } = req.body;

     // Validation
     if (!amount || amount <= 0) {
          return res.status(400).json({
               success: false,
               error: 'Valid amount is required'
          });
     }

     try {
          // Create order with Razorpay with minimal verification
          const options = {
               amount: parseInt(amount),
               currency: currency,
               receipt: receipt || `rcpt_${Date.now()}_${userId || 'anon'}`,
               notes: {
                    user_id: userId || '',
                    created_at: new Date().toISOString(),
                    skip_verification: 'true' // Note for internal tracking
               },
               // Add payment capture settings
               payment_capture: 1, // Auto capture
          };

          console.log('Creating Razorpay order with options:', options);

          const razorpayOrder = await razorpay.orders.create(options);

          console.log('Razorpay order created:', razorpayOrder);

          // Store order in database
          const result = await queryDB(
               'INSERT INTO orders (razorpay_order_id, amount, currency, receipt, status, user_id) VALUES (?, ?, ?, ?, ?, ?)',
               [razorpayOrder.id, amount, currency, razorpayOrder.receipt, 'created', userId || null]
          );

          console.log('Order saved to database with ID:', result.insertId);

          res.json({
               success: true,
               id: razorpayOrder.id,
               amount: razorpayOrder.amount,
               currency: razorpayOrder.currency,
               receipt: razorpayOrder.receipt,
               orderId: result.insertId
          });

     } catch (err) {
          console.error('Error creating Razorpay order:', err);

          if (err.statusCode) {
               res.status(err.statusCode).json({
                    success: false,
                    error: `Payment service error: ${err.error?.description || err.message}`
               });
          } else {
               res.status(500).json({
                    success: false,
                    error: 'Failed to create payment order. Please try again.'
               });
          }
     }
});

// Update the verify-payment endpoint
app.post('/verify-payment', async (req, res) => {
     const { razorpay_order_id, razorpay_payment_id, razorpay_signature, user_id, plan_id } = req.body;

     if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
          return res.status(400).json({ error: 'All payment parameters are required' });
     }

     try {
          // Verify signature
          const generated_signature = crypto
               .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
               .update(razorpay_order_id + '|' + razorpay_payment_id)
               .digest('hex');

          if (generated_signature !== razorpay_signature) {
               return res.status(400).json({ error: 'Invalid payment signature' });
          }

          // Update order status in database
          await queryDB(
               'UPDATE orders SET status = ?, razorpay_payment_id = ?, razorpay_signature = ?, updated_at = NOW() WHERE razorpay_order_id = ?',
               ['paid', razorpay_payment_id, razorpay_signature, razorpay_order_id]
          );

          // **NEW: Update user premium status to true**
          if (user_id) {
               await queryDB(
                    'UPDATE users SET premium = 1 WHERE id = ?',
                    [user_id]
               );
               console.log(`User ${user_id} premium status updated to true`);
          }

          // Create user subscription if user_id and plan_id are provided
          if (user_id && plan_id) {
               let duration_months = 1; // default
               switch (plan_id) {
                    case 'basic': duration_months = 1; break;
                    case 'premium': duration_months = 3; break;
                    case 'ultimate': duration_months = 12; break;
               }

               // Check if user_subscriptions table exists, if not create it
               try {
                    await queryDB(`
                    CREATE TABLE IF NOT EXISTS user_subscriptions (
                        id INT PRIMARY KEY AUTO_INCREMENT,
                        user_id INT,
                        plan_type VARCHAR(50),
                        start_date DATE,
                        end_date DATE,
                        status ENUM('active', 'expired', 'cancelled') DEFAULT 'active',
                        payment_id VARCHAR(255),
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (user_id) REFERENCES users(id)
                    )
                `);

                    // Insert subscription
                    await queryDB(
                         'INSERT INTO user_subscriptions (user_id, plan_type, start_date, end_date, payment_id) VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL ? MONTH), ?)',
                         [user_id, plan_id, duration_months, razorpay_payment_id]
                    );
               } catch (tableError) {
                    console.error('Error creating/updating subscription:', tableError);
                    // Continue without failing the payment verification
               }
          }

          res.json({
               success: true,
               message: 'Payment verified successfully',
               payment_id: razorpay_payment_id,
               premium_updated: true
          });

     } catch (err) {
          console.error('Error verifying payment:', err);
          res.status(500).json({ error: 'Error verifying payment' });
     }
});

app.get('/access/:userId', async (req, res) => {
     const userId = req.params.userId;

     if (!userId) {
          return res.status(400).json({ error: 'User ID is required' });
     }

     try {
          // Check if user has an active subscription
          const results = await queryDB(
               'SELECT * FROM user_subscriptions WHERE user_id = ? AND status = ?',
               [userId, 'active']
          );

          if (results.length > 0) {
               return res.json({ access: true, subscription: results[0] });
          } else {
               return res.json({ access: false, message: 'No active subscription found' });
          }
     } catch (err) {
          console.error('Error checking access:', err);
          res.status(500).json({ error: 'Error checking access' });
     }
}
);

// Optional: Add webhook handler for Razorpay
app.post('/razorpay-webhook', (req, res) => {
     const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
     const signature = req.headers['x-razorpay-signature'];

     if (secret) {
          const generated_signature = crypto
               .createHmac('sha256', secret)
               .update(JSON.stringify(req.body))
               .digest('hex');

          if (generated_signature !== signature) {
               return res.status(400).json({ error: 'Invalid webhook signature' });
          }
     }

     const event = req.body.event;
     const payment = req.body.payload.payment.entity;

     switch (event) {
          case 'payment.captured':
               console.log('Payment captured:', payment.id);
               break;
          case 'payment.failed':
               console.log('Payment failed:', payment.id);
               break;
          default:
               console.log('Unhandled event:', event);
     }

     res.json({ status: 'ok' });
});

// Add subscription check endpoint
app.get('/check-subscription/:userId', async (req, res) => {
     const userId = req.params.userId;

     if (!userId) {
          return res.status(400).json({
               hasSubscription: false,
               error: 'User ID is required'
          });
     }

     try {
          // First check if user has premium field set to true
          const userResults = await queryDB(
               'SELECT premium FROM users WHERE id = ?',
               [userId]
          );

          if (userResults.length > 0 && userResults[0].premium === 1) {
               console.log(`User ${userId} has premium status from users table`);
               return res.json({
                    hasSubscription: true,
                    premium: true,
                    source: 'user_premium_field'
               });
          }

          // Also check user_subscriptions table for active subscription
          const subscriptionResults = await queryDB(
               'SELECT * FROM user_subscriptions WHERE user_id = ? AND status = ? AND end_date > NOW()',
               [userId, 'active']
          );

          if (subscriptionResults.length > 0) {
               console.log(`User ${userId} has active subscription from subscriptions table`);
               return res.json({
                    hasSubscription: true,
                    subscription: subscriptionResults[0],
                    source: 'subscription_table'
               });
          } else {
               console.log(`User ${userId} has no active subscription`);
               return res.json({
                    hasSubscription: false,
                    message: 'No active subscription found'
               });
          }
     } catch (err) {
          console.error('Error checking subscription:', err);
          res.status(500).json({
               hasSubscription: false,
               error: 'Error checking subscription'
          });
     }
});
// Add a test endpoint to verify CORS
app.get('/test-cors', (req, res) => {
     res.json({
          message: 'CORS is working!',
          origin: req.headers.origin,
          timestamp: new Date().toISOString()
     });
});

// Health check endpoint
app.get('/health', (req, res) => {
     res.json({
          status: 'OK',
          timestamp: new Date().toISOString(),
          uptime: process.uptime()
     });
});



// Add this new endpoint after your other endpoints
app.get('/check-premium/:userId', async (req, res) => {
     const userId = req.params.userId;

     if (!userId) {
          return res.status(400).json({
               success: false,
               error: 'User ID is required'
          });
     }

     try {
          const results = await queryDB(
               'SELECT id, username, email, premium FROM users WHERE id = ?',
               [userId]
          );

          if (results.length > 0) {
               const user = results[0];
               const isPremium = user.premium === 1;

               console.log(`Premium check for user ${userId}: ${isPremium}`);

               res.json({
                    success: true,
                    user: {
                         id: user.id,
                         username: user.username,
                         email: user.email,
                         premium: isPremium
                    },
                    isPremium: isPremium
               });
          } else {
               res.status(404).json({
                    success: false,
                    error: 'User not found'
               });
          }
     } catch (err) {
          console.error('Error checking premium status:', err);
          res.status(500).json({
               success: false,
               error: 'Error checking premium status'
          });
     }
});
// Add endpoint to manually set premium status (for testing)
app.post('/set-premium/:userId', async (req, res) => {
     const userId = req.params.userId;
     const { premium } = req.body; // true or false

     if (!userId) {
          return res.status(400).json({ error: 'User ID is required' });
     }

     try {
          await queryDB(
               'UPDATE users SET premium = ? WHERE id = ?',
               [premium ? 1 : 0, userId]
          );

          res.json({
               success: true,
               message: `User ${userId} premium status set to ${premium}`,
               premium: premium
          });
     } catch (err) {
          console.error('Error setting premium status:', err);
          res.status(500).json({ error: 'Error setting premium status' });
     }
});
app.post('/apply-promo', async (req, res) => {
     console.log('Promo code application request:', req.body);

     const { promoCode, userId } = req.body;

     if (!promoCode || !userId) {
          return res.status(400).json({
               success: false,
               error: 'Promo code and user ID are required'
          });
     }

     try {
          // Check if user exists
          const userResults = await queryDB('SELECT * FROM users WHERE id = ?', [userId]);

          if (userResults.length === 0) {
               return res.status(404).json({
                    success: false,
                    error: 'User not found'
               });
          }

          // Check if user already has premium
          if (userResults[0].premium === 1) {
               return res.json({
                    success: false,
                    error: 'You already have premium access'
               });
          }

          // Validate promo code (case insensitive)
          const validPromoCodes = ['USEOLI', 'FREEACCESS', 'PREMIUM2024'];
          const normalizedPromoCode = promoCode.trim().toUpperCase();

          if (!validPromoCodes.includes(normalizedPromoCode)) {
               console.log(`Invalid promo code attempted: ${normalizedPromoCode}`);
               return res.json({
                    success: false,
                    error: 'Invalid promo code. Please check and try again.'
               });
          }

          console.log(`Applying promo code ${normalizedPromoCode} for user ${userId}`);

          // Check if user has already used this promo code
          const existingPromo = await queryDB(
               'SELECT * FROM promo_codes WHERE user_id = ? AND promo_code = ?',
               [userId, normalizedPromoCode]
          );

          if (existingPromo.length > 0) {
               return res.json({
                    success: false,
                    error: 'You have already used this promo code'
               });
          }

          // Update user premium status
          await queryDB(
               'UPDATE users SET premium = 1 WHERE id = ?',
               [userId]
          );

          // Record promo code usage
          await queryDB(
               'INSERT INTO promo_codes (user_id, promo_code, duration_days) VALUES (?, ?, ?)',
               [userId, normalizedPromoCode, 30] // 30 days free access
          );

          // Create user subscription entry if table exists
          try {
               await queryDB(`
                    CREATE TABLE IF NOT EXISTS user_subscriptions (
                         id INT PRIMARY KEY AUTO_INCREMENT,
                         user_id INT,
                         plan_type VARCHAR(50),
                         start_date DATE,
                         end_date DATE,
                         status ENUM('active', 'expired', 'cancelled') DEFAULT 'active',
                         payment_id VARCHAR(255),
                         promo_code VARCHAR(50),
                         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                         FOREIGN KEY (user_id) REFERENCES users(id)
                    )
               `);

               // Insert subscription record
               await queryDB(
                    'INSERT INTO user_subscriptions (user_id, plan_type, start_date, end_date, promo_code) VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 30 DAY), ?)',
                    [userId, 'promo', normalizedPromoCode]
               );
          } catch (subscriptionError) {
               console.error('Error creating subscription record:', subscriptionError);
               // Continue without failing the main operation
          }

          console.log(`Promo code ${normalizedPromoCode} successfully applied for user ${userId}`);

          res.json({
               success: true,
               message: 'Promo code applied successfully! You now have 30 days of premium access.',
               promoCode: normalizedPromoCode,
               durationDays: 30,
               premiumUntil: new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)).toISOString()
          });

     } catch (err) {
          console.error('Error applying promo code:', err);

          if (err.code === 'ER_DUP_ENTRY') {
               res.status(409).json({
                    success: false,
                    error: 'You have already used this promo code'
               });
          } else {
               res.status(500).json({
                    success: false,
                    error: 'Error applying promo code. Please try again.'
               });
          }
     }
});

// Get user promo code history
app.get('/user-promos/:userId', async (req, res) => {
     const userId = req.params.userId;

     if (!userId) {
          return res.status(400).json({ error: 'User ID is required' });
     }

     try {
          const promos = await queryDB(
               'SELECT promo_code, applied_at, duration_days, status FROM promo_codes WHERE user_id = ? ORDER BY applied_at DESC',
               [userId]
          );

          res.json({
               success: true,
               promos: promos
          });
     } catch (err) {
          console.error('Error fetching user promos:', err);
          res.status(500).json({
               success: false,
               error: 'Error fetching promo history'
          });
     }
});

// Validate promo code without applying (optional endpoint for checking)
app.post('/validate-promo', async (req, res) => {
     const { promoCode, userId } = req.body;

     if (!promoCode) {
          return res.status(400).json({
               valid: false,
               error: 'Promo code is required'
          });
     }

     try {
          const validPromoCodes = ['USEOLI', 'FREEACCESS', 'PREMIUM2024'];
          const normalizedPromoCode = promoCode.trim().toUpperCase();

          if (!validPromoCodes.includes(normalizedPromoCode)) {
               return res.json({
                    valid: false,
                    error: 'Invalid promo code'
               });
          }

          // If userId provided, check if already used
          if (userId) {
               const existingPromo = await queryDB(
                    'SELECT * FROM promo_codes WHERE user_id = ? AND promo_code = ?',
                    [userId, normalizedPromoCode]
               );

               if (existingPromo.length > 0) {
                    return res.json({
                         valid: false,
                         error: 'Promo code already used'
                    });
               }
          }

          res.json({
               valid: true,
               promoCode: normalizedPromoCode,
               durationDays: 30,
               message: 'Valid promo code - 30 days premium access'
          });

     } catch (err) {
          console.error('Error validating promo code:', err);
          res.status(500).json({
               valid: false,
               error: 'Error validating promo code'
          });
     }
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
