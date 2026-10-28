const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const prisma = require('../utils/db');

puppeteer.use(StealthPlugin());

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ============================================================================
// TEMPELKAN LINK WEB SCRAPING BSI (TALENTICS) DI BAGIAN "..." DI BAWAH INI
// Contoh: "https://jobs.talentics.id/pt-bank-syariah-indonesia-tbk?tab=jobs"
// ============================================================================
const TARGET_URL = "https://jobs.talentics.id/pt-bank-syariah-indonesia-tbk?tab=jobs";

const scrapeBsi = async (customUrl = TARGET_URL) => {
    if (!customUrl || customUrl !== TARGET_URL) {
        console.error('[BSI] Error: Silakan tempelkan URL target pada bagian "' + TARGET_URL + '" terlebih dahulu.');
        return;
    }

    console.log(`[BSI] Memulai proses scraping dari: ${customUrl}`);
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    try {
        // 1. Buka halaman daftar lowongan BSI di Talentics
        await page.goto(customUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        await delay(2000);

        // 2. Kumpulkan semua link detail pekerjaan (/pt-bank-syariah-indonesia-tbk/...)
        const jobLinks = await page.evaluate(() => {
            const links = [];
            document.querySelectorAll('a[href*="/pt-bank-syariah-indonesia-tbk/"]').forEach((el) => {
                if (el.href && !el.href.includes('?tab=') && !links.includes(el.href)) {
                    links.push(el.href);
                }
            });
            return links;
        });

        console.log(`[BSI] Ditemukan ${jobLinks.length} link pekerjaan. Memulai masuk ke halaman detail...`);

        // 3. Masuk ke setiap halaman detail satu per satu
        for (let i = 0; i < jobLinks.length; i++) {
            const url = jobLinks[i];
            const detailPage = await browser.newPage();

            try {
                console.log(`[BSI] Scraping detail (${i + 1}/${jobLinks.length}): ${url}`);
                await detailPage.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
                await delay(2000);

                const jobData = await detailPage.evaluate(() => {
                    const getText = (selector) => {
                        const el = document.querySelector(selector);
                        return el ? el.innerText.trim() : null;
                    };

                    return {
                        job_title: getText('h1, h2') || 'Posisi Tidak Diketahui',
                        company_name: 'PT Bank Syariah Indonesia Tbk (BSI)',
                        location: getText('[class*="location"], [class*="Location"]') || 'Indonesia',
                        job_type: getText('[class*="badge"], [class*="tag"]') || 'Full Time / Magang',
                        salary_range: 'Tidak ditampilkan',
                        description: getText('main') || document.body.innerText.trim(),
                        job_detail_url: window.location.href,
                        source: 'BSI'
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

                console.log(`[BSI] Berhasil disimpan: ${jobData.job_title}`);
            } catch (err) {
                console.error(`[BSI] Gagal scrape detail URL: ${url} | Error: ${err.message}`);
            } finally {
                await detailPage.close();
                await delay(2000);
            }
        }
        console.log('[BSI] Selesai scraping seluruh data detail.');
    } catch (error) {
        console.error('[BSI] Error scraping utama:', error.message);
    } finally {
        await browser.close();
    }
};

module.exports = scrapeBsi;