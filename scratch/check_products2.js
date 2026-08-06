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
  const postsMatches = sql.match(/INSERT INTO `wp_posts` \([^)]+\) VALUES\s*([\s\S]+?);/g);
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

  const wpProducts = [];
  if (postsMatches) {
    for (const match of postsMatches) {
      const valuesPart = match.replace(/INSERT INTO `wp_posts` \([^)]+\) VALUES\s*/, '').replace(/;$/, '');
      const rows = parseValues(valuesPart);
      for (const row of rows) {
        if (row.length >= 21) {
          const id = row[0].trim();
          const post_title = row[5];
          const post_type = row[20].trim();
          if (post_type === 'produtos') {
            wpProducts.push({ id, title: post_title, meta: postMeta[id] || {} });
          }
        }
      }
    }
  }

  console.log('Total WP Produtos:', wpProducts.length);
  for (const prod of wpProducts) {
    const vendizapId = prod.meta.id_vendizap;
    const custo = prod.meta.custo;
    if (vendizapId) {
      const exists = await prisma.product.findUnique({ where: { externalId: vendizapId } });
      console.log(`WP: ${prod.title} | ID_VENDIZAP: ${vendizapId} | Custo: ${custo} | EXISTS IN DB: ${exists ? 'YES' : 'NO'}`);
    } else {
      console.log(`WP: ${prod.title} | NO ID_VENDIZAP`);
    }
  }
}
main().finally(() => prisma.$disconnect());
