const { runAllScrapers } = require('../services/cronService');

exports.triggerScraper = async (req, res) => {
    res.status(202).json({
        success: true,
        message: 'Proses scraping seluruh portal dimulai di background.'
    });

    try {
        await runAllScrapers();
    } catch (error) {
        console.error('Manual Scraping Error:', error);
    }
};