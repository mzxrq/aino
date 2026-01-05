/** python-integrate.model.js
 * Holds Python integration constants and helpers
 */

const DEFAULT_PY_URL = process.env.VITE_LINE_PY_URL || process.env.PY_URL || 'http://localhost:5000';

function getPyUrl() {
  return process.env.VITE_LINE_PY_URL || process.env.PY_URL || DEFAULT_PY_URL;
}

module.exports = {
  getPyUrl,
};
