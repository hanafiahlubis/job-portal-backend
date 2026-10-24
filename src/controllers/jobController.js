const prisma = require('../utils/db');

exports.getJobs = async (req, res) => {
    try {
        const { search, location, min_salary, page = 1, limit = 10 } = req.query;
        const skip = (page - 1) * limit;

        // Membangun kondisi filter (Dynamic Query)
        const whereClause = { is_active: true };

        if (search) {
            whereClause.job_title = { contains: search, mode: 'insensitive' };
        }
        if (location) {
            whereClause.location = { contains: location, mode: 'insensitive' };
        }
        // Note: Untuk min_salary, karena data gaji biasanya bertipe string ("Rp 5.000.000 - Rp 10.000.000"),
        // Di sistem enterprise sesungguhnya kolom ini harus diparsing menjadi Integer (min_salary_num, max_salary_num).
        // Untuk contoh ini, kita lewati string manipulation yang kompleks.

        const jobs = await prisma.job.findMany({
            where: whereClause,
            skip: parseInt(skip),
            take: parseInt(limit),
            orderBy: { updated_at: 'desc' }
        });

        const totalItems = await prisma.job.count({ where: whereClause });

        res.json({
            success: true,
            data: jobs,
            meta: {
                total_items: totalItems,
                current_page: parseInt(page),
                total_pages: Math.ceil(totalItems / limit)
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