const Razorpay = require('razorpay');

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

module.exports = {
     razorpay
};