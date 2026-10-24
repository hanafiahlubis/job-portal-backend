const express = require('express');
const router = express.Router();

// Mengimpor controller yang berisi logika database
const jobController = require('../controllers/jobController');

// [GET] /api/jobs
// Mengambil semua data pekerjaan dengan dukungan pagination & filter
router.get('/', jobController.getJobs);

// [GET] /api/jobs/:id
// Mengambil detail satu pekerjaan secara spesifik berdasarkan ID
router.get('/:id', jobController.getJobById);

module.exports = router;