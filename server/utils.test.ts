import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callGeorisqueAPI, makeRasterGeorisqueSource, toIsoDate, toFrenchDate } from './utils.js';

describe('callGeorisqueAPI', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('throws on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    }));

    await expect(
      callGeorisqueAPI('api/v1/rga', new URLSearchParams({ latlon: '2.0,48.0' }), {})
    ).rejects.toThrow("Erreur lors de l'appel à l'API Géorisques 'api/v1/rga' : 500 Internal Server Error");
  });

  it('explains a 410 Gone response (v1 endpoint retired)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 410, statusText: 'Gone' }));
    await expect(
      callGeorisqueAPI('api/v1/gaspar/catnat', new URLSearchParams(), {})
    ).rejects.toThrow(/410 Gone \(endpoint retiré par Géorisques : configurez API_V2_TOKEN/);
  });

  it('wraps network errors with the endpoint name', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    await expect(
      callGeorisqueAPI('api/v1/rga', new URLSearchParams(), {})
    ).rejects.toThrow("Erreur lors de l'appel à l'API Géorisques 'api/v1/rga' : fetch failed");
  });

  it('returns parsed JSON on success', async () => {
    const mockData = { exposition: 'Forte', codeExposition: '3' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: vi.fn().mockResolvedValue(mockData),
    }));

    const result = await callGeorisqueAPI(
      'api/v1/rga',
      new URLSearchParams({ latlon: '2.0,48.0' }),
      { exposition: 'Non exposé', codeExposition: '0' }
    );
    expect(result).toEqual(mockData);
  });

  it('returns default payload when response is not JSON', async () => {
    const defaultPayload = { exposition: 'Non exposé', codeExposition: '0' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'Content-Type': 'text/plain' }),
    }));

    const result = await callGeorisqueAPI(
      'api/v1/rga',
      new URLSearchParams({ latlon: '2.0,48.0' }),
      defaultPayload
    );
    expect(result).toEqual(defaultPayload);
  });

  it('constructs the correct URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: vi.fn().mockResolvedValue({}),
    });
    vi.stubGlobal('fetch', fetchMock);

    await callGeorisqueAPI('api/v1/rga', new URLSearchParams({ latlon: '2.0,48.0' }), {});
    expect(fetchMock).toHaveBeenCalledWith('https://www.georisques.gouv.fr/api/v1/rga?latlon=2.0%2C48.0', expect.objectContaining({ headers: { 'Accept': 'application/json' } }));
  });

  it('sets up authorization header appropriately', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: vi.fn().mockResolvedValue({}),
    });
    vi.stubGlobal('fetch', fetchMock);

    await callGeorisqueAPI('api/v2/rga', new URLSearchParams({ longitude: '2.0', latitude: '48.0' }), {}, 'token');
    expect(fetchMock).toHaveBeenCalledWith('https://www.georisques.gouv.fr/api/v2/rga?longitude=2.0&latitude=48.0', expect.objectContaining({ headers: { 'Accept': 'application/json', 'Authorization': 'Bearer token' } }));
  });
});

describe('makeRasterGeorisqueSource', () => {
  it('returns a raster source with correct tile URL', () => {
    const source = makeRasterGeorisqueSource('ALEARG');
    expect(source.type).toBe('raster');
    expect(source.tiles[0]).toContain('LAYERS=ALEARG');
    expect(source.tileSize).toBe(256);
    expect(source.maxzoom).toBe(16);
  });
});

describe('toIsoDate / toFrenchDate', () => {
  it('normalizes v1 (DD/MM/YYYY) and v2 (ISO) dates', () => {
    expect(toIsoDate('19/11/2026')).toBe('2026-11-19');
    expect(toIsoDate('2026-11-19')).toBe('2026-11-19');
    expect(toIsoDate('2026-11-19T10:00:00Z')).toBe('2026-11-19');
  });

  it('returns null for missing or invalid dates', () => {
    expect(toIsoDate(null)).toBeNull();
    expect(toIsoDate(undefined)).toBeNull();
    expect(toIsoDate('')).toBeNull();
    expect(toIsoDate('31/02/2025')).toBeNull();
    expect(toIsoDate('n/a')).toBeNull();
  });

  it('formats ISO dates for text output', () => {
    expect(toFrenchDate('2026-11-19')).toBe('19/11/2026');
    expect(toFrenchDate(null)).toBeNull();
  });
});

describe('callGeorisqueAPI : déduplication des requêtes concurrentes', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const jsonResponse = (body: any) => ({
    ok: true,
    headers: new Headers({ 'Content-Type': 'application/json' }),
    json: vi.fn().mockResolvedValue(body),
  });

  it("n'émet qu'une requête pour des appels identiques simultanés, chaque appelant recevant sa copie", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ content: [{ id: 1 }] }));
    vi.stubGlobal('fetch', fetchMock);
    const params = () => new URLSearchParams({ longitude: '4.36', latitude: '43.83' });

    const [a, b] = await Promise.all([
      callGeorisqueAPI('api/v1/gaspar/pprn', params(), {}),
      callGeorisqueAPI('api/v1/gaspar/pprn', params(), {}),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toEqual({ content: [{ id: 1 }] });
    a.content.push({ id: 2 });
    expect(b).toEqual({ content: [{ id: 1 }] });
  });

  it('ne garde rien en cache une fois la requête terminée', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ n: 1 }))
      .mockResolvedValueOnce(jsonResponse({ n: 2 }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await callGeorisqueAPI('api/v1/rga', new URLSearchParams(), {})).toEqual({ n: 1 });
    expect(await callGeorisqueAPI('api/v1/rga', new URLSearchParams(), {})).toEqual({ n: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('distingue les appels avec et sans jeton', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({})));
    vi.stubGlobal('fetch', fetchMock);

    await Promise.all([
      callGeorisqueAPI('api/v2/rga', new URLSearchParams(), {}, 'token'),
      callGeorisqueAPI('api/v2/rga', new URLSearchParams(), {}),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("applique la valeur par défaut propre à chaque appelant si la réponse n'est pas du JSON", async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, headers: new Headers() }));
    const [a, b] = await Promise.all([
      callGeorisqueAPI('api/v1/rga', new URLSearchParams(), { a: 1 }),
      callGeorisqueAPI('api/v1/rga', new URLSearchParams(), { b: 2 }),
    ]);
    expect(a).toEqual({ a: 1 });
    expect(b).toEqual({ b: 2 });
  });
});
