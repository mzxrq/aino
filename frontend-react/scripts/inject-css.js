const fs = require('fs');
const path = require('path');

function log(...args) { console.log('[inject-css]', ...args); }

const distDir = path.resolve(__dirname, '..', 'dist');
const assetsDir = path.join(distDir, 'assets');
const indexHtml = path.join(distDir, 'index.html');

if (!fs.existsSync(distDir)) {
  log('dist directory not found:', distDir);
  process.exit(0);
}

if (!fs.existsSync(indexHtml)) {
  log('dist/index.html not found — nothing to inject.');
  process.exit(0);
}

if (!fs.existsSync(assetsDir)) {
  log('dist/assets not found — nothing to inject.');
  process.exit(0);
}

const cssFiles = fs.readdirSync(assetsDir).filter(f => f.endsWith('.css'));
if (!cssFiles.length) {
  log('No CSS files found in dist/assets — nothing to inject.');
  process.exit(0);
}

// Prefer file that contains 'index' in its name; otherwise pick the largest CSS file
let chosen = cssFiles.find(f => f.includes('index'));
if (!chosen) {
  let largestSize = -1;
  for (const f of cssFiles) {
    const s = fs.statSync(path.join(assetsDir, f)).size;
    if (s > largestSize) { largestSize = s; chosen = f; }
  }
}

const assetPath = '/assets/' + chosen;

let html = fs.readFileSync(indexHtml, 'utf8');
const originalHref = '/src/css/index.css';
if (html.indexOf(originalHref) === -1) {
  log(`Original href (${originalHref}) not found in ${indexHtml}; skipping injection.`);
  process.exit(0);
}

html = html.split(originalHref).join(assetPath);
fs.writeFileSync(indexHtml, html, 'utf8');
log(`Injected CSS asset ${assetPath} into ${indexHtml}`);
