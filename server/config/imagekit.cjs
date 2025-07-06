const ImageKit = require("imagekit");

// Movies ImageKit configuration
const imagekit = new ImageKit({
     publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
     privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
     urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
});

// Series ImageKit configuration
const seriesImagekit = new ImageKit({
     publicKey: process.env.SERIES_IMAGEKIT_PUBLIC_KEY,
     privateKey: process.env.SERIES_IMAGEKIT_PRIVATE_KEY,
     urlEndpoint: process.env.SERIES_IMAGEKIT_URL_ENDPOINT
});

// Environment check
console.log('ImageKit Environment check:');
console.log('IMAGEKIT_PUBLIC_KEY:', process.env.IMAGEKIT_PUBLIC_KEY ? 'Set' : 'Missing');
console.log('IMAGEKIT_PRIVATE_KEY:', process.env.IMAGEKIT_PRIVATE_KEY ? 'Set' : 'Missing');
console.log('IMAGEKIT_URL_ENDPOINT:', process.env.IMAGEKIT_URL_ENDPOINT);
console.log('SERIES_IMAGEKIT_PUBLIC_KEY:', process.env.SERIES_IMAGEKIT_PUBLIC_KEY ? 'Set' : 'Missing');
console.log('SERIES_IMAGEKIT_PRIVATE_KEY:', process.env.SERIES_IMAGEKIT_PRIVATE_KEY ? 'Set' : 'Missing');
console.log('SERIES_IMAGEKIT_URL_ENDPOINT:', process.env.SERIES_IMAGEKIT_URL_ENDPOINT);

module.exports = {
     imagekit,
     seriesImagekit
};