const PythonService = require('./python-integrate.service');

const scanAll = async (req, res) => {
  try {
    const result = await PythonService.scanAll({ background: true });
    return res.json({ success: true, data: result });
  } catch (err) {
    console.error('admin/scan-all proxy error', err?.response?.data || err.message || err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = {
  scanAll,
};
