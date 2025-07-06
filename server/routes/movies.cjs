const express = require('express');
const router = express.Router();
const { queryDB } = require('../config/database.cjs');
const { imagekit } = require('../config/imagekit.cjs');
const { mux } = require('../config/mux.cjs');
const { memoryUpload } = require('../middleware/upload.cjs');

// Get all movie IDs for homepage
router.get('/movie-ids', async (req, res) => {
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

// Get single movie by ID
router.get('/movie/:id', async (req, res) => {
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

// Alternative route for movies
router.get('/movies/:id', async (req, res) => {
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

// Create Mux direct upload URL
router.post('/mux-direct-upload', async (req, res) => {
     try {
          const upload = await mux.video.uploads.create({
               new_asset_settings: {
                    playback_policy: 'public'
               },
               cors_origin: '*'
          });
          res.json({ url: upload.url, uploadId: upload.id });
     } catch (err) {
          console.error('Mux direct upload error:', err);
          res.status(500).json({ error: 'Mux direct upload failed: ' + err.message });
     }
});

// Check Mux asset status
router.get('/mux-asset-status/:uploadId', async (req, res) => {
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

// Upload movie with Mux playback ID
router.post('/upload-movie-mux', async (req, res) => {
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

// Upload trailer and poster to ImageKit
router.post('/upload-trailer-poster/:id', memoryUpload.fields([
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

module.exports = router;