const express = require('express');
const router = express.Router();
const { queryDB } = require('../config/database.cjs');
const { seriesImagekit } = require('../config/imagekit.cjs');
const { seriesMux } = require('../config/mux.cjs');
const { memoryUpload } = require('../middleware/upload.cjs');

// Get all series
router.get('/series', async (req, res) => {
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
router.get('/series/:id', async (req, res) => {
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
router.post('/series-mux-direct-upload', async (req, res) => {
     console.log('Creating Series Mux direct upload...');
     try {
          const upload = await seriesMux.video.uploads.create({
               new_asset_settings: {
                    playback_policy: 'public'
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
router.get('/series-mux-asset-status/:uploadId', async (req, res) => {
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
router.post('/upload-series', memoryUpload.fields([
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

          // Store only playback ID in video field
          const videoData = playbackId || '';
          console.log('Storing playback ID in video field:', videoData);

          // Save to database
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

module.exports = router;