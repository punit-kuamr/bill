const fs = require('fs');
let s = fs.readFileSync('server.js', 'utf8');
s = s.replace(/\\\`/g, '`');
s = s.replace(/\\\$\{/g, '${');
fs.writeFileSync('server.js', s);
console.log('Fixed syntax errors');
