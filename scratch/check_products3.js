const fs = require('fs');

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

const sql = fs.readFileSync('wordpress/podemais.sql', 'utf8');
const postMetaMatches = sql.match(/INSERT INTO `wp_postmeta` \([^)]+\) VALUES\s*([\s\S]+?);/g);
const postMeta = {};

if (postMetaMatches) {
  for (const match of postMetaMatches) {
    const valuesPart = match.replace(/INSERT INTO `wp_postmeta` \([^)]+\) VALUES\s*/, '').replace(/;$/, '');
    const rows = parseValues(valuesPart);
    for (const row of rows) {
      if (row.length < 4) continue;
      const postId = row[1].trim();
      const metaKey = row[2].trim();
      const metaValue = row[3].trim();
      if (!postMeta[postId]) postMeta[postId] = {};
      postMeta[postId][metaKey] = metaValue;
    }
  }
}

let vendizapCount = 0;
let custoCount = 0;

for (const postId in postMeta) {
    if (postMeta[postId].id_vendizap) {
        vendizapCount++;
        // console.log(`Post ${postId} has id_vendizap: ${postMeta[postId].id_vendizap}`);
    }
    if (postMeta[postId].custo) {
        custoCount++;
    }
}
console.log('Total id_vendizap fields in wp_postmeta:', vendizapCount);
console.log('Total custo fields in wp_postmeta:', custoCount);
