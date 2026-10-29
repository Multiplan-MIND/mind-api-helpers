import { startObservabilitySdk } from './observability-sdk';
import { isObservabilityEnabled, startObservability } from './start-observability';

jest.mock('./observability-sdk', () => ({ startObservabilitySdk: jest.fn(() => ({ started: true })) }));

const endpoint = { OTEL_EXPORTER_OTLP_ENDPOINT: 'http://alloy:4318' };

describe('startObservability', () => {
  beforeEach(() => jest.mocked(startObservabilitySdk).mockClear());

  it('is on with an endpoint and without OTEL_SDK_DISABLED', () => {
    expect(isObservabilityEnabled(endpoint)).toBe(true);
    expect(isObservabilityEnabled({ ...endpoint, OTEL_SDK_DISABLED: 'false' })).toBe(true);
  });

  it('is off with OTEL_SDK_DISABLED "true" in any letter case, or without an endpoint', () => {
    expect(isObservabilityEnabled({ ...endpoint, OTEL_SDK_DISABLED: 'true' })).toBe(false);
    expect(isObservabilityEnabled({ ...endpoint, OTEL_SDK_DISABLED: ' TRUE ' })).toBe(false);
    expect(isObservabilityEnabled({})).toBe(false);
    expect(isObservabilityEnabled({ OTEL_EXPORTER_OTLP_ENDPOINT: '  ' })).toBe(false);
  });

  it('does not start the SDK when off', () => {
    expect(startObservability({ ...endpoint, OTEL_SDK_DISABLED: 'true' })).toBeUndefined();
    expect(startObservability({})).toBeUndefined();
    expect(startObservabilitySdk).not.toHaveBeenCalled();
  });

  it('starts the SDK with the environment and the options when on', () => {
    expect(startObservability(endpoint, { esm: true })).toEqual({ started: true });
    expect(startObservabilitySdk).toHaveBeenCalledWith(endpoint, { esm: true });
  });

  it('swallows an SDK failure: one line on stderr and the app keeps running', () => {
    jest.mocked(startObservabilitySdk).mockImplementationOnce(() => {
      throw new Error('boom');
    });
    const write = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    expect(startObservability(endpoint)).toBeUndefined();
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0]).toContain('boom');
    write.mockRestore();
  });
});
