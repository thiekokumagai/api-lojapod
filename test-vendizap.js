const axios = require('axios');

async function test() {
  try {
    const res = await axios.get('https://v3.vendizap.com/api/categories', {
      headers: {
        'X-Auth-Id': '906795',
        'X-Auth-Secret': 'GHMla7Nebr#uITLn0jA9tCy?FJx%UBh1'
      }
    });
    console.log("Success with v3.vendizap.com/api/categories");
    console.log(res.status, res.data);
  } catch (e) {
    console.log("Failed v3.vendizap.com/api/categories", e.message, e.response?.data, e.response?.status);
  }

  try {
    const res = await axios.get('https://api.vendizap.com/v3/categories', {
      headers: {
        'X-Auth-Id': '906795',
        'X-Auth-Secret': 'GHMla7Nebr#uITLn0jA9tCy?FJx%UBh1'
      }
    });
    console.log("Success with api.vendizap.com/v3/categories");
    console.log(res.status, res.data);
  } catch (e) {
    console.log("Failed api.vendizap.com/v3/categories", e.message, e.response?.data, e.response?.status);
  }

  try {
    const res = await axios.get('https://app.vendizap.com/api/categories', {
      headers: {
        'X-Auth-Id': '906795',
        'X-Auth-Secret': 'GHMla7Nebr#uITLn0jA9tCy?FJx%UBh1'
      }
    });
    console.log("Success with app.vendizap.com/api/categories");
    console.log(res.status, res.data);
  } catch (e) {
    console.log("Failed app.vendizap.com/api/categories", e.message, e.response?.data, e.response?.status);
  }
}

test();
