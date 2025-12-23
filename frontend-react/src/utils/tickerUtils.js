let _loaded = false;
let _rawToDisplay = {};
let _displayToRaw = {};

async function loadMasterTickers() {
  if (_loaded) return;
  try {
    const res = await fetch('/master_tickers.json');
    if (!res.ok) throw new Error('master_tickers.json not available');
    const arr = await res.json();
    const mapRaw = {};
    const mapDisp = {};
    for (const it of arr) {
      const raw = (it.symbol || it.ticker || '').toString().toUpperCase();
      const disp = (it.displayTicker || it.display || (raw ? raw.split('.')[0] : '')).toString();
      if (raw) mapRaw[raw] = disp;
      if (disp) {
        if (!mapDisp[disp]) mapDisp[disp] = raw;
      }
    }
    _rawToDisplay = mapRaw;
    _displayToRaw = mapDisp;
    _loaded = true;
    // expose globally for quick sync lookups from other code
    try { window.__MASTER_TICKERS__ = { rawToDisplay: mapRaw, displayToRaw: mapDisp }; } catch(e){}
  } catch (e) {
    // ignore; leave maps empty
  }
}

// Kick off loading in background
loadMasterTickers();

function getDisplayFromRaw(raw) {
  if (!raw) return raw || '';
  const r = (raw || '').toString().toUpperCase();
  if (_rawToDisplay && _rawToDisplay[r]) return _rawToDisplay[r];
  try { if (window && window.__MASTER_TICKERS__ && window.__MASTER_TICKERS__.rawToDisplay && window.__MASTER_TICKERS__.rawToDisplay[r]) return window.__MASTER_TICKERS__.rawToDisplay[r]; } catch(e){}
  // fallback: strip suffix after dot
  return r.split('.')[0];
}

function getRawFromDisplay(display) {
  if (!display) return display || '';
  const d = display.toString();
  if (_displayToRaw && _displayToRaw[d]) return _displayToRaw[d];
  try { if (window && window.__MASTER_TICKERS__ && window.__MASTER_TICKERS__.displayToRaw && window.__MASTER_TICKERS__.displayToRaw[d]) return window.__MASTER_TICKERS__.displayToRaw[d]; } catch(e){}
  return display;
}

export { loadMasterTickers, getDisplayFromRaw, getRawFromDisplay };
