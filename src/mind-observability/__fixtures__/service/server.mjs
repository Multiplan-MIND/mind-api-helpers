/**
 * Serviço do register.e2e.spec.ts com `-r register`: as mesmas requisições do server.cjs, em ESM. O
 * `node:http` é instrumentado mesmo sem o hook ESM, então o `ioredis`, carregado por `import`, é o que prova o hook.
 */
import http from 'node:http';
import Redis from 'ioredis';

const server = http.createServer((req, res) => res.end('ok'));
server.listen(0, '127.0.0.1', async () => {
  const { port } = server.address();
  await fetch(`http://127.0.0.1:${port}/customers/5521987654321?email=ana@example.com`);
  process.stdout.write(`esm-patched=${Boolean(Redis.prototype.sendCommand.__wrapped)}\n`);
  server.close();
  process.kill(process.pid, 'SIGTERM');
});
