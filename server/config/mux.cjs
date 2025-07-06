const { Mux } = require('@mux/mux-node');

// Movies Mux configuration
const mux = new Mux({
     tokenId: process.env.MUX_TOKEN_ID,
     tokenSecret: process.env.MUX_TOKEN_SECRET
});

// Series Mux configuration
const seriesMux = new Mux({
     tokenId: process.env.SERIES_MUX_TOKEN_ID,
     tokenSecret: process.env.SERIES_MUX_TOKEN_SECRET
});

// Environment check
console.log('Mux Environment check:');
console.log('MUX_TOKEN_ID:', process.env.MUX_TOKEN_ID ? 'Set' : 'Missing');
console.log('MUX_TOKEN_SECRET:', process.env.MUX_TOKEN_SECRET ? 'Set' : 'Missing');
console.log('SERIES_MUX_TOKEN_ID:', process.env.SERIES_MUX_TOKEN_ID ? 'Set' : 'Missing');
console.log('SERIES_MUX_TOKEN_SECRET:', process.env.SERIES_MUX_TOKEN_SECRET ? 'Set' : 'Missing');

module.exports = {
     mux,
     seriesMux
};