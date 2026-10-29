// Service started by register.e2e.spec.ts with `--import register-esm`: the same requests as server.cjs, as ESM.
import http from 'node:http';

const server = http.createServer((req, res) => res.end('ok'));
server.listen(0, '127.0.0.1', async () => {
  const { port } = server.address();
  await fetch(`http://127.0.0.1:${port}/customers/5521987654321?email=ana@example.com`);
  server.close();
  process.kill(process.pid, 'SIGTERM');
});
