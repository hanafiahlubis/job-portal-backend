const prisma = require('../utils/db');

exports.getJobs = async (req, res) => {
    try {
        // Default pagination: limit = 50 per halaman
        const { search, location, min_salary, page = 1, limit = 50 } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.max(1, parseInt(limit, 10) || 50);
        const skip = (pageNum - 1) * limitNum;

        // Membangun kondisi filter (Dynamic Query)
        const whereClause = { is_active: true };

        if (search) {
            whereClause.OR = [
                { job_title: { contains: search, mode: 'insensitive' } },
                { company_name: { contains: search, mode: 'insensitive' } }
            ];
        }
        if (location) {
            whereClause.location = { contains: location, mode: 'insensitive' };
        }
        // Note: Untuk min_salary, karena data gaji biasanya bertipe string ("Rp 5.000.000 - Rp 10.000.000"),
        // Di sistem enterprise sesungguhnya kolom ini harus diparsing menjadi Integer (min_salary_num, max_salary_num).
        // Untuk contoh ini, kita lewati string manipulation yang kompleks.

        const jobs = await prisma.job.findMany({
            where: whereClause,
            skip: skip,
            take: limitNum,
            orderBy: { updated_at: 'desc' }
        });

        const totalItems = await prisma.job.count({ where: whereClause });

        res.json({
            success: true,
            data: jobs,
            meta: {
                total_items: totalItems,
                current_page: pageNum,
                limit: limitNum,
                total_pages: Math.ceil(totalItems / limitNum) || 1
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getJobById = async (req, res) => {
    try {
        const job = await prisma.job.findUnique({
            where: { id: req.params.id }
        });
        if (!job) return res.status(404).json({ success: false, message: 'Lowongan tidak ditemukan' });
        res.json({ success: true, data: job });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};