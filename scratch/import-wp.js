const fs = require('fs');

const sql = fs.readFileSync('c:/sites/podemais/ecommerce-api/wordpress/podemais.sql', 'utf8');

// A function to extract tuples from a VALUES (a,b,c),(d,e,f) string
function parseValues(valuesString) {
  const rows = [];
  let currentRow = [];
  let currentVal = '';
  let inString = false;
  let escapeNext = false;
  
  for (let i = 0; i < valuesString.length; i++) {
    const char = valuesString[i];
    
    if (escapeNext) {
      currentVal += char;
      escapeNext = false;
      continue;
    }
    
    if (char === '\\') {
      escapeNext = true;
      continue;
    }
    
    if (char === "'") {
      inString = !inString;
      continue; // skip the quote itself
    }
    
    if (!inString) {
      if (char === ',') {
        currentRow.push(currentVal);
        currentVal = '';
      } else if (char === '(') {
        // start of tuple
        currentRow = [];
        currentVal = '';
      } else if (char === ')') {
        // end of tuple
        currentRow.push(currentVal);
        currentVal = '';
        rows.push(currentRow);
      }
    } else {
      currentVal += char;
    }
  }
  return rows;
}

const postsMatches = sql.match(/INSERT INTO `wp_posts` \([^)]+\) VALUES\s*([\s\S]+?);/g);
const caixas = [];
const transactions = [];

if (postsMatches) {
  for (const match of postsMatches) {
    const valuesPart = match.replace(/INSERT INTO `wp_posts` \([^)]+\) VALUES\s*/, '').replace(/;$/, '');
    const rows = parseValues(valuesPart);
    for (const row of rows) {
      const id = row[0];
      const post_type = row[20];
      const post_title = row[5];
      const post_date = row[2];
      
      if (post_type && (post_type.trim() === 'caixa' || post_type.trim() === 'financeiro')) {
        if (post_type.trim() === 'caixa') {
          caixas.push({ id: id.trim(), title: post_title, date: post_date });
        } else if (post_type.trim() === 'financeiro') {
          transactions.push({ id: id.trim(), title: post_title, date: post_date });
        }
      }
    }
  }
}

const metaMatches = sql.match(/INSERT INTO `wp_postmeta` \([^)]+\) VALUES\s*([\s\S]+?);/g);
const postMeta = {}; // postId -> { meta_key: meta_value }

if (metaMatches) {
  for (const match of metaMatches) {
    const valuesPart = match.replace(/INSERT INTO `wp_postmeta` \([^)]+\) VALUES\s*/, '').replace(/;$/, '');
    const rows = parseValues(valuesPart);
    for (const row of rows) {
      const postId = row[1];
      const metaKey = row[2];
      const metaValue = row[3];
      if (postId) {
        const pId = postId.trim();
        if (!postMeta[pId]) postMeta[pId] = {};
        if (metaKey) postMeta[pId][metaKey.trim()] = metaValue;
      }
    }
  }
}

// Join them
for (const caixa of caixas) {
  caixa.meta = postMeta[caixa.id] || {};
}
for (const t of transactions) {
  t.meta = postMeta[t.id] || {};
}

console.log(`Found ${caixas.length} caixas and ${transactions.length} transactions`);
if (caixas.length > 0) {
    console.log('Sample Caixa:', caixas[0]);
}
if (transactions.length > 0) {
    console.log('Sample Transaction:', transactions[0]);
}

// Write to JSON for inspection
fs.writeFileSync('c:/sites/podemais/ecommerce-api/scratch/caixas.json', JSON.stringify(caixas, null, 2));
fs.writeFileSync('c:/sites/podemais/ecommerce-api/scratch/transactions.json', JSON.stringify(transactions, null, 2));
