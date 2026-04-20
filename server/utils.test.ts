import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callGeorisqueAPI, makeRasterGeorisqueSource } from './utils.js';

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
    expect(fetchMock).toHaveBeenCalledWith('https://georisques.gouv.fr/api/v1/rga?latlon=2.0%2C48.0', { headers: {} });
  });

  it('sets up authorization header appropriately', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: vi.fn().mockResolvedValue({}),
    });
    vi.stubGlobal('fetch', fetchMock);

    await callGeorisqueAPI('api/v2/rga', new URLSearchParams({ longitude: '2.0', latitude: '48.0' }), {}, 'token');
    expect(fetchMock).toHaveBeenCalledWith('https://georisques.gouv.fr/api/v2/rga?longitude=2.0&latitude=48.0', { headers: { 'Authorization': 'Bearer token' } });
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
