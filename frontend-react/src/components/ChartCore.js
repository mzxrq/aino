import { DateTime } from 'luxon';

// Format tick labels for Plotly axes
export function formatTickLabels(dates, tz, maxTicks = 8) {
  if (!dates || dates.length === 0) return { tickvals: [], ticktext: [] };
  const total = dates.length;
  const step = Math.max(1, Math.floor(total / maxTicks));
  const vals = [];
  const txt = [];
  for (let i = 0; i < total; i += step) {
    const d = DateTime.fromISO(dates[i], { zone: 'utc' }).setZone(tz);
    vals.push(dates[i]);
    txt.push(d.toFormat('yyyy-LL-dd HH:mm'));
  }
  const last = dates[total - 1];
  if (vals[vals.length - 1] !== last) {
    vals.push(last);
    txt.push(DateTime.fromISO(last, { zone: 'utc' }).setZone(tz).toFormat('yyyy-LL-dd HH:mm'));
  }
  return { tickvals: vals, ticktext: txt };
}

// ordinal axis helper: compress gaps (weekends/holidays) by using indices for x
export function buildOrdinalAxis(dates, tz, period) {
  if (!dates || dates.length === 0) return { x: [], tickvals: [], ticktext: [] };
  const x = dates.map((d, i) => i);
  const ticks = formatTickLabels(dates, tz, 8);
  const idxMap = new Map(dates.map((d, i) => [d, i]));
  const tickvals = ticks.tickvals.map(v => idxMap.get(v)).filter(v => v !== undefined);
  return { x, tickvals, ticktext: ticks.ticktext };
}

export function buildGapConnectors(dates, closes, axisX, interval) {
  if (!dates || dates.length < 2) return [];
  const mapIntervalMs = (itv) => {
    if (!itv) return 60000;
    if (itv.endsWith('m')) return parseInt(itv.replace('m','')) * 60000;
    if (itv.endsWith('h')) return parseInt(itv.replace('h','')) * 3600000;
    if (itv.endsWith('d')) return parseInt(itv.replace('d','')) * 86400000;
    return 60000;
  };
  const expected = mapIntervalMs(interval);
  const threshold = Math.max(expected * 3, 1000 * 60 * 30);
  const out = [];
  for (let i = 0; i < dates.length - 1; i++) {
    const a = DateTime.fromISO(dates[i], { zone: 'utc' }).toMillis();
    const b = DateTime.fromISO(dates[i+1], { zone: 'utc' }).toMillis();
    if ((b - a) > threshold) {
      const x0 = axisX ? axisX[i] : dates[i];
      const x1 = axisX ? axisX[i+1] : dates[i+1];
      out.push({
        x: [x0, x1],
        y: [closes[i], closes[i+1]],
        type: 'scatter',
        mode: 'lines',
        name: 'Gap',
        hoverinfo: 'skip',
        line: { color: 'rgba(200,200,200,0.6)', width: 1, dash: 'dash' },
        showlegend: false
      });
    }
  }
  return out;
}

// Convert a hex color like '#26a69a' to an rgba(...) string with given alpha
export function hexToRgba(hex, alpha = 1) {
  if (!hex) return `rgba(38,166,154,${alpha})`;
  const h = hex.replace('#','');
  const bigint = parseInt(h.length === 3 ? h.split('').map(c=>c+c).join('') : h, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Build several stacked translucent polygon traces between the price line and
// a slightly lowered copy of the price line. Using `fill: 'toself'` avoids
// anchoring to the zero baseline and produces a soft gradient-like band.
export function buildGradientBands(dates, closes, axisX, layers = 4, baseColor = '#26a69a') {
  if (!dates || dates.length === 0 || !closes || closes.length === 0) return [];
  const vals = closes.slice();
  let yMin = Math.min(...vals);
  let yMax = Math.max(...vals);
  if (!isFinite(yMin) || !isFinite(yMax)) return [];
  if (yMin === yMax) { yMin = yMin - 1; yMax = yMax + 1; }
  const depthTotal = (yMax - yMin) * 0.18;
  const out = [];
  for (let i = 1; i <= layers; i++) {
    const prevDepth = depthTotal * ((i - 1) / layers);
    const nextDepth = depthTotal * (i / layers);
    const upper = vals.map(v => v - prevDepth);
    const lower = vals.map(v => v - nextDepth);
    const xpoly = axisX.concat(axisX.slice().reverse());
    const ypoly = upper.concat(lower.slice().reverse());
    const alpha = 0.08 * (1 - (i - 1) / layers);
    out.push({
      x: xpoly,
      y: ypoly,
      type: 'scatter',
      mode: 'none',
      fill: 'toself',
      fillcolor: hexToRgba(baseColor, Math.max(0.02, alpha)),
      showlegend: false,
      line: { width: 0 }
    });
  }
  return out;
}

export function buildHoverTextForDates(dates, tz, period) {
  if (!dates || dates.length === 0) return [];
  const p = (period || '').toLowerCase();
  let fmt = 'yyyy-LL-dd HH:mm';
  if (p === '1d') fmt = 'HH:mm';
  else if (p === '5d') fmt = 'LL-dd HH:mm';
  else if (p === '1mo' || p === '6mo') fmt = 'LL-dd';
  else if (p === '1y' || p === '5y') fmt = 'yyyy-LL';
  return dates.map(d => {
    try { return DateTime.fromISO(d, { zone: 'utc' }).setZone(tz).toFormat(fmt); } catch { return d; }
  });
}

export function resolvePlotlyColorFallback() {
  try {
    const s = getComputedStyle(document.body);
    const txt = (s.getPropertyValue('--text-primary') || s.getPropertyValue('--text') || '').trim();
    if (txt) return txt;
    return document.body.classList.contains('dark') ? '#FFFFFF' : '#111111';
  } catch {
    try { return document.body.classList.contains('dark') ? '#FFFFFF' : '#111111'; } catch { return '#111111'; }
  }
}

// Find the closest index in `dates` for a given ISO date string `target`.
// Returns -1 if dates is empty or parsing fails. Uses UTC milliseconds comparison.
export function findClosestIndex(dates, target, maxDeltaMs = Number.POSITIVE_INFINITY) {
  // Finds the index in `dates` closest to `target` (ISO strings). If the
  // closest difference exceeds `maxDeltaMs`, returns -1. Dates are parsed in
  // UTC for a stable comparison regardless of timezone suffix format.
  try {
    if (!dates || !dates.length || !target) return -1;
    const tms = DateTime.fromISO(target, { zone: 'utc' }).toMillis();
    if (!isFinite(tms)) return -1;
    let bestIdx = -1;
    let bestDiff = Number.POSITIVE_INFINITY;
    for (let i = 0; i < dates.length; i++) {
      try {
        const dms = DateTime.fromISO(dates[i], { zone: 'utc' }).toMillis();
        if (!isFinite(dms)) continue;
        const diff = Math.abs(dms - tms);
        if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
      } catch {
        continue;
      }
    }
    if (bestIdx === -1) return -1;
    return (bestDiff <= maxDeltaMs) ? bestIdx : -1;
  } catch {
    return -1;
  }
}
