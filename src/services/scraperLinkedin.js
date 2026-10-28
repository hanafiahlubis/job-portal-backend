const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const prisma = require('../utils/db');

puppeteer.use(StealthPlugin());

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ============================================================================
// TEMPELKAN LINK WEB SCRAPING LINKEDIN DI BAGIAN "..." DI BAWAH INI
// Contoh: "https://www.linkedin.com/jobs/search-results/?currentJobId=4479740984&keywords=jobs&origin=COMPANY_PAGE_JOBS_CLUSTER_EXPANSION&originToLandingJobPostings=4479740984%2C4476159707%2C4474593637&geoId=102478259&f_C=54332632"
// ============================================================================
const TARGET_URL = "https://www.linkedin.com/jobs/search-results/?currentJobId=4479740984&keywords=jobs&origin=COMPANY_PAGE_JOBS_CLUSTER_EXPANSION&originToLandingJobPostings=4479740984%2C4476159707%2C4474593637&geoId=102478259&f_C=54332632";

const scrapeLinkedin = async (customUrl = TARGET_URL) => {
    if (!customUrl || customUrl !== TARGET_URL) {
        console.error(`[LinkedIn] Error: Silakan tempelkan URL target pada bagian "${TARGET_URL}" terlebih dahulu.`);
        return;
    }

    console.log(`[LinkedIn] Memulai proses scraping dari: ${customUrl}`);
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    try {
        // 1. Buka halaman daftar pencarian lowongan LinkedIn
        await page.goto(customUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await delay(4000);

        // 2. Kumpulkan semua link detail pekerjaan (/jobs/view/...) atau dari parameter job ID
        const jobLinks = await page.evaluate(() => {
            const links = [];

            // Ambil dari elemen kartu lowongan yang memiliki link /jobs/view/
            document.querySelectorAll('a[href*="/jobs/view/"], a.base-card__full-link, a.job-card-container__link').forEach((el) => {
                if (el.href) {
                    const cleanUrl = el.href.split('?')[0];
                    if (!links.includes(cleanUrl)) {
                        links.push(cleanUrl);
                    }
                }
            });

            // Ambil juga dari atribut data-job-id atau data-occludable-job-id jika ada
            document.querySelectorAll('[data-job-id], [data-occludable-job-id], [data-entity-urn*="jobPosting:"]').forEach((el) => {
                const rawId = el.getAttribute('data-job-id') ||
                    el.getAttribute('data-occludable-job-id') ||
                    (el.getAttribute('data-entity-urn') || '').split(':').pop();
                if (rawId && /^\d+$/.test(rawId.trim())) {
                    const viewUrl = `https://www.linkedin.com/jobs/view/${rawId.trim()}/`;
                    if (!links.includes(viewUrl)) {
                        links.push(viewUrl);
                    }
                }
            });

            // Fallback: Ambil juga job ID dari parameter URL (originToLandingJobPostings / currentJobId)
            const params = new URLSearchParams(window.location.search);
            const currentId = params.get('currentJobId');
            if (currentId && /^\d+$/.test(currentId)) {
                const url = `https://www.linkedin.com/jobs/view/${currentId}/`;
                if (!links.includes(url)) links.push(url);
            }
            const landingIds = params.get('originToLandingJobPostings');
            if (landingIds) {
                landingIds.split(',').forEach((id) => {
                    if (/^\d+$/.test(id.trim())) {
                        const url = `https://www.linkedin.com/jobs/view/${id.trim()}/`;
                        if (!links.includes(url)) links.push(url);
                    }
                });
            }

            return links;
        });

        console.log(`[LinkedIn] Ditemukan ${jobLinks.length} link pekerjaan. Memulai masuk ke halaman detail...`);

        // 3. Masuk ke setiap halaman detail satu per satu
        for (let i = 0; i < jobLinks.length; i++) {
            const url = jobLinks[i];
            const detailPage = await browser.newPage();

            try {
                console.log(`[LinkedIn] Scraping detail (${i + 1}/${jobLinks.length}): ${url}`);
                await detailPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await delay(3000);

                const jobData = await detailPage.evaluate(() => {
                    const getText = (selector) => {
                        const el = document.querySelector(selector);
                        return el ? el.innerText.trim() : null;
                    };

                    return {
                        job_title: getText('h1, .top-card-layout__title, .job-details-jobs-unified-top-card__job-title') || 'Posisi Tidak Diketahui',
                        company_name: getText('.topcard__org-name-link, .top-card-layout__first-subline a, .job-details-jobs-unified-top-card__company-name') || 'PT Bank Jago Tbk',
                        location: getText('.topcard__flavor--bullet, .top-card-layout__first-subline span.topcard__flavor--bullet') || 'Indonesia',
                        job_type: getText('.description__job-criteria-text') || 'Full Time',
                        salary_range: 'Tidak ditampilkan',
                        description: getText('.show-more-less-html__markup, .description__text, #job-details') || document.body.innerText.trim(),
                        job_detail_url: window.location.href.split('?')[0],
                        source: 'LinkedIn'
                    };
                });

                jobData.is_active = true;

                await prisma.job.upsert({
                    where: { job_detail_url: jobData.job_detail_url },
                    update: {
                        updated_at: new Date(),
                        is_active: true,
                        job_title: jobData.job_title,
                        location: jobData.location,
                        salary_range: jobData.salary_range,
                        job_type: jobData.job_type,
                        description: jobData.description,
                        company_name: jobData.company_name
                    },
                    create: jobData
                });

                console.log(`[LinkedIn] Berhasil disimpan: ${jobData.job_title}`);
            } catch (err) {
                console.error(`[LinkedIn] Gagal scrape detail URL: ${url} | Error: ${err.message}`);
            } finally {
                await detailPage.close();
                await delay(2000);
            }
        }
        console.log('[LinkedIn] Selesai scraping seluruh data detail.');
    } catch (error) {
        console.error('[LinkedIn] Error scraping utama:', error.message);
    } finally {
        await browser.close();
    }
};

module.exports = scrapeLinkedin;