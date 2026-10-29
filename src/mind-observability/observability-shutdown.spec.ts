import { registerShutdown, shutdownObservability } from './observability-shutdown';

const flushPromises = () => new Promise<void>((resolve) => jest.requireActual('timers').setImmediate(resolve));

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

  it.each(['SIGTERM', 'SIGINT'] as const)('flushes on %s and re-raises it when nobody else listens', async (signal) => {
    registerShutdown(sdk);
    process.emit(signal);
    await flushPromises();
    expect(sdk.shutdown).toHaveBeenCalledTimes(1);
    expect(kill).toHaveBeenCalledWith(process.pid, signal);
    expect(process.listenerCount('SIGTERM') + process.listenerCount('SIGINT')).toBe(0);
  });

  it('does not re-raise the signal when the app has a handler of its own', async () => {
    registerShutdown(sdk);
    process.on('SIGTERM', jest.fn());
    process.emit('SIGTERM');
    await flushPromises();
    expect(sdk.shutdown).toHaveBeenCalledTimes(1);
    expect(kill).not.toHaveBeenCalled();
  });

  it('keeps listening while the flush runs, so a signal re-raised by NestJS waits for it', async () => {
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

  it('flushes once on beforeExit and when the service calls shutdownObservability', async () => {
    registerShutdown(sdk);
    process.emit('beforeExit', 0);
    await shutdownObservability();
    expect(sdk.shutdown).toHaveBeenCalledTimes(1);
  });

  it('stops waiting for a stuck shutdown after 5 s', async () => {
    jest.useFakeTimers();
    sdk.shutdown.mockReturnValue(new Promise(() => undefined));
    registerShutdown(sdk);
    process.emit('SIGTERM');
    expect(kill).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(5000);
    expect(kill).toHaveBeenCalledWith(process.pid, 'SIGTERM');
  });

  it('survives a failing shutdown', async () => {
    sdk.shutdown.mockRejectedValue(new Error('collector down'));
    registerShutdown(sdk);
    await expect(shutdownObservability()).resolves.toBeUndefined();
  });
});
