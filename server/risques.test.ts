import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RISQUES } from './risques.js';

describe('RISQUES', () => {
  const expectedCodes = [
    'argiles',
    'mouvement_terrain',
    'cavites',
    'inondations',
    'catnat',
    'icpe',
    'installations_nucleaires',
  ];

  it('contains all expected risk codes in order', () => {
    const codes = RISQUES.map((r: any) => r.code);
    expect(codes).toEqual(expectedCodes);
  });

  it('each risk has the required properties', () => {
    for (const risque of RISQUES as any[]) {
      expect(risque).toHaveProperty('code');
      expect(risque).toHaveProperty('libelle');
      expect(typeof risque.libelle).toBe('string');
      expect(typeof risque.fetch).toBe('function');
      expect(typeof risque.text).toBe('function');
      expect(risque.outputSchema).toBeDefined();
      expect(Array.isArray(risque.layers)).toBe(true);
    }
  });

  it('each layer has id, nom, source, layer and legend', () => {
    for (const risque of RISQUES as any[]) {
      for (const layer of risque.layers) {
        expect(typeof layer.id).toBe('string');
        expect(typeof layer.nom).toBe('string');
        expect(typeof layer.source).toBe('function');
        expect(layer.layer).toBeDefined();
        expect(typeof layer.legend).toBe('function');
      }
    }
  });
});

describe("inondations.fetch (v1)", () => {
  const inondations = (RISQUES as any[]).find(r => r.code === 'inondations');
  const originalToken = process.env.API_V2_TOKEN;

  beforeEach(() => {
    delete process.env.API_V2_TOKEN;
  });

  afterEach(() => {
    if (originalToken !== undefined) {
      process.env.API_V2_TOKEN = originalToken;
    } else {
      delete process.env.API_V2_TOKEN;
    }
    vi.restoreAllMocks();
  });

  it('ne conserve que les PPRN dont le modeleProcedure est PPRN-I ou PPRN-Multi', async () => {
    const pprnPayload = {
      totalElements: 4,
      content: [
        { libPpr: 'PPRN-I Nîmes', modeleProcedure: 'PPRN-I', dateModification: '24/03/2025' },
        { libPpr: 'PPRN-Mvt Pougny', modeleProcedure: 'PPRN-Mvt', dateModification: '24/03/2025' },
        { libPpr: 'PPRN-Multi Tenay', modeleProcedure: 'PPRN-Multi', dateModification: '26/03/2025' },
        { libPpr: 'PPRN-RGA Privas', modeleProcedure: 'PPRN-RGA', dateModification: '18/02/2025' },
      ],
    };

    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      const path = new URL(url).pathname;
      const body = path === '/api/v1/gaspar/pprn' ? pprnPayload : { data: [] };
      return Promise.resolve({
        ok: true,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: vi.fn().mockResolvedValue(body),
      });
    }));

    const result = await inondations.fetch(4.3601, 43.8367);

    expect(result.ppr.total).toBe(2);
    expect(result.ppr.plans.map((p: any) => p.libelle)).toEqual([
      'PPRN-I Nîmes',
      'PPRN-Multi Tenay',
    ]);
    expect(result.ppr.plans.every((p: any) => p.risque === 'Inondation')).toBe(true);
  });

  it("n'appelle plus l'endpoint v1 supprimé api/v1/ppr et n'envoie pas codesAlea (inopérant en v1)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: vi.fn().mockResolvedValue({ totalElements: 0, content: [], data: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await inondations.fetch(4.3601, 43.8367);

    const urls = fetchMock.mock.calls.map((c: any[]) => c[0] as string);
    expect(urls.some(u => u.includes('/api/v1/ppr?'))).toBe(false);
    const pprnCall = urls.find(u => u.includes('/api/v1/gaspar/pprn'));
    expect(pprnCall).toBeDefined();
    expect(pprnCall).not.toContain('codesAlea');
  });
});
