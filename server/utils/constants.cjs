const VALID_PROMO_CODES = ['USEOLI', 'FREEACCESS', 'PREMIUM2024'];

const PLAN_DURATION = {
     basic: 1,
     premium: 3,
     ultimate: 12
};

const ALLOWED_ORIGINS = [
     'http://localhost:5173',
     'http://localhost:3000',
     'https://appsail-50028934332.development.catalystappsail.in',
     'https://olii-ott.web.app'
];

module.exports = {
     VALID_PROMO_CODES,
     PLAN_DURATION,
     ALLOWED_ORIGINS
};