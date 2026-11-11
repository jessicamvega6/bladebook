import { afterEach, describe, expect, test, vi } from 'vitest';
import { ApiError, apiFetch } from './client';

function respond(status: number, body: unknown = {}) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('apiFetch', () => {
  test('sends the token and returns the JSON body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(200, { status: 'ok' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch('/api/coach/profile', { token: 'abc' })).resolves.toEqual({ status: 'ok' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/coach/profile');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer abc');
  });

  test('sends a body as JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(201, {}));
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/api/coach/signup', { method: 'POST', body: { a: 1 } });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"a":1}');
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
  });

  test('retries a GET once on a server error (ADR-MASTER section 1)', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(503, { error: 'SERVER' }))
      .mockResolvedValueOnce(respond(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch('/api/coach/profile')).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('retries a GET once when the network fails', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(respond(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch('/api/coach/profile')).resolves.toEqual({ ok: true });
  });

  test('gives up after the one retry', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(respond(500, { error: 'SERVER', message: 'Something went wrong on our side. Try again.' })));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch('/api/coach/profile')).rejects.toMatchObject({ status: 500, code: 'SERVER' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('never retries a write, which has no idempotency key yet', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(500, { error: 'SERVER' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch('/api/coach/profile/code/rotate', { method: 'POST' })).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('never retries a 4xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(404, { error: 'NO_PROFILE', message: 'Finish setting up your account first.' }));
    vi.stubGlobal('fetch', fetchMock);

    const err = await apiFetch('/api/coach/profile').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 404, code: 'NO_PROFILE', message: 'Finish setting up your account first.' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('carries the field a validation error names', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(400, { error: 'INVALID', message: 'Choose a time zone from the list.', field: 'coachTimezone' })));

    await expect(apiFetch('/api/coach/signup', { method: 'POST', body: {} })).rejects.toMatchObject({ field: 'coachTimezone' });
  });

  test('a body that is not JSON still gives a plain error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 400 })));

    await expect(apiFetch('/x', { method: 'POST' })).rejects.toMatchObject({ status: 400, code: 'UNKNOWN' });
  });

  test('retries a write once only when it carries an idempotency key (ADR-006 d4b)', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(500, { error: 'SERVER' }))
      .mockResolvedValueOnce(respond(200, { picks: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch('/api/client/bookings', { method: 'POST', body: { idempotencyKey: 'k' }, idempotent: true }))
      .resolves.toEqual({ picks: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].body).toBe(fetchMock.mock.calls[0][1].body);
  });

  test('a write without a key is never retried', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(500, { error: 'SERVER' }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(apiFetch('/api/client/me/contact', { method: 'PUT', body: {} })).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
