const fs = require('fs');

let jsx = fs.readFileSync('../frontend/src/components/InvoicePreview.jsx', 'utf8');

const startMarker = '<div ref={printRef} style={paperStyle}>';
let startIndex = jsx.indexOf(startMarker);
let content = jsx.substring(startIndex + startMarker.length);
let endIndex = content.lastIndexOf('</div>\n      </div>\n\n      {showEmailModal');
if (endIndex === -1) {
  endIndex = content.lastIndexOf('</div>\n      </div>');
}
content = content.substring(0, endIndex);

// Replace className= with class=
content = content.replace(/className=/g, 'class=');

// Convert style={{...}} to style="..."
content = content.replace(/style=\{\{([^}]+)\}\}/g, (match, p1) => {
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

// Convert conditional rendering
// {hasQR && (...)}
content = content.replace(/\{hasQR\s*&&\s*\(([\s\S]*?)\)\}/g, '${hasQR ? `$1` : ""}');
content = content.replace(/\{discount > 0\s*&&\s*\(([\s\S]*?)\)\}/g, '${discount > 0 ? `$1` : ""}');
content = content.replace(/\{extraCharges > 0\s*&&\s*\(([\s\S]*?)\)\}/g, '${extraCharges > 0 ? `$1` : ""}');
content = content.replace(/\{\(co\.terms_and_conditions \|\| inv\.notes\)\s*&&\s*\(([\s\S]*?)\)\}/g, '${(co.terms_and_conditions || inv.notes) ? `$1` : ""}');
content = content.replace(/\{co\.additional_notes\s*&&\s*\(([\s\S]*?)\)\}/g, '${co.additional_notes ? `$1` : ""}');
content = content.replace(/\{co\.company_gstin\s*&&\s*<div([^>]*)>(.*?)<\/div>\}/g, '${co.company_gstin ? `<div$1>$2</div>` : ""}');
content = content.replace(/\{co\.company_email\s*&&\s*<div([^>]*)>(.*?)<\/div>\}/g, '${co.company_email ? `<div$1>$2</div>` : ""}');
content = content.replace(/\{co\.company_phone\s*&&\s*<div([^>]*)>(.*?)<\/div>\}/g, '${co.company_phone ? `<div$1>$2</div>` : ""}');
content = content.replace(/\{inv\.client_gstin\s*&&\s*<div([^>]*)>(.*?)<\/div>\}/g, '${inv.client_gstin ? `<div$1>$2</div>` : ""}');
content = content.replace(/\{inv\.client_phone\s*&&\s*<div([^>]*)>(.*?)<\/div>\}/g, '${inv.client_phone ? `<div$1>$2</div>` : ""}');
content = content.replace(/\{inv\.client_email\s*&&\s*<div([^>]*)>(.*?)<\/div>\}/g, '${inv.client_email ? `<div$1>$2</div>` : ""}');
content = content.replace(/\{item\.description\s*&&\s*<div([^>]*)>(.*?)<\/div>\}/g, '${item.description ? `<div$1>$2</div>` : ""}');

// Fix remaining {variable} expressions
content = content.replace(/\{([^}]+)\}/g, (match, p1) => {
  if (p1.startsWith('/*')) return '';
  if (p1.includes('format(parseISO')) {
     if (p1.includes('invoice_date')) return '${formatDate(inv.invoice_date)}';
     if (p1.includes('due_date')) return '${formatDate(inv.due_date)}';
  }
  return `\${${p1}}`;
});

// Map array rows to strings
content = content.replace(/\$\{rows\.map\(\(item,\s*i\)\s*=>\s*\(([\s\S]*?)\)\)\}/g, (match, p1) => {
  return `\${rows.map((item, i) => \`${p1}\`).join('')}`;
});

// Remove key=${i} from map
content = content.replace(/key=\$\{i\}/g, '');

let serverStr = fs.readFileSync('server.js', 'utf8');

// Also inject numberToWords if missing
if (!serverStr.includes('function numberToWords(num)')) {
  const func = `
function numberToWords(num) {
  if (num === 0) return 'Zero';
  const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine',
    'Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  function convert(n) {
    if (n < 20)       return ones[n];
    if (n < 100)      return tens[Math.floor(n/10)] + (n%10 ? ' '+ones[n%10] : '');
    if (n < 1000)     return ones[Math.floor(n/100)] + ' Hundred' + (n%100 ? ' '+convert(n%100) : '');
    if (n < 100000)   return convert(Math.floor(n/1000)) + ' Thousand' + (n%1000 ? ' '+convert(n%1000) : '');
    if (n < 10000000) return convert(Math.floor(n/100000)) + ' Lakh' + (n%100000 ? ' '+convert(n%100000) : '');
    return convert(Math.floor(n/10000000)) + ' Crore' + (n%10000000 ? ' '+convert(n%10000000) : '');
  }
  return convert(num);
}
`;
  serverStr = serverStr.replace('// Generate PDF buffer', func + '\n// Generate PDF buffer');
}

const htmlStartStr = '  const html = `<!DOCTYPE html>\\n<html><head>';
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

if (htmlStart !== -1 && htmlEnd !== -1) {
  let newServerStr = serverStr.substring(0, htmlStart) + newHtml + serverStr.substring(htmlEnd + 16);
  fs.writeFileSync('server.js', newServerStr);
  console.log('Update successful');
} else {
  console.log('Could not find HTML block', htmlStart, htmlEnd);
}
