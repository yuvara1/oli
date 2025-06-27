require('dotenv').config(); // Add this at the very top
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mysql = require('mysql2');
const multer = require('multer');
const path = require('path');
const ImageKit = require("imagekit");
const { Mux } = require('@mux/mux-node');
const fs = require('fs');
const app = express();
const port = process.env.PORT || 3000; // Use Render's PORT or fallback to 3000

// Multer config for other uploads (not used for direct Mux upload)
const upload = multer({
     storage: multer.diskStorage({
          destination: (req, file, cb) => cb(null, 'uploads/'),
          filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
     }),
     limits: { fileSize: 5 * 1024 * 1024 * 1024 } // 5GB
});

const memoryUpload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(bodyParser.json({ limit: '1024mb' }));
app.use(bodyParser.urlencoded({ limit: '1024mb', extended: true }));

// MySQL connection
const db = mysql.createConnection({
     host: process.env.MYSQL_HOST,
     port: process.env.MYSQL_PORT,
     user: process.env.MYSQL_USER,
     password: process.env.MYSQL_PASSWORD,
     database: process.env.MYSQL_DATABASE,
});

let dbConnected = false;
db.connect((err) => {
     dbConnected = !err;
     if (err) console.error('Database connection failed:', err);
     else console.log('Connected to MySQL database');
});

// ImageKit configuration
const imagekit = new ImageKit({
     publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
     privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
     urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
});

app.get("/imagekit-auth", (req, res) => {
     const result = imagekit.getAuthenticationParameters();
     res.json(result);
});

// Upload movie (video + poster)
app.post('/upload-movie', upload.fields([
     { name: 'video', maxCount: 1 },
     { name: 'poster', maxCount: 1 }
]), (req, res) => {
     console.log('Upload request received');
     console.log('Request body:', req.body);
     if (!dbConnected) return res.status(500).send('Database not connected');
     const { movieTitle, description } = req.body;
     const videoBuffer = req.files?.video?.[0]?.buffer;
     const posterBuffer = req.files?.poster?.[0]?.buffer;
     if (!movieTitle || !description || !videoBuffer) {
          return res.status(400).send('Missing required fields');
     }
     const sql = 'INSERT INTO movieslist (movie_title, description, video, poster) VALUES (?, ?, ?, ?)';
     db.query(sql, [movieTitle, description, videoBuffer, posterBuffer], (err, result) => {
          if (err) return res.status(500).send('Error uploading movie');
          res.json({ success: true, id: result.insertId });
     });
});

app.post('/google-register', (req, res) => {
     const { username, email } = req.body;
     if (!email) return res.status(400).send('Email is required');
     // Check if user already exists
     db.query('SELECT * FROM users WHERE email = ? or username = ?', [email, username], (err, results) => {
          if (err) return res.status(500).send('Database error');
          if (results.length > 0) {
               // User already exists
               return res.status(409).send('User already exists');
          } else {
               // Create new user
               const sql = 'INSERT INTO users (username,email) VALUES (?,?)';
               db.query(sql, [email, username], (err2, result) => {
                    if (err2) return res.status(500).send('Error creating user');
                    res.json({ success: true, id: result.insertId });
               });
          }
     });
})

app.get('/google-login', (req, res) => {
     const { email } = req.body;
     if (!email) return res.status(400).send('Email is required');
     // Check if user exists
     db.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
          if (err) return res.status(500).send('Database error');
          if (results.length > 0) {
               // User exists, return user data
               return res.json(results[0]);
          } else {
               // User does not exist, create new user
               const sql = 'INSERT INTO users (email) VALUES (?)';
               db.query(sql, [email], (err2, result) => {
                    if (err2) return res.status(500).send('Error creating user');
                    res.json({ success: true, id: result.insertId });
               });
          }
     });
}
)
app.post('/register', (req, res) => {
     const { username, email, password } = req.body;
     if (!username || !email || !password) {
          return res.status(400).send('Missing required fields');
     }
     // Check if user already exists
     db.query('SELECT * FROM users WHERE email = ? OR username = ?', [email, username], (err, results) => {
          if (err) return res.status(500).send('Database error');
          if (results.length > 0) {
               // User already exists
               return res.status(409).send('User already exists');
          } else {
               // Create new user
               const sql = 'INSERT INTO users (username, email, password) VALUES (?, ?, ?)';
               db.query(sql, [username, email, password], (err2, result) => {
                    if (err2) return res.status(500).send('Error creating user');
                    res.json({ success: true, id: result.insertId });
               });
          }
     });
})




// Upload movie (poster only) with Mux playback ID
app.post('/upload-movie-mux', (req, res) => {
     if (!dbConnected) return res.status(500).send('Database not connected');
     const { movieTitle, description, playbackId } = req.body;
     if (!movieTitle || !description || !playbackId) {
          return res.status(400).send('Missing required fields');
     }
     const sql = 'INSERT INTO movieslist (movie_title, description, mux_playback_id) VALUES (?, ?, ?)';
     db.query(sql, [movieTitle, description, playbackId], (err, result) => {
          if (err) return res.status(500).send('Error uploading movie');
          // Return the inserted movie id so the client can upload the video next
          res.json({ success: true, id: result.insertId });
     });
});

// Serve movie video (streaming with HTTP Range support)
app.get('/movie-video/:id', (req, res) => {
     console.log(`Request for video of movie ID: ${req.params.id}`);
     if (!dbConnected) return res.status(500).send('Database not connected');
     const movieId = req.params.id;
     db.query('SELECT trailer FROM movieslist WHERE id = ?', [movieId], (err, results) => {
          if (err || !results.length || !results[0].trailer) {
               console.error(`Error fetching video for movie ID ${movieId}:`, err);
               return res.status(404).send('Movie not found or trailer not available');
          }
          const video = results[0].trailer;
          const range = req.headers.range;
          if (!range) {
               res.writeHead(200, {
                    'Content-Type': 'video/mp4',
                    'Content-Length': video.length
               });
               return res.end(video);
          }
          const parts = range.replace(/bytes=/, "").split("-");
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : video.length - 1;
          const chunkSize = end - start + 1;
          res.writeHead(206, {
               'Content-Range': `bytes ${start}-${end}/${video.length}`,
               'Accept-Ranges': 'bytes',
               'Content-Length': chunkSize,
               'Content-Type': 'video/mp4'
          });
          res.end(video.slice(start, end + 1));
     });
});

// Serve movie poster
app.get('/movie-poster/:id', (req, res) => {
     const movieId = req.params.id;
     console.log(`Request for poster of movie ID: ${movieId}`);
     if (!dbConnected) return res.status(500).send('Database not connected');
     db.query('SELECT poster FROM movieslist WHERE id = ?', [movieId], (err, results) => {
          if (err || !results.length || !results[0].poster) {
               return res.sendFile(__dirname + '/public/default-poster.png');
          }
          res.writeHead(200, {
               'Content-Type': 'image/webm',
               'Content-Length': results[0].poster.length
          });
          res.end(results[0].poster);
          console.log(`Served poster for movie ID: ${res}`);
     });
});

// Get a single movie by ID
app.get('/movie/:id', (req, res) => {
     if (!dbConnected) return res.status(500).send('Database not connected');
     const movieId = req.params.id;
     db.query('SELECT * FROM movieslist WHERE id = ?', [movieId], (err, results) => {
          if (err || !results.length) return res.status(404).send('Movie not found');
          res.json(results[0]);
     });
});

// Get all movie IDs
app.get('/movie-ids', (req, res) => {
     if (!dbConnected) return res.status(500).send('Database not connected');
     db.query('SELECT id FROM movieslist', (err, results) => {
          if (err) return res.status(500).send('Error fetching movie IDs');
          res.json(results);
     });
});

// Mux credentials
const mux = new Mux({
     tokenId: process.env.MUX_TOKEN_ID,
     tokenSecret: process.env.MUX_TOKEN_SECRET
});

// Create a direct upload URL for Mux
app.post('/mux-direct-upload', async (req, res) => {
     try {

          const upload = await mux.video.uploads.create({
               new_asset_settings: { playback_policy: 'public' },
               cors_origin: '*'
          });
          res.json({ url: upload.url, uploadId: upload.id });
     } catch (err) {
          console.error('Mux direct upload error:', err);
          res.status(500).send('Mux direct upload failed: ' + err.message);
     }
});

// Poll for Mux asset status and playbackId
app.get('/mux-asset-status/:uploadId', async (req, res) => {
     console.log(`Checking Mux asset status for upload ID: ${req.params.uploadId}`);
     try {
          const upload = await mux.video.uploads.retrieve(req.params.uploadId);
          if (upload.asset_id) {
               const asset = await mux.video.assets.retrieve(upload.asset_id); // <-- FIXED HERE
               const playbackId = asset.playback_ids && asset.playback_ids.length > 0
                    ? asset.playback_ids[0].id
                    : null;
               return res.json({ ready: asset.status === 'ready', playbackId });
          }
          res.json({ ready: false });
     } catch (err) {
          console.error('Mux asset status error:', err);
          res.status(500).send('Mux asset status failed: ' + err.message);
     }
});

app.post('/upload-movie-video/:id', memoryUpload.fields([
     { name: 'video', maxCount: 1 },
     { name: 'poster', maxCount: 1 }
]), async (req, res) => {
     console.log(`Upload video/poster for movie ID: ${req.params.id}`);
     if (!dbConnected) return res.status(500).send('Database not connected');
     const movieId = req.params.id;
     const videoBuffer = req.files?.video?.[0]?.buffer;
     const posterBuffer = req.files?.poster?.[0]?.buffer || null;
     const movieTitle = req.body.title || 'Untitled Movie';
     if (!videoBuffer) {
          return res.status(400).send('No video file uploaded');
     }

     // 1. Store video in DB first (do NOT store poster buffer)
     db.query('UPDATE movieslist SET video = ? WHERE id = ?', [videoBuffer, movieId], async (err, result) => {
          if (err) {
               console.error('Error saving video', err);
               return res.status(500).send('Error saving video');
          }
          console.log(`Video uploaded for movie ID: ${movieId}`);

          // 2. Upload poster to ImageKit (if present)
          if (posterBuffer) {
               try {
                    const safeTitle = movieTitle.replace(/[^a-z0-9]/gi, '_');
                    const imagekitResponse = await imagekit.upload({
                         file: posterBuffer,
                         fileName: `${safeTitle}-${movieId}.mp4`,
                         isPrivateFile: false
                    });
                    console.log('Poster uploaded to ImageKit:', imagekitResponse);

                    // 3. Update DB with ImageKit URL
                    const imagekitUrl = imagekitResponse.url;
                    db.query(
                         'UPDATE movieslist SET poster = ? WHERE id = ?',
                         [imagekitUrl, movieId],
                         (err2) => {
                              if (err2) {
                                   console.error('Error updating ImageKit URL:', err2);
                              }
                              return res.json({ success: true, imagekitUrl });
                         }
                    );
               } catch (err) {
                    console.error('Error uploading poster to ImageKit:', err);
                    return res.json({ success: true, imagekitUrl: null, imagekitError: err.message });
               }
          } else {
               return res.json({ success: true });
          }
     });
});

app.post('/upload-movie-trailer/:id', memoryUpload.fields([
     { name: 'trailer', maxCount: 1 },
     { name: 'poster', maxCount: 1 }
]), async (req, res) => {
     if (!dbConnected) return res.status(500).send('Database not connected');
     const movieId = req.params.id;
     const trailerBuffer = req.files?.trailer?.[0]?.buffer;
     const posterBuffer = req.files?.poster?.[0]?.buffer || null;
     const movieTitle = req.body.title || 'Untitled Movie';
     if (!trailerBuffer) {
          return res.status(400).send('No trailer file uploaded');
     }

     // 1. Store trailer in DB
     db.query('UPDATE movieslist SET trailer = ? WHERE id = ?', [trailerBuffer, movieId], async (err, result) => {
          if (err) {
               console.error('Error saving trailer', err);
               return res.status(500).send('Error saving trailer');
          }
          // 2. Upload poster to ImageKit (if present)
          if (posterBuffer) {
               try {
                    const safeTitle = movieTitle.replace(/[^a-z0-9]/gi, '_');
                    const imagekitResponse = await imagekit.upload({
                         file: posterBuffer,
                         fileName: `${safeTitle}-${movieId}.mp4`,
                         isPrivateFile: false
                    });
                    const imagekitUrl = imagekitResponse.url;
                    db.query(
                         'UPDATE movieslist SET poster = ? WHERE id = ?',
                         [imagekitUrl, movieId],
                         (err2) => {
                              if (err2) {
                                   console.error('Error updating ImageKit URL:', err2);
                              }
                              return res.json({ success: true, imagekitUrl });
                         }
                    );
               } catch (err) {
                    console.error('Error uploading poster to ImageKit:', err);
                    return res.json({ success: true, imagekitUrl: null, imagekitError: err.message });
               }
          } else {
               return res.json({ success: true });
          }
     });
});

app.post('/login', (req, res) => {
     console.log('fh')
     const { username, password } = req.body;
     console.log('Login request:', req.body);
     if (!username || !password) return res.status(400).send('Username and password are required');
     // Check if user exists
     db.query('SELECT * FROM users WHERE username = ? or email = ? AND password = ?', [username, username, password], (err, results) => {
          if (err) return res.status(500).send('Database error');
          if (results.length > 0) {
               console.log(results[0]);
               // User exists, return user data
               return res.json(results[0]);
          } else {
               console.log('ffhhh')
               // User does not exist or wrong password
               return res.status(401).send('Invalid username or password');
          }
     });
});

app.listen(port, () => {
     console.log(`Server is running on port ${port}`);
});
