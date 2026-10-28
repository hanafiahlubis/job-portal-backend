const cron = require('node-cron');
const scrapeJobStreet = require('./scraperJobStreet');
const scrapeGlints = require('./scraperGlints');
const scrapeCimbNiaga = require('./scraperCimbNiaga');
const scrapeBca = require('./scraperBca');
const scrapeBniFinance = require('./scraperBniFinance');
const scrapePermata = require('./scraperPermata');
const scrapeLinkedin = require('./scraperLinkedin');
const scrapeSeaBank = require('./scraperSeaBank');
const scrapeBsi = require('./scraperBsi');
const scrapeSuperbank = require('./scraperSuperbank');
const prisma = require('../utils/db');

const runCleanup = async () => {
    console.log('[Cron] Memulai proses Data Cleanup...');
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    const result = await prisma.job.updateMany({
        where: {
            updated_at: { lt: twoDaysAgo },
            is_active: true
        },
        data: { is_active: false }
    });
    console.log(`[Cron] Cleanup selesai: ${result.count} lowongan ditandai tidak aktif.`);
};

const runAllScrapers = async () => {
    await scrapeJobStreet();
    await scrapeGlints();
    await scrapeCimbNiaga();
    await scrapeBca();
    await scrapeBniFinance();
    await scrapePermata();
    await scrapeLinkedin();
    await scrapeSeaBank();
    await scrapeBsi();
    await scrapeSuperbank();
    await runCleanup();
};

const startCron = () => {
    // Berjalan otomatis setiap hari pukul 10:00 AM
    cron.schedule('0 10 * * *', async () => {
        console.log('--- CRON JOB DIMULAI ---');
        await runAllScrapers();
        console.log('--- CRON JOB SELESAI ---');
    }, {
        scheduled: true,
        timezone: "Asia/Jakarta"
    });
    console.log('Cron service berhasil dijadwalkan.');
};

module.exports = {
    startCron,
    runAllScrapers,
    scrapeJobStreet,
    scrapeGlints,
    scrapeCimbNiaga,
    scrapeBca,
    scrapeBniFinance,
    scrapePermata,
    scrapeLinkedin,
    scrapeSeaBank,
    scrapeBsi,
    scrapeSuperbank,
    runCleanup
};