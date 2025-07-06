const corsMiddleware = (req, res, next) => {
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
};

module.exports = {
     corsMiddleware
};