const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const prisma = require('../utils/db');

puppeteer.use(StealthPlugin());

const scrapeGlints = async () => {
    console.log('[Glints] Memulai proses scraping...');
    const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
    const page = await browser.newPage();

    try {
        await page.goto('https://glints.com/id/opportunities/jobs/explore', { waitUntil: 'networkidle2' });

        // Sesuaikan selector dengan DOM Glints yang sebenarnya
        const jobs = await page.evaluate(() => {
            let jobElements = document.querySelectorAll('.JobCardsc__JobcardContainer');
            let results = [];
            jobElements.forEach(el => {
                results.push({
                    job_title: el.querySelector('h3')?.innerText || '',
                    company_name: el.querySelector('.CompanyInfosc__CompanyName')?.innerText || '',
                    location: el.querySelector('.JobInfosc__Location')?.innerText || '',
                    salary_range: el.querySelector('.JobInfosc__Salary')?.innerText || '',
                    job_detail_url: el.querySelector('a')?.href || '',
                    source: 'Glints'
                });
            });
            return results;
        });

        for (let job of jobs) {
            if (!job.job_detail_url) continue;

            // Lakukan proses Upsert ke Database seperti JobStreet
            await prisma.job.upsert({
                where: { job_detail_url: job.job_detail_url },
                update: { updated_at: new Date(), is_active: true },
                create: { ...job, is_active: true }
            });
        }
        console.log(`[Glints] Selesai scraping ${jobs.length} data.`);
    } catch (error) {
        console.error('[Glints] Error scraping:', error.message);
    } finally {
        await browser.close();
    }
};

module.exports = scrapeGlints;