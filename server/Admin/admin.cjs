const express = require('express');
const bodyParser = require('body-parser');
const { queryDB } = require('../config/database.cjs');
const { corsMiddleware } = require('../middleware/cors.cjs');
const { initDatabase } = require('../config/database.cjs');

const router = express.Router();

// Admin route to list all tables
router.get('/admin/list-tables', async (req, res) => {
     try {
          const tables = await queryDB("SHOW TABLES");
          console.log('Tables found:', tables);
          res.json(tables.map(table => Object.values(table)[0]));
     } catch (err) {
          console.error('Error fetching tables:', err);
          res.status(500).json({ error: 'Error fetching tables' });
     }
});

// Admin route to show table structure
router.get('/admin/describe-table/:tableName', async (req, res) => {
     const tableName = req.params.tableName;

     // Validate table name to prevent SQL injection
     if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
          return res.status(400).json({ error: 'Invalid table name' });
     }

     try {
          const structure = await queryDB(`DESCRIBE \`${tableName}\``);
          res.json(structure);
     } catch (err) {
          console.error('Error describing table:', err);
          res.status(500).json({ error: 'Error describing table' });
     }
});

// Admin route to get table data
router.get('/admin/table-data/:tableName', async (req, res) => {
     const tableName = req.params.tableName;
     const limit = parseInt(req.query.limit) || 100;

     // Validate table name to prevent SQL injection
     if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
          return res.status(400).json({ error: 'Invalid table name' });
     }

     // Validate limit
     if (isNaN(limit) || limit < 1 || limit > 1000) {
          return res.status(400).json({ error: 'Invalid limit value' });
     }

     try {
          const data = await queryDB(`SELECT * FROM \`${tableName}\` LIMIT ${limit}`);
          res.json(data);
     } catch (err) {
          console.error('Error fetching table data:', err);
          res.status(500).json({ error: 'Error fetching table data' });
     }
});

// Admin route to get table count
router.get('/admin/table-count/:tableName', async (req, res) => {
     const tableName = req.params.tableName;

     // Validate table name to prevent SQL injection
     if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
          return res.status(400).json({ error: 'Invalid table name' });
     }

     try {
          const count = await queryDB(`SELECT COUNT(*) as count FROM \`${tableName}\``);
          res.json({ count: count[0].count });
     } catch (err) {
          console.error('Error counting table rows:', err);
          res.status(500).json({ error: 'Error counting table rows' });
     }
});

// Admin route to update a row
router.put('/admin/update-row/:tableName', async (req, res) => {
     const tableName = req.params.tableName;
     const { primaryKey, primaryKeyValue, data } = req.body;

     // Validate table name
     if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
          return res.status(400).json({ error: 'Invalid table name' });
     }

     // Validate primary key
     if (!primaryKey || !primaryKeyValue) {
          return res.status(400).json({ error: 'Primary key and value are required' });
     }

     try {
          // Build UPDATE query
          const fields = Object.keys(data).filter(key => key !== primaryKey);
          const setClause = fields.map(field => `\`${field}\` = ?`).join(', ');
          const values = fields.map(field => data[field]);
          values.push(primaryKeyValue);

          const query = `UPDATE \`${tableName}\` SET ${setClause} WHERE \`${primaryKey}\` = ?`;

          console.log('Update query:', query);
          console.log('Update values:', values);

          const result = await queryDB(query, values);

          if (result.affectedRows > 0) {
               res.json({ success: true, message: 'Row updated successfully' });
          } else {
               res.status(404).json({ error: 'Row not found' });
          }
     } catch (err) {
          console.error('Error updating row:', err);
          res.status(500).json({ error: 'Error updating row: ' + err.message });
     }
});

// Admin route to insert a new row
router.post('/admin/insert-row/:tableName', async (req, res) => {
     const tableName = req.params.tableName;
     const { data } = req.body;

     // Validate table name
     if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
          return res.status(400).json({ error: 'Invalid table name' });
     }

     try {
          // Remove empty fields and auto-increment fields
          const cleanData = {};
          for (const [key, value] of Object.entries(data)) {
               if (value !== '' && value !== null && value !== undefined) {
                    cleanData[key] = value;
               }
          }

          // Build INSERT query
          const fields = Object.keys(cleanData);
          const placeholders = fields.map(() => '?').join(', ');
          const values = Object.values(cleanData);

          const query = `INSERT INTO \`${tableName}\` (\`${fields.join('`, `')}\`) VALUES (${placeholders})`;

          console.log('Insert query:', query);
          console.log('Insert values:', values);

          const result = await queryDB(query, values);

          res.json({
               success: true,
               message: 'Row inserted successfully',
               insertId: result.insertId
          });
     } catch (err) {
          console.error('Error inserting row:', err);
          res.status(500).json({ error: 'Error inserting row: ' + err.message });
     }
});

// Admin route to delete a row
router.delete('/admin/delete-row/:tableName', async (req, res) => {
     const tableName = req.params.tableName;
     const { primaryKey, primaryKeyValue } = req.body;

     // Validate table name
     if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
          return res.status(400).json({ error: 'Invalid table name' });
     }

     // Validate primary key
     if (!primaryKey || !primaryKeyValue) {
          return res.status(400).json({ error: 'Primary key and value are required' });
     }

     try {
          const query = `DELETE FROM \`${tableName}\` WHERE \`${primaryKey}\` = ?`;

          console.log('Delete query:', query);
          console.log('Delete value:', primaryKeyValue);

          const result = await queryDB(query, [primaryKeyValue]);

          if (result.affectedRows > 0) {
               res.json({ success: true, message: 'Row deleted successfully' });
          } else {
               res.status(404).json({ error: 'Row not found' });
          }
     } catch (err) {
          console.error('Error deleting row:', err);
          res.status(500).json({ error: 'Error deleting row: ' + err.message });
     }
});

// Admin dashboard stats
router.get('/admin/dashboard-stats', async (req, res) => {
     try {
          const stats = {};

          // Get user count
          try {
               const userCount = await queryDB('SELECT COUNT(*) as count FROM users');
               stats.users = userCount[0].count;
          } catch (err) {
               console.log('Users table not found');
               stats.users = 0;
          }

          // Get movie count
          try {
               const movieCount = await queryDB('SELECT COUNT(*) as count FROM movieslist');
               stats.movies = movieCount[0].count;
          } catch (err) {
               console.log('Movieslist table not found');
               stats.movies = 0;
          }

          // Get series count
          try {
               const seriesCount = await queryDB('SELECT COUNT(*) as count FROM series');
               stats.series = seriesCount[0].count;
          } catch (err) {
               console.log('Series table not found');
               stats.series = 0;
          }

          // Get premium users count
          try {
               const premiumCount = await queryDB('SELECT COUNT(*) as count FROM users WHERE premium = 1');
               stats.premiumUsers = premiumCount[0].count;
          } catch (err) {
               console.log('Premium users count failed');
               stats.premiumUsers = 0;
          }

          // Get orders count
          try {
               const orderCount = await queryDB('SELECT COUNT(*) as count FROM orders');
               stats.orders = orderCount[0].count;
          } catch (err) {
               console.log('Orders table not found');
               stats.orders = 0;
          }

          res.json(stats);
     } catch (err) {
          console.error('Error fetching dashboard stats:', err);
          res.status(500).json({ error: 'Error fetching dashboard stats' });
     }
});

// Admin route to execute safe queries
router.post('/admin/safe-query', async (req, res) => {
     const { query, tableName } = req.body;

     // Only allow SELECT queries
     if (!query || !query.toLowerCase().startsWith('select')) {
          return res.status(400).json({ error: 'Only SELECT queries are allowed' });
     }

     // Validate table name
     if (tableName && !/^[a-zA-Z0-9_]+$/.test(tableName)) {
          return res.status(400).json({ error: 'Invalid table name' });
     }

     try {
          const result = await queryDB(query);
          res.json({ result: result });
     } catch (err) {
          console.error('Error executing query:', err);
          res.status(500).json({ error: 'Error executing query: ' + err.message });
     }
});

// Admin route to add a new column
router.post('/admin/add-column/:tableName', async (req, res) => {
     const tableName = req.params.tableName;
     const { columnName, columnType, isNullable, defaultValue, extra } = req.body;

     // Validate table name
     if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
          return res.status(400).json({ error: 'Invalid table name' });
     }

     // Validate column name
     if (!columnName || !/^[a-zA-Z0-9_]+$/.test(columnName)) {
          return res.status(400).json({ error: 'Invalid column name' });
     }

     // Validate column type
     if (!columnType) {
          return res.status(400).json({ error: 'Column type is required' });
     }

     try {
          // Build ALTER TABLE query
          let query = `ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${columnType}`;

          // Add NULL/NOT NULL
          if (isNullable === false) {
               query += ' NOT NULL';
          } else {
               query += ' NULL';
          }

          // Add default value
          if (defaultValue && defaultValue !== '') {
               if (columnType.toLowerCase().includes('varchar') ||
                    columnType.toLowerCase().includes('text') ||
                    columnType.toLowerCase().includes('char')) {
                    query += ` DEFAULT '${defaultValue}'`;
               } else {
                    query += ` DEFAULT ${defaultValue}`;
               }
          }

          // Add extra (like AUTO_INCREMENT)
          if (extra && extra !== '') {
               query += ` ${extra}`;
          }

          console.log('Add column query:', query);

          const result = await queryDB(query);

          res.json({
               success: true,
               message: `Column '${columnName}' added successfully to table '${tableName}'`,
               query: query
          });

     } catch (err) {
          console.error('Error adding column:', err);
          res.status(500).json({
               error: 'Error adding column: ' + err.message,
               details: err.sqlMessage || 'No additional details'
          });
     }
});

module.exports = router;