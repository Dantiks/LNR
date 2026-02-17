// Keep-alive script to prevent Render cold start
const https = require('https');

const APP_URL = process.env.APP_URL || 'https://lnr-igvi.onrender.com';
const PING_INTERVAL = 10 * 60 * 1000; // 10 minutes

function ping() {
    https.get(`${APP_URL}/health`, (res) => {
        console.log(`🏓 Keep-alive ping: ${res.statusCode}`);
    }).on('error', (err) => {
        console.error(`❌ Keep-alive error: ${err.message}`);
    });
}

// Only run keep-alive in production
if (process.env.NODE_ENV === 'production') {
    console.log('🔄 Keep-alive started (ping every 10 minutes)');
    setInterval(ping, PING_INTERVAL);

    // Initial ping after 1 minute
    setTimeout(ping, 60000);
} else {
    console.log('⏭️  Keep-alive skipped (not in production)');
}
