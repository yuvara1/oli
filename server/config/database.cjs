const mysql = require('mysql2');

// Create connection pool with better timeout settings
const pool = mysql.createPool({
     host: process.env.MYSQL_HOST || 'localhost',
     user: process.env.MYSQL_USER || 'root',
     password: process.env.MYSQL_PASSWORD || '',
     database: process.env.MYSQL_DATABASE || 'ott',
     port: process.env.MYSQL_PORT || 3306,
     ssl:process.env.MYSQL_SSL ? {
          rejectUnauthorized: false // Adjust based on your SSL requirements
     } : false,
     waitForConnections: true,
     connectionLimit: 10,
     queueLimit: 0,
     acquireTimeout: 60000,
     timeout: 60000,
     reconnect: true,
     idleTimeout: 300000,
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

// Test database connection
const initDatabase = () => {
     pool.getConnection((err, connection) => {
          if (err) {
               console.error('Database connection failed:', err);
               console.log('Please check your database configuration in .env file');
          } else {
               console.log('Connected to MySQL database successfully');
               connection.release();
          }
     });
};

module.exports = {
     pool,
     queryDB,
     initDatabase
};