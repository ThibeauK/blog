const fs = require('fs');
const path = require('path');

const apiKey = process.env.API_KEY || '';
if (!apiKey) {
  console.error('API_KEY not set in environment. Aborting.');
  process.exit(1);
}

const out = `window.CONFIG = { API_KEY: ${JSON.stringify(apiKey)} };` + '\n';
const outPath = path.join(__dirname, '..', 'js', 'config.js');

fs.writeFileSync(outPath, out, 'utf8');
console.log('Wrote', outPath);