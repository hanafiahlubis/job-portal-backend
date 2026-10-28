require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { startCron } = require('./services/cronService');

const jobRoutes = require('./routes/jobRoutes');
const scraperRoutes = require('./routes/scraperRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Konfigurasi CORS Origin dari environment variable (.env)
const corsOriginEnv = process.env.CORS_ORIGIN || '*';
const allowedOrigins = corsOriginEnv
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

const corsOptions = {
    origin: (origin, callback) => {
        // Izinkan request tanpa header Origin (misalnya cURL, Postman, server-to-server, mobile app)
        if (!origin) return callback(null, true);

        // Jika allowedOrigins berisi '*' atau environment variable adalah '*', izinkan semua origin
        if (corsOriginEnv === '*' || allowedOrigins.includes('*')) {
            return callback(null, true);
        }

        // Cek apakah origin yang merequest terdaftar dalam allowedOrigins
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }

        return callback(new Error(`CORS policy: Akses dari origin ${origin} tidak diizinkan.`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

app.use(cors(corsOptions));
app.use(express.json());

// Routes
app.use('/api/jobs', jobRoutes);
app.use('/api/scraper', scraperRoutes);

// Health check endpoint
app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        message: 'Job Portal API is running',
        timestamp: new Date().toISOString()
    });
});

// Menjalankan Cron Job Automation & Listener (Hanya jika dijalankan langsung di server lokal/VPS, bukan di serverless Vercel)
if (!process.env.VERCEL) {
    startCron();
    app.listen(PORT, () => {
        console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
        console.log(`🔒 CORS Origin yang diizinkan: ${corsOriginEnv}`);
    });
}

// Export aplikasi untuk Vercel Serverless Function
module.exports = app;