/** Serviço do register.e2e.spec.ts com `-r register`: uma requisição de entrada, um fetch de saída e o SIGTERM. */
const http = require('node:http');

const server = http.createServer((req, res) => res.end('ok'));
server.listen(0, '127.0.0.1', async () => {
  const { port } = server.address();
  await fetch(`http://127.0.0.1:${port}/customers/5521987654321?email=ana@example.com`);
  const sdkLoaded = Object.keys(require.cache).some((file) => file.includes('@opentelemetry/sdk-node'));
  process.stdout.write(`sdk-loaded=${sdkLoaded}\n`);
  server.close();
  process.kill(process.pid, 'SIGTERM');
});
