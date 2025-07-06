const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { queryDB } = require('../config/database.cjs');
const { razorpay } = require('../config/razorpay.cjs');

// Create order
router.post('/create-order', async (req, res) => {
     console.log('Create order request:', req.body);

     const { amount, currency = 'INR', receipt, userId } = req.body;

     if (!amount || amount <= 0) {
          return res.status(400).json({
               success: false,
               error: 'Valid amount is required'
          });
     }

     try {
          const options = {
               amount: parseInt(amount),
               currency: currency,
               receipt: receipt || `rcpt_${Date.now()}_${userId || 'anon'}`,
               notes: {
                    user_id: userId || '',
                    created_at: new Date().toISOString(),
                    skip_verification: 'true'
               },
               payment_capture: 1,
          };

          console.log('Creating Razorpay order with options:', options);

          const razorpayOrder = await razorpay.orders.create(options);
          console.log('Razorpay order created:', razorpayOrder);

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

// Verify payment
router.post('/verify-payment', async (req, res) => {
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

          // Update order status
          await queryDB(
               'UPDATE orders SET status = ?, razorpay_payment_id = ?, razorpay_signature = ?, updated_at = NOW() WHERE razorpay_order_id = ?',
               ['paid', razorpay_payment_id, razorpay_signature, razorpay_order_id]
          );

          // Update user premium status
          if (user_id) {
               await queryDB(
                    'UPDATE users SET premium = 1 WHERE id = ?',
                    [user_id]
               );
               console.log(`User ${user_id} premium status updated to true`);
          }

          // Create subscription if needed
          if (user_id && plan_id) {
               let duration_months = 1;
               switch (plan_id) {
                    case 'basic': duration_months = 1; break;
                    case 'premium': duration_months = 3; break;
                    case 'ultimate': duration_months = 12; break;
               }

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

                    await queryDB(
                         'INSERT INTO user_subscriptions (user_id, plan_type, start_date, end_date, payment_id) VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL ? MONTH), ?)',
                         [user_id, plan_id, duration_months, razorpay_payment_id]
                    );
               } catch (tableError) {
                    console.error('Error creating/updating subscription:', tableError);
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

// Apply promo code
router.post('/apply-promo', async (req, res) => {
     console.log('Promo code application request:', req.body);

     const { promoCode, userId } = req.body;

     if (!promoCode || !userId) {
          return res.status(400).json({
               success: false,
               error: 'Promo code and user ID are required'
          });
     }

     try {
          const userResults = await queryDB('SELECT * FROM users WHERE id = ?', [userId]);

          if (userResults.length === 0) {
               return res.status(404).json({
                    success: false,
                    error: 'User not found'
               });
          }

          if (userResults[0].premium === 1) {
               return res.json({
                    success: false,
                    error: 'You already have premium access'
               });
          }

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
               [userId, normalizedPromoCode, 30]
          );

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

// Razorpay webhook
router.post('/razorpay-webhook', (req, res) => {
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

module.exports = router;