const express = require('express');
const router = express.Router();
const { queryDB } = require('../config/database.cjs');

// Google OAuth login endpoint
router.post('/google-login', async (req, res) => {
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
                    premium: existingUsers[0].premium === 1,
                    access: existingUsers[0].access || 0,  // ✅ Keep as number, don't convert to boolean
                    message: 'Login successful'
               });
          }

          // Create new user with premium defaulting to false (0)
          console.log('Creating new user...');
          const result = await Promise.race([
               queryDB('INSERT INTO users (username, email, password, premium, access) VALUES (?, ?, ?, ?, ?)',
                    [username, email, 'google-auth', 0, 0]), // ✅ Set access to 0 for new users
               new Promise((_, reject) => setTimeout(() => reject(new Error('Database insert timeout')), 10000))
          ]);

          console.log('New user created:', { id: result.insertId, username, email });
          res.json({
               id: result.insertId,
               username,
               email,
               premium: false,
               access: 0,  // ✅ Default access level to 0
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

// User login
router.post('/login', async (req, res) => {
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
                    id: results[0].id,
                    username: results[0].username,
                    email: results[0].email,
                    name: results[0].name,
                    premium: results[0].premium === 1,
                    access: results[0].access || 0  // ✅ Keep as number, don't convert to boolean
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

// User registration
router.post('/register', async (req, res) => {
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

          // Create new user with default access level 0
          const result = await queryDB('INSERT INTO users (username, email, password, access) VALUES (?, ?, ?, ?)',
               [username, email, password, 0]);
          res.json({ success: true, id: result.insertId });

     } catch (err) {
          console.error('Error creating user:', err);
          res.status(500).json({ error: 'Error creating user' });
     }
});

module.exports = router;