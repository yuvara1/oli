require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mysql = require('mysql2');
const multer = require('multer');
const ImageKit = require("imagekit");
const { Mux } = require('@mux/mux-node');
const app = express();
const port = 3000;

// CORS configuration
app.use(cors({
     origin: [
          'http://localhost:5173',
          'http://localhost:3000',
          'https://your-frontend-domain.com'
     ],
     credentials: true,
     methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
     allowedHeaders: ['Content-Type', 'Authorization']
}));

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

// Series ImageKit configuration (separate from movies)
const seriesImagekit = new ImageKit({
     publicKey: process.env.SERIES_IMAGEKIT_PUBLIC_KEY,
     privateKey: process.env.SERIES_IMAGEKIT_PRIVATE_KEY,
     urlEndpoint: process.env.SERIES_IMAGEKIT_URL_ENDPOINT
});

// Mux configuration
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

app.post('/google-login', async (req, res) => {
     console.log('Google login request received', { username: req.body.username, email: req.body.email });
     const { email, username } = req.body;

     if (!email || !username) {
          return res.status(400).json({ error: 'Email and username are required' });
     }

     try {
          // Check if user already exists with longer timeout
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
                    message: 'Login successful'
               });
          }

          // Create new user
          console.log('Creating new user...');
          const result = await Promise.race([
               queryDB('INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
                    [username, email, 'google-auth']),
               new Promise((_, reject) => setTimeout(() => reject(new Error('Database insert timeout')), 10000))
          ]);

          console.log('New user created:', { id: result.insertId, username, email });
          res.json({
               id: result.insertId,
               username,
               email,
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
               return res.json(results[0]);
          } else {
               console.log('Invalid credentials');
               return res.status(401).json({ error: 'Invalid username or password' });
          }
     } catch (err) {
          console.error('Database error:', err);
          res.status(500).json({ error: 'Database error' });
     }
});

// 4. User registration
app.post('/register', async (req, res) => {
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
               new_asset_settings: { playback_policy: 'public' },
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

// Upload series to ImageKit and save to database
app.post('/upload-series', memoryUpload.fields([
     { name: 'poster', maxCount: 1 },
     { name: 'video', maxCount: 1 }
]), async (req, res) => {
     console.log('Upload series request received');

     const { title, description } = req.body;
     const posterBuffer = req.files?.poster?.[0]?.buffer;
     const videoBuffer = req.files?.video?.[0]?.buffer;

     if (!title || !posterBuffer || !videoBuffer) {
          return res.status(400).json({ error: 'Title, poster, and video are required' });
     }

     try {
          const safeTitle = title.replace(/[^a-z0-9]/gi, '_');
          const timestamp = Date.now();

          // Upload poster to Series ImageKit
          const posterResponse = await seriesImagekit.upload({
               file: posterBuffer,
               fileName: `${safeTitle}-poster-${timestamp}.jpg`,
               isPrivateFile: false,
               folder: '/series/posters'
          });

          // Upload video to Series ImageKit
          const videoResponse = await seriesImagekit.upload({
               file: videoBuffer,
               fileName: `${safeTitle}-video-${timestamp}.mp4`,
               isPrivateFile: false,
               folder: '/series/videos'
          });

          console.log('Poster uploaded to Series ImageKit:', posterResponse.url);
          console.log('Video uploaded to Series ImageKit:', videoResponse.url);

          // Save to database
          const result = await queryDB('INSERT INTO series (title, description, poster, video) VALUES (?, ?, ?, ?)',
               [title, description || '', posterResponse.url, videoResponse.url]);

          console.log(`Successfully saved series ${result.insertId}`);
          res.json({
               success: true,
               id: result.insertId,
               posterUrl: posterResponse.url,
               videoUrl: videoResponse.url
          });

     } catch (error) {
          console.error('Error uploading to Series ImageKit:', error);
          res.status(500).json({ error: 'Error uploading to ImageKit: ' + error.message });
     }
});

// Delete series
app.delete('/series/:id', async (req, res) => {
     const seriesId = req.params.id;
     try {
          await queryDB('DELETE FROM series WHERE id = ?', [seriesId]);
          res.json({ success: true, message: 'Series deleted successfully' });
     } catch (err) {
          console.error('Error deleting series:', err);
          res.status(500).json({ error: 'Error deleting series' });
     }
});

// Start server
app.listen(port, () => {
     console.log(`Server is running on http://localhost:${port}`);
});

