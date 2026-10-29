/**
 * Testes executados:
 * - descarrega no SIGTERM e o reenvia quando ninguém mais escuta
 * - descarrega no SIGINT e o reenvia quando ninguém mais escuta
 * - não reenvia o sinal quando a aplicação tem um handler próprio
 * - continua escutando enquanto o descarregamento corre, para um sinal reenviado pelo NestJS esperar por ele
 * - descarrega uma vez só no beforeExit e quando o serviço chama shutdownObservability
 * - para de esperar um encerramento travado depois de 5 s
 * - sobrevive a um encerramento que falha
 */

import { registerShutdown, shutdownObservability } from './observability-shutdown';

/** Factories/helpers: espera as promises pendentes com o `setImmediate` real, que os timers falsos não alcançam. */
const flushPromises = () => new Promise<void>((resolve) => jest.requireActual('timers').setImmediate(resolve));

/** Testes */
describe('observability-shutdown', () => {
  let kill: jest.SpyInstance;
  let sdk: { shutdown: jest.Mock };

  beforeEach(() => {
    kill = jest.spyOn(process, 'kill').mockImplementation(() => true);
    sdk = { shutdown: jest.fn().mockResolvedValue(undefined) };
  });

  afterEach(() => {
    ['SIGTERM', 'SIGINT', 'beforeExit'].forEach((event) => process.removeAllListeners(event));
    kill.mockRestore();
    jest.useRealTimers();
  });

  it.each(['SIGTERM', 'SIGINT'] as const)('descarrega no %s e o reenvia quando ninguém mais escuta', async (signal) => {
    registerShutdown(sdk);
    process.emit(signal);
    await flushPromises();
    expect(sdk.shutdown).toHaveBeenCalledTimes(1);
    expect(kill).toHaveBeenCalledWith(process.pid, signal);
    expect(process.listenerCount('SIGTERM') + process.listenerCount('SIGINT')).toBe(0);
  });

  it('não reenvia o sinal quando a aplicação tem um handler próprio', async () => {
    registerShutdown(sdk);
    process.on('SIGTERM', jest.fn());
    process.emit('SIGTERM');
    await flushPromises();
    expect(sdk.shutdown).toHaveBeenCalledTimes(1);
    expect(kill).not.toHaveBeenCalled();
  });

  it('continua escutando enquanto o descarregamento corre, para um sinal reenviado pelo NestJS esperar por ele', async () => {
    let finishFlush: () => void;
    sdk.shutdown.mockReturnValue(new Promise<void>((resolve) => (finishFlush = resolve)));
    registerShutdown(sdk);
    const nestHandler = () => {
      process.removeListener('SIGTERM', nestHandler);
      process.emit('SIGTERM');
    };
    process.on('SIGTERM', nestHandler);

    process.emit('SIGTERM');
    await flushPromises();
    expect(process.listenerCount('SIGTERM')).toBe(1);
    expect(kill).not.toHaveBeenCalled();

    finishFlush();
    await flushPromises();
    expect(sdk.shutdown).toHaveBeenCalledTimes(1);
    expect(kill).toHaveBeenCalledWith(process.pid, 'SIGTERM');
  });

  it('descarrega uma vez só no beforeExit e quando o serviço chama shutdownObservability', async () => {
    registerShutdown(sdk);
    process.emit('beforeExit', 0);
    await shutdownObservability();
    expect(sdk.shutdown).toHaveBeenCalledTimes(1);
  });

  it('para de esperar um encerramento travado depois de 5 s', async () => {
    jest.useFakeTimers();
    sdk.shutdown.mockReturnValue(new Promise(() => undefined));
    registerShutdown(sdk);
    process.emit('SIGTERM');
    expect(kill).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(5000);
    expect(kill).toHaveBeenCalledWith(process.pid, 'SIGTERM');
  });

  it('sobrevive a um encerramento que falha', async () => {
    sdk.shutdown.mockRejectedValue(new Error('collector down'));
    registerShutdown(sdk);
    await expect(shutdownObservability()).resolves.toBeUndefined();
  });
});
