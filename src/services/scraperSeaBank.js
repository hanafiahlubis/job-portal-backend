const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const prisma = require('../utils/db');

puppeteer.use(StealthPlugin());

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ============================================================================
// TEMPELKAN LINK WEB SCRAPING SEABANK DI BAGIAN "..." DI BAWAH INI
// Contoh: "https://www.seabank.co.id/perusahaan/info/karir"
// ============================================================================
const TARGET_URL = "https://www.seabank.co.id/perusahaan/info/karir";

const scrapeSeaBank = async (customUrl = TARGET_URL) => {
    if (!customUrl || customUrl !== TARGET_URL) {
        console.error(`[SeaBank] Error: Silakan tempelkan URL target pada bagian "${TARGET_URL}" terlebih dahulu.`);
        return;
    }

    console.log(`[SeaBank] Memulai proses scraping dari: ${customUrl}`);
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    const allJobDetailLinks = new Set();

    // Tangkap juga response API internal SeaBank jika daftar loker per department dimuat via JSON
    page.on('response', async (response) => {
        try {
            const contentType = response.headers()['content-type'] || '';
            if (contentType.includes('application/json')) {
                const text = await response.text();
                const matches = text.match(/J\d{6,12}/g);
                if (matches) {
                    matches.forEach((jobId) => {
                        allJobDetailLinks.add(`https://www.seabank.co.id/karier/job-detail/?id=${jobId}`);
                    });
                }
            }
        } catch (err) {
            // Abaikan jika response bukan JSON
        }
    });

    try {
        // TAHAP 1: Buka halaman info karier utama SeaBank
        await page.goto(customUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        await delay(2000);

        // Kumpulkan semua link halaman department (misal: /karier/?department=1, dst.)
        const departmentLinks = await page.evaluate(() => {
            const deptUrls = [];
            document.querySelectorAll('a[href*="/karier/"], a[href*="department="]').forEach((el) => {
                if (el.href && !el.href.includes('job-detail') && !deptUrls.includes(el.href)) {
                    deptUrls.push(el.href);
                }
            });

            // Pastikan semua department (1 s/d 15) ikut dicek satu per satu
            for (let deptId = 1; deptId <= 15; deptId++) {
                const url = `https://www.seabank.co.id/karier/?department=${deptId}`;
                if (!deptUrls.includes(url)) {
                    deptUrls.push(url);
                }
            }
            return deptUrls;
        });

        console.log(`[SeaBank] Mengecek ${departmentLinks.length} halaman department untuk mencari daftar loker...`);

        // TAHAP 2: Masuk ke setiap halaman department untuk mengumpulkan link detail loker (/karier/job-detail/?id=...)
        for (let d = 0; d < departmentLinks.length; d++) {
            const deptUrl = departmentLinks[d];
            try {
                await page.goto(deptUrl, { waitUntil: 'networkidle2', timeout: 30000 });
                await delay(1500);

                const linksInDept = await page.evaluate(() => {
                    const found = [];
                    // 1. Cari dari tag <a> yang mengarah ke job-detail
                    document.querySelectorAll('a[href*="job-detail"]').forEach((el) => {
                        if (el.href && !found.includes(el.href)) {
                            found.push(el.href);
                        }
                    });

                    // 2. Cari juga ID lowongan (format J02095586) di dalam DOM jika menggunakan komponen SPA
                    const htmlMatches = document.documentElement.innerHTML.match(/J\d{6,12}/g);
                    if (htmlMatches) {
                        htmlMatches.forEach((id) => {
                            const detailUrl = `https://www.seabank.co.id/karier/job-detail/?id=${id}`;
                            if (!found.includes(detailUrl)) {
                                found.push(detailUrl);
                            }
                        });
                    }
                    return found;
                });

                linksInDept.forEach((link) => allJobDetailLinks.add(link));
            } catch (deptErr) {
                console.error(`[SeaBank] Gagal membuka department ${deptUrl}: ${deptErr.message}`);
            }
        }

        const jobLinksArray = Array.from(allJobDetailLinks);
        console.log(`[SeaBank] Total ditemukan ${jobLinksArray.length} link detail pekerjaan. Memulai masuk ke halaman detail...`);

        // TAHAP 3: Masuk ke setiap halaman detail (/karier/job-detail/?id=...) untuk mengambil seluruh isi detailnya
        for (let i = 0; i < jobLinksArray.length; i++) {
            const url = jobLinksArray[i];
            const detailPage = await browser.newPage();

            try {
                console.log(`[SeaBank] Scraping detail (${i + 1}/${jobLinksArray.length}): ${url}`);
                await detailPage.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
                await delay(2000);

                const jobData = await detailPage.evaluate(() => {
                    const getText = (selector) => {
                        const el = document.querySelector(selector);
                        return el ? el.innerText.trim() : null;
                    };

                    const bodyText = document.body.innerText || '';
                    const lokasiMatch = bodyText.match(/Lokasi\s+([^\n|]+)/i);
                    const deptMatch = bodyText.match(/Departemen\s+([^\n|]+)/i);

                    return {
                        job_title: getText('h1, h2, [class*="title"], [class*="job-title"]') || 'Posisi SeaBank',
                        company_name: 'SeaBank Indonesia',
                        location: lokasiMatch ? lokasiMatch[1].trim() : 'Indonesia',
                        job_type: deptMatch ? deptMatch[1].trim() : 'Full Time',
                        salary_range: 'Tidak ditampilkan',
                        description: getText('main, [class*="detail"], [class*="content"]') || bodyText.trim(),
                        job_detail_url: window.location.href,
                        source: 'SeaBank'
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

                console.log(`[SeaBank] Berhasil disimpan: ${jobData.job_title}`);
            } catch (err) {
                console.error(`[SeaBank] Gagal scrape detail URL: ${url} | Error: ${err.message}`);
            } finally {
                await detailPage.close();
                await delay(2000);
            }
        }
        console.log('[SeaBank] Selesai scraping seluruh data detail.');
    } catch (error) {
        console.error('[SeaBank] Error scraping utama:', error.message);
    } finally {
        await browser.close();
    }
};

module.exports = scrapeSeaBank;