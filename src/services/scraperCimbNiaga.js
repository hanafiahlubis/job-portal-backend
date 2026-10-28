const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const prisma = require('../utils/db');

puppeteer.use(StealthPlugin());

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ============================================================================
// TEMPELKAN LINK WEB SCRAPING CIMB NIAGA DI BAGIAN "..." DI BAWAH INI
// Contoh: "https://career.cimbniaga.co.id/jobs"
// ============================================================================
const TARGET_URL = "https://career.cimbniaga.co.id/jobs";

const scrapeCimbNiaga = async (customUrl = TARGET_URL) => {
    if (!customUrl || customUrl !== "https://career.cimbniaga.co.id/jobs") {
        console.error(`[CIMB Niaga] Error: Silakan tempelkan URL target pada bagian TARGET_URL: ${TARGET_URL} terlebih dahulu.`);
        return;
    }

    console.log(`[CIMB Niaga] Memulai proses scraping dari: ${customUrl}`);
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    try {
        await page.goto(customUrl, { waitUntil: 'networkidle2', timeout: 60000 });

        // Ambil semua link detail lowongan (/job/ID-...)
        const jobLinks = await page.evaluate(() => {
            const links = [];
            document.querySelectorAll('a[href*="/job/"]').forEach((el) => {
                if (el.href && !links.includes(el.href)) {
                    links.push(el.href);
                }
            });
            return links;
        });

        console.log(`[CIMB Niaga] Ditemukan ${jobLinks.length} link pekerjaan. Memulai masuk ke halaman detail...`);

        for (let i = 0; i < jobLinks.length; i++) {
            const url = jobLinks[i];
            const detailPage = await browser.newPage();

            try {
                console.log(`[CIMB Niaga] Scraping detail (${i + 1}/${jobLinks.length}): ${url}`);
                await detailPage.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

                const jobData = await detailPage.evaluate(() => {
                    const getText = (selector) => {
                        const el = document.querySelector(selector);
                        return el ? el.innerText.trim() : null;
                    };

                    return {
                        job_title: getText('h1, h2, .job-title') || 'Posisi Tidak Diketahui',
                        company_name: 'CIMB Niaga',
                        location: getText('[class*="location"], [class*="Location"]') || 'Indonesia',
                        job_type: getText('[class*="job-type"], [class*="JobType"]') || 'Permanent / Professional Hire',
                        salary_range: 'Tidak ditampilkan',
                        description: document.body.innerText.trim() || 'Deskripsi tidak tersedia.',
                        job_detail_url: window.location.href,
                        source: 'CIMB Niaga'
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

                console.log(`[CIMB Niaga] Berhasil disimpan: ${jobData.job_title}`);
            } catch (err) {
                console.error(`[CIMB Niaga] Gagal scrape detail URL: ${url} | Error: ${err.message}`);
            } finally {
                await detailPage.close();
                await delay(2000);
            }
        }
        console.log('[CIMB Niaga] Selesai scraping seluruh data detail.');
    } catch (error) {
        console.error('[CIMB Niaga] Error scraping utama:', error.message);
    } finally {
        await browser.close();
    }
};

module.exports = scrapeCimbNiaga;