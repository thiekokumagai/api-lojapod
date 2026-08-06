const http = require('http');

const data = JSON.stringify({
  customerName: "Teste",
  customerPhone: "11999999999",
  itemsTotal: 150,
  freight: 10,
  discount: 0,
  totalOrder: 160,
  totalReceived: 0,
  paymentType: "Online",
  paymentMethod: "PIX",
  street: "Rua",
  number: "1",
  neighborhood: "Bairro",
  city: "Cidade",
  state: "SP",
  cep: "00000000",
  items: [
    {
      productName: "Item 1",
      price: 150,
      quantity: 1
    }
  ],
  couponTitle: "TESTEPORCENTAGEM"
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/orders',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, res => {
  console.log(`statusCode: ${res.statusCode}`);
  let responseData = '';
  res.on('data', d => {
    responseData += d;
  });
  res.on('end', () => {
    console.log(responseData);
  });
});

req.on('error', error => {
  console.error(error);
});

req.write(data);
req.end();
