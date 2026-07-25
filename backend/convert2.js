const fs = require('fs');
let jsx = fs.readFileSync('../frontend/src/components/InvoicePreview.jsx', 'utf8');

const startMarker = '<div ref={printRef} style={paperStyle}>';
let startIndex = jsx.indexOf(startMarker);
let content = jsx.substring(startIndex + startMarker.length);
let endIndex = content.lastIndexOf('</div>\n      </div>\n    </div>');
content = content.substring(0, endIndex);

content = content.replace(/className=/g, 'class=');

content = content.replace(/style={{([^}]+)}}/g, (match, p1) => {
  try {
    const obj = eval('({' + p1 + '})');
    let styleStr = '';
    for (const key in obj) {
      const kebab = key.replace(/([A-Z])/g, '-$1').toLowerCase();
      styleStr += `${kebab}: ${obj[key]};`;
    }
    return `style="${styleStr}"`;
  } catch(e) { return match; }
});

content = content.replace(/\{([^}]+)\}/g, (match, p1) => {
  if (p1.startsWith('/*')) return '';
  if (p1.includes('format(parseISO')) {
     if (p1.includes('invoice_date')) return '${formatDate(inv.invoice_date)}';
     if (p1.includes('due_date')) return '${formatDate(inv.due_date)}';
  }
  return `\${${p1}}`;
});

content = content.replace(/src=\$\{\{([^}]+)\}\}/g, 'src="${$1}"');

content = content.replace(/\$\{rows\.map\(\(item, i\) => \((.*?)\)\)\}/gs, (match, p1) => {
  return `\${rows.map((item, i) => \`${p1}\`).join('')}`;
});

content = content.replace(/key=\$\{i\}/g, '');

let serverStr = fs.readFileSync('server.js', 'utf8');
let htmlStart = serverStr.indexOf('  const html = `<!DOCTYPE html>');
let htmlEnd = serverStr.indexOf('</body></html>`;', htmlStart);

let newHtml = `  const html = \`<!DOCTYPE html>
<html><head>
<meta charset="utf-8"/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'Inter',sans-serif;background:#fff;color:#1a2420;font-size:12px;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  @page{size:A4;margin:10mm;}
  table{width:100%;border-collapse:collapse;}
</style>
</head><body>
<div style="background:white;width:100%;padding:20px;position:relative;">
${content}
</div>
</body></html>\`;`;

let newServerStr = serverStr.substring(0, htmlStart) + newHtml + serverStr.substring(htmlEnd + 16);
fs.writeFileSync('server.js', newServerStr);
console.log('Done replacing server.js html block.');
