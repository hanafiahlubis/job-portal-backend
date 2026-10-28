const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const prisma = require('../utils/db');

puppeteer.use(StealthPlugin());

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ============================================================================
// TEMPELKAN LINK WEB SCRAPING SUPERBANK DI BAGIAN "..." DI BAWAH INI
// Contoh: "https://id-career.myworkplaze.com/superbank_indonesia"
// ============================================================================
const TARGET_URL = "https://id-career.myworkplaze.com/superbank_indonesia";

const scrapeSuperbank = async (customUrl = TARGET_URL) => {
    if (!customUrl || customUrl !== TARGET_URL) {
        console.error('[Superbank] Error: Silakan tempelkan URL target pada bagian "' + TARGET_URL + '" terlebih dahulu.');
        return;
    }

    console.log(`[Superbank] Memulai proses scraping dari: ${customUrl}`);
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    try {
        // 1. Buka halaman daftar lowongan Superbank
        await page.goto(customUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        await delay(2000);

        // 2. Kumpulkan semua link detail pekerjaan (/superbank_indonesia/job-detail/...)
        const jobLinks = await page.evaluate(() => {
            const links = [];
            document.querySelectorAll('a[href*="/job-detail/"]').forEach((el) => {
                if (el.href && !links.includes(el.href)) {
                    links.push(el.href);
                }
            });
            return links;
        });

        console.log(`[Superbank] Ditemukan ${jobLinks.length} link pekerjaan. Memulai masuk ke halaman detail...`);

        // 3. Masuk ke setiap halaman detail satu per satu
        for (let i = 0; i < jobLinks.length; i++) {
            const url = jobLinks[i];
            const detailPage = await browser.newPage();

            try {
                console.log(`[Superbank] Scraping detail (${i + 1}/${jobLinks.length}): ${url}`);
                await detailPage.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
                await delay(2000);

                const jobData = await detailPage.evaluate(() => {
                    const getText = (selector) => {
                        const el = document.querySelector(selector);
                        return el ? el.innerText.trim() : null;
                    };

                    return {
                        job_title: getText('h1, h2, h3') || 'Posisi Tidak Diketahui',
                        company_name: 'Super Bank Indonesia',
                        location: getText('[class*="location"], [class*="Location"]') || 'Indonesia',
                        job_type: getText('[class*="type"], [class*="contract"]') || 'PKWT / Full Time',
                        salary_range: 'Tidak ditampilkan',
                        description: getText('main, [class*="about"], [class*="description"]') || document.body.innerText.trim(),
                        job_detail_url: window.location.href,
                        source: 'Superbank'
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

                console.log(`[Superbank] Berhasil disimpan: ${jobData.job_title}`);
            } catch (err) {
                console.error(`[Superbank] Gagal scrape detail URL: ${url} | Error: ${err.message}`);
            } finally {
                await detailPage.close();
                await delay(2000);
            }
        }
        console.log('[Superbank] Selesai scraping seluruh data detail.');
    } catch (error) {
        console.error('[Superbank] Error scraping utama:', error.message);
    } finally {
        await browser.close();
    }
};

module.exports = scrapeSuperbank;