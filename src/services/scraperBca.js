const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const prisma = require('../utils/db');

puppeteer.use(StealthPlugin());

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ============================================================================
// TEMPELKAN LINK WEB SCRAPING BCA DI BAGIAN "..." DI BAWAH INI
// Contoh: "https://karir.bca.co.id/candidate/id/career"
// ============================================================================
const TARGET_URL = "https://karir.bca.co.id/candidate/id/career";

const scrapeBca = async (customUrl = TARGET_URL) => {
    if (!customUrl || customUrl !== "https://karir.bca.co.id/candidate/id/career") {
        console.error(`[BCA] Error: Silakan tempelkan URL target pada bagian TARGET_URL: ${TARGET_URL} terlebih dahulu.`);
        return;
    }

    console.log(`[BCA] Memulai proses scraping dari: ${customUrl}`);
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    try {
        await page.goto(customUrl, { waitUntil: 'networkidle2', timeout: 60000 });

        // Ambil semua link detail lowongan BCA (/candidate/id/career/...)
        const jobLinks = await page.evaluate(() => {
            const links = [];
            document.querySelectorAll('a[href*="/candidate/id/career/"]').forEach((el) => {
                if (el.href && el.href !== window.location.href && !links.includes(el.href)) {
                    links.push(el.href);
                }
            });
            return links;
        });

        console.log(`[BCA] Ditemukan ${jobLinks.length} link pekerjaan. Memulai masuk ke halaman detail...`);

        for (let i = 0; i < jobLinks.length; i++) {
            const url = jobLinks[i];
            const detailPage = await browser.newPage();

            try {
                console.log(`[BCA] Scraping detail (${i + 1}/${jobLinks.length}): ${url}`);
                await detailPage.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

                const jobData = await detailPage.evaluate(() => {
                    const getText = (selector) => {
                        const el = document.querySelector(selector);
                        return el ? el.innerText.trim() : null;
                    };

                    return {
                        job_title: getText('h1, h2') || 'Posisi Tidak Diketahui',
                        company_name: 'Bank Central Asia (BCA)',
                        location: getText('[class*="location"], [class*="lokasi"]') || 'Indonesia',
                        job_type: getText('[class*="type"], [class*="jenis"]') || 'Program Trainee / Full Time',
                        salary_range: 'Tidak ditampilkan',
                        description: document.body.innerText.trim() || 'Deskripsi tidak tersedia.',
                        job_detail_url: window.location.href,
                        source: 'BCA'
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

                console.log(`[BCA] Berhasil disimpan: ${jobData.job_title}`);
            } catch (err) {
                console.error(`[BCA] Gagal scrape detail URL: ${url} | Error: ${err.message}`);
            } finally {
                await detailPage.close();
                await delay(2000);
            }
        }
        console.log('[BCA] Selesai scraping seluruh data detail.');
    } catch (error) {
        console.error('[BCA] Error scraping utama:', error.message);
    } finally {
        await browser.close();
    }
};

module.exports = scrapeBca;