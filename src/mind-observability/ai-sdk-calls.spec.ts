import { AiSdkCalls } from './ai-sdk-calls';

describe('AiSdkCalls', () => {
  let clock: number;
  const now = () => clock;

  beforeEach(() => {
    clock = 0;
  });

  it('keeps the state of a call until it finishes', () => {
    const calls = new AiSdkCalls<string>(jest.fn(), { now });
    calls.start('call-1', 'state');
    expect(calls.get('call-1')).toBe('state');
    expect(calls.finish('call-1')).toBe('state');
    expect(calls.get('call-1')).toBeUndefined();
    expect(calls.finish('call-1')).toBeUndefined();
  });

  it('expires the calls older than the maximum age, and only those', () => {
    const onExpire = jest.fn();
    const calls = new AiSdkCalls<string>(onExpire, { now, maxAgeMs: 1000 });
    calls.start('old', 'old state');
    clock = 600;
    calls.start('young', 'young state');
    clock = 1200;
    calls.sweep();

    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(onExpire).toHaveBeenCalledWith('old state');
    expect(calls.get('old')).toBeUndefined();
    expect(calls.get('young')).toBe('young state');
  });

  it('expires the oldest call when the maximum number of open calls is reached', () => {
    const onExpire = jest.fn();
    const calls = new AiSdkCalls<string>(onExpire, { now, maxOpenCalls: 2 });
    calls.start('first', 'first state');
    calls.start('second', 'second state');
    calls.start('third', 'third state');

    expect(onExpire).toHaveBeenCalledWith('first state');
    expect(calls.get('second')).toBe('second state');
    expect(calls.get('third')).toBe('third state');
  });

  it('restarts a call id at the end of the order, with a new age', () => {
    const onExpire = jest.fn();
    const calls = new AiSdkCalls<string>(onExpire, { now, maxAgeMs: 1000 });
    calls.start('call-1', 'first try');
    clock = 900;
    calls.start('call-1', 'second try');
    clock = 1500;
    calls.sweep();

    expect(onExpire).not.toHaveBeenCalled();
    expect(calls.get('call-1')).toBe('second try');
  });
});
