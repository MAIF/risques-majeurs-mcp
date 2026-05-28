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

// Mock fetch helper for the PPR filtering tests below: routes a given
// PPR endpoint path to a payload, returns empty for everything else.
const stubFetchForPpr = (pprPath: string, payload: any) => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
    const path = new URL(url).pathname;
    const body = path === pprPath ? payload : { totalElements: 0, content: [], data: [] };
    return Promise.resolve({
      ok: true,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: vi.fn().mockResolvedValue(body),
    });
  }));
};

const v1OnlyHooks = () => {
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
};

describe("mouvement_terrain.fetch (v1)", () => {
  const risque = (RISQUES as any[]).find(r => r.code === 'mouvement_terrain');
  v1OnlyHooks();

  it('ne conserve que les PPRN dont le modeleProcedure est PPRN-Mvt ou PPRN-Multi', async () => {
    stubFetchForPpr('/api/v1/gaspar/pprn', {
      totalElements: 4,
      content: [
        { libPpr: 'PPRN-Mvt Pougny', modeleProcedure: 'PPRN-Mvt', dateModification: '24/03/2025' },
        { libPpr: 'PPRN-I Nîmes', modeleProcedure: 'PPRN-I', dateModification: '24/03/2025' },
        { libPpr: 'PPRN-Multi Tenay', modeleProcedure: 'PPRN-Multi', dateModification: '26/03/2025' },
        { libPpr: 'PPRN-RGA Privas', modeleProcedure: 'PPRN-RGA', dateModification: '18/02/2025' },
      ],
    });

    const result = await risque.fetch(4.3601, 43.8367);

    expect(result.ppr.total).toBe(2);
    expect(result.ppr.plans.map((p: any) => p.libelle)).toEqual([
      'PPRN-Mvt Pougny',
      'PPRN-Multi Tenay',
    ]);
    expect(result.ppr.plans.every((p: any) => p.risque === 'Mouvement de terrain')).toBe(true);
  });
});

describe("argiles.fetch (v1)", () => {
  const risque = (RISQUES as any[]).find(r => r.code === 'argiles');
  v1OnlyHooks();

  it('ne conserve que les PPRN dont le modeleProcedure est PPRN-RGA ou PPRN-Multi', async () => {
    stubFetchForPpr('/api/v1/gaspar/pprn', {
      totalElements: 4,
      content: [
        { libPpr: 'PPRN-RGA Privas', modeleProcedure: 'PPRN-RGA', dateModification: '18/02/2025' },
        { libPpr: 'PPRN-I Nîmes', modeleProcedure: 'PPRN-I', dateModification: '24/03/2025' },
        { libPpr: 'PPRN-Multi Tenay', modeleProcedure: 'PPRN-Multi', dateModification: '26/03/2025' },
        { libPpr: 'PPRN-Mvt Pougny', modeleProcedure: 'PPRN-Mvt', dateModification: '24/03/2025' },
      ],
    });

    const result = await risque.fetch(4.3601, 43.8367);

    expect(result.ppr.total).toBe(2);
    expect(result.ppr.plans.map((p: any) => p.libelle)).toEqual([
      'PPRN-RGA Privas',
      'PPRN-Multi Tenay',
    ]);
    expect(result.ppr.plans.every((p: any) => p.risque === 'Retrait-gonflement des argiles')).toBe(true);
  });
});

describe("icpe.fetch (v1)", () => {
  const risque = (RISQUES as any[]).find(r => r.code === 'icpe');
  v1OnlyHooks();

  it('appelle api/v1/gaspar/pprt et ne conserve que les modeleProcedure PPRT', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      const path = new URL(url).pathname;
      let body: any = { totalElements: 0, content: [], data: [] };
      if (path === '/api/v1/gaspar/pprt') {
        body = {
          totalElements: 2,
          content: [
            { libPpr: 'Vallée de la chimie', modeleProcedure: 'PPRT', dateModification: '10/05/2017' },
            { libPpr: 'Autre type', modeleProcedure: 'PPRN-I', dateModification: '01/01/2020' },
          ],
        };
      }
      return Promise.resolve({
        ok: true,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: vi.fn().mockResolvedValue(body),
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await risque.fetch(4.8589, 45.6731);

    expect(result.ppr.total).toBe(1);
    expect(result.ppr.plans[0].libelle).toBe('Vallée de la chimie');
    expect(result.ppr.plans[0].risque).toBe('Technologique');

    // Vérifie qu'on n'appelle pas l'endpoint PPRN pour ce risque.
    const urls = fetchMock.mock.calls.map((c: any[]) => c[0] as string);
    expect(urls.some(u => u.includes('/api/v1/gaspar/pprn'))).toBe(false);
  });
});
