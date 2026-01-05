const axios = require('axios');
const { getPyUrl } = require('./python-integrate.model');

const scanAll = async (opts = {}) => {
  const PY_URL = getPyUrl();
  const body = { background: !!opts.background };
  const res = await axios.post(`${PY_URL}/py/anomalies/scan-all`, body, { timeout: 1000 * 60 * 5 });
  return res.data;
};

module.exports = {
  scanAll,
};
