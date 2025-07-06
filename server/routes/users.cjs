const express = require('express');
const router = express.Router();
const { queryDB } = require('../config/database.cjs');

// Check premium status
router.get('/check-premium/:userId', async (req, res) => {
     const userId = req.params.userId;

     if (!userId) {
          return res.status(400).json({
               success: false,
               error: 'User ID is required'
          });
     }

     try {
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

// Get user ID by username
router.get('/get-user-id/:username', async (req, res) => {
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

// Check subscription
router.get('/check-subscription/:userId', async (req, res) => {
     const userId = req.params.userId;

     if (!userId) {
          return res.status(400).json({
               hasSubscription: false,
               error: 'User ID is required'
          });
     }

     try {
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

// Set premium status (for testing)
router.post('/set-premium/:userId', async (req, res) => {
     const userId = req.params.userId;
     const { premium } = req.body;

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

// Get user promo history
router.get('/user-promos/:userId', async (req, res) => {
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

// Validate promo code
router.post('/validate-promo', async (req, res) => {
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

// Check user access level
router.get('/check-user-access/:userId', async (req, res) => {
     const userId = req.params.userId;

     try {
          const query = 'SELECT access FROM users WHERE id = ?';
          const results = await queryDB(query, [userId]);

          if (results.length > 0) {
               res.json({
                    success: true,
                    access: results[0].access || 0
               });
          } else {
               res.status(404).json({ error: 'User not found' });
          }
     } catch (err) {
          console.error('Database error:', err);
          res.status(500).json({ error: 'Database error' });
     }
});

// Update user access level (admin only)
router.post('/update-user-access', async (req, res) => {
     const { userId, access } = req.body;

     try {
          const query = 'UPDATE users SET access = ? WHERE id = ?';
          await queryDB(query, [access, userId]);

          res.json({ success: true, message: 'Access level updated' });
     } catch (err) {
          console.error('Database error:', err);
          res.status(500).json({ error: 'Database error' });
     }
});

module.exports = router;