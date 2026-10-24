require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { startCron } = require('./services/cronService');

const jobRoutes = require('./routes/jobRoutes');
const scraperRoutes = require('./routes/scraperRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/jobs', jobRoutes);
app.use('/api/scraper', scraperRoutes);

// Menjalankan Cron Job Automation
startCron();

app.listen(PORT, () => {
    console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
});