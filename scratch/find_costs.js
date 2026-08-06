const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

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
      continue;
    }
    if (!inString) {
      if (char === ',') {
        currentRow.push(currentVal);
        currentVal = '';
      } else if (char === '(') {
        currentRow = [];
        currentVal = '';
      } else if (char === ')') {
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

async function main() {
  const sql = fs.readFileSync('wordpress/podemais.sql', 'utf8');
  const postMetaMatches = sql.match(/INSERT INTO `wp_postmeta` \([^)]+\) VALUES\s*([\s\S]+?);/g);

  const productCosts = {}; // vendizap_id -> cost

  if (postMetaMatches) {
    for (const match of postMetaMatches) {
      const valuesPart = match.replace(/INSERT INTO `wp_postmeta` \([^)]+\) VALUES\s*/, '').replace(/;$/, '');
      const rows = parseValues(valuesPart);
      
      const tempPostItems = {}; // postId -> { itemIndex: { id_produto, custo } }
      
      for (const row of rows) {
        if (row.length < 4) continue;
        const postId = row[1].trim();
        const metaKey = row[2].trim();
        const metaValue = row[3].trim();
        
        // Match itens_0_id_produto, itens_0_custo, etc.
        const idMatch = metaKey.match(/^itens_(\d+)_id_produto$/);
        const costMatch = metaKey.match(/^itens_(\d+)_custo$/);
        
        if (idMatch) {
            const idx = idMatch[1];
            if (!tempPostItems[postId]) tempPostItems[postId] = {};
            if (!tempPostItems[postId][idx]) tempPostItems[postId][idx] = {};
            tempPostItems[postId][idx].id_produto = metaValue;
        } else if (costMatch) {
            const idx = costMatch[1];
            if (!tempPostItems[postId]) tempPostItems[postId] = {};
            if (!tempPostItems[postId][idx]) tempPostItems[postId][idx] = {};
            tempPostItems[postId][idx].custo = metaValue;
        }
      }
      
      // Now assemble them
      for (const postId in tempPostItems) {
          for (const idx in tempPostItems[postId]) {
              const item = tempPostItems[postId][idx];
              if (item.id_produto && item.custo) {
                  // Keep the latest or first we find (the dump has them ordered roughly by post ID ascending usually)
                  // So the last one we see will be the most recent cost if posts are chronological
                  productCosts[item.id_produto] = item.custo;
              }
          }
      }
    }
  }

  const keys = Object.keys(productCosts);
  console.log(`Found ${keys.length} unique products with costs in wp_postmeta.`);
  
  // Show a sample
  for (let i=0; i<Math.min(5, keys.length); i++) {
      console.log(`- ID: ${keys[i]} = ${productCosts[keys[i]]}`);
  }
}
main().finally(() => prisma.$disconnect());
