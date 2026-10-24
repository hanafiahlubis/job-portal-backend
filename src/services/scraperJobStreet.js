const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const prisma = require('../utils/db');

puppeteer.use(StealthPlugin());

// Fungsi untuk memberi jeda waktu agar bot tidak diblokir oleh sistem anti-bot
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const scrapeJobStreet = async () => {
    console.log('[JobStreet] Memulai proses scraping...');
    const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
    const page = await browser.newPage();

    try {
        // 1. Pergi ke halaman pencarian utama
        await page.goto('https://id.jobstreet.com/id/job-search/software-engineer-jobs/', { waitUntil: 'networkidle2' });

        // 2. Kumpulkan semua URL (Link) lowongan kerja dari halaman daftar
        const jobLinks = await page.evaluate(() => {
            let links = [];
            // Mencari semua link yang menuju ke halaman detail pekerjaan
            document.querySelectorAll('article a[data-automation="jobTitle"]').forEach(el => {
                if (el.href) links.push(el.href);
            });
            return links;
        });

        console.log(`[JobStreet] Ditemukan ${jobLinks.length} link pekerjaan. Memulai masuk ke halaman detail...`);

        // 3. Masuk ke setiap halaman detail satu per satu
        for (let i = 0; i < jobLinks.length; i++) {
            const url = jobLinks[i];
            const detailPage = await browser.newPage();

            try {
                console.log(`[JobStreet] Scraping detail (${i + 1}/${jobLinks.length}): ${url}`);
                await detailPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

                // Ekstrak data dari halaman detail
                const jobData = await detailPage.evaluate(() => {
                    // Fungsi bantu untuk mengambil teks dengan aman
                    const getText = (selector) => {
                        const el = document.querySelector(selector);
                        return el ? el.innerText.trim() : null;
                    };

                    return {
                        job_title: getText('h1') || 'Posisi Tidak Diketahui',
                        company_name: getText('[data-automation="advertiser-name"]') || 'Perusahaan Dirahasiakan',
                        location: getText('[data-automation="job-detail-location"]') || 'Lokasi tidak ditentukan',
                        job_type: getText('[data-automation="job-detail-work-type"]') || 'Full Time',
                        salary_range: getText('[data-automation="job-detail-salary"]') || 'Tidak ditampilkan',
                        description: getText('[data-automation="jobAdDetails"]') || 'Deskripsi tidak tersedia.',
                        job_detail_url: window.location.href,
                        source: 'JobStreet'
                    };
                });

                jobData.is_active = true;

                // Simpan atau update ke Database (Upsert)
                await prisma.job.upsert({
                    where: { job_detail_url: jobData.job_detail_url },
                    update: {
                        updated_at: new Date(),
                        is_active: true,
                        location: jobData.location,
                        salary_range: jobData.salary_range,
                        job_type: jobData.job_type,
                        description: jobData.description,
                        company_name: jobData.company_name
                    },
                    create: jobData
                });

                console.log(`[JobStreet] Berhasil disimpan: ${jobData.job_title}`);
            } catch (err) {
                console.error(`[JobStreet] Gagal scrape detail URL: ${url} | Error: ${err.message}`);
            } finally {
                await detailPage.close();
                // Tunggu 2 detik sebelum membuka halaman berikutnya agar tidak dianggap DDoS/Bot Spam
                await delay(2000);
            }
        }
        console.log(`[JobStreet] Selesai scraping seluruh data detail.`);
    } catch (error) {
        console.error('[JobStreet] Error scraping utama:', error.message);
    } finally {
        await browser.close();
    }
};

module.exports = scrapeJobStreet;