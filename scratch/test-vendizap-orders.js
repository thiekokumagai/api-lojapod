const axios = require('axios');

function formatDateForVendizap(date) {
  const pad = (n) => n.toString().padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

async function test() {
  const authId = '294858';
  const authSecret = '2#BvJPtAiZGp$oEzdwHuF!gCW4sISYk0';
  
  const client = axios.create({
    baseURL: 'https://app.vendizap.com/api',
    headers: {
      'X-Auth-Id': authId,
      'X-Auth-Secret': authSecret,
    },
  });

  try {
    const now = new Date();
    // Start at Sep 1 2023 just to see if any data is brought
    const startOfMonth = new Date(2023, 8, 1, 0, 0, 0); // 1 Sep 2023
    const endOfPeriod = new Date(2026, 9, 1, 0, 0, 0);  // 1 Oct 2026
    
    // Testing different params to see what API accepts
    const params = {
      tipoData: 'criacao',
      dataInicial: formatDateForVendizap(startOfMonth),
      dataFinal: formatDateForVendizap(now),
      cancelados: false,
      somenteNovos: false,
      skip: 0,
      limit: 10
    };
    console.log("Fetching orders with params:", params);

    const res = await client.get('/pedidos', { params });
    console.log("=== ORDERS ===");
    console.log(JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error(err.response ? err.response.data : err.message);
  }
}
test();
