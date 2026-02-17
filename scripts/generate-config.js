const fs = require('fs');
const path = require('path');

const apiKey = process.env.API_KEY || '';
if (!apiKey) {
  console.error('API_KEY not set');
  process.exit(1);
}

const out = `window.CONFIG = { API_KEY: ${JSON.stringify(apiKey)} };` + '\n';
fs.writeFileSync(path.join(__dirname, '..', 'js', 'config.js'), out, 'utf8');
console.log('js/config.js written');