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
    'feux_foret',
    'avalanche',
    'risques_miniers',
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

// --- Helpers de test : simule les réponses de l'API Géorisques par chemin ---
const stubGeorisques = (payloads: Record<string, any>) => {
  const fetchMock = vi.fn().mockImplementation((url: string) => {
    const path = new URL(url).pathname;
    const body = payloads[path];
    return Promise.resolve({
      ok: true,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: vi.fn().mockResolvedValue(body ?? { data: [], totalElements: 0, content: [] }),
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const risque = (code: string) => (RISQUES as any[]).find(r => r.code === code);

describe('fetch / outputSchema / text (v1)', () => {
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
    vi.unstubAllGlobals();
  });

  it("argiles : texte sans accolade parasite et score 0 quand l'API ne renvoie rien", async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, headers: new Headers() }));
    const r = risque('argiles');
    const exposition = await r.fetch(2.3522, 48.8566);
    expect(exposition).toEqual({ libelle: 'Non exposé', score: 0, ppr: { total: 0, perimetre: 'adresse', plans: [] } });
    expect(r.outputSchema.safeParse(exposition).success).toBe(true);
    expect(r.text(exposition)).toBe(
      "Le niveau d'exposition au risque de retrait-gonflement des argiles à l'adresse indiquée est : Non exposé (score de 0 sur 3)"
      + "\n\n0 plans de prévention des risques de retrait-gonflement des argiles applicables à l'adresse indiquée."
    );
  });

  it('mouvement_terrain : accepte les champs null renvoyés par la v1', async () => {
    stubGeorisques({
      '/api/v1/mvt': {
        data: [
          { type: 'Effondrement / Affaissement', lieu: null, commentaire_lieu: null, date_debut: null, longitude: 4.3, latitude: 43.8 },
          { type: 'Chute de blocs / Eboulement', lieu: 'Carrière du Chemin de la Cigale', commentaire_lieu: null, date_debut: '1980-01-01', longitude: 4.31, latitude: 43.81 },
        ],
      },
    });
    const r = risque('mouvement_terrain');
    const exposition = await r.fetch(4.3601, 43.8367);
    expect(r.outputSchema.safeParse(exposition).success).toBe(true);
    const text = r.text(exposition);
    expect(text).not.toContain('null');
    expect(text).not.toMatch(/,\n/);
    expect(text).toContain('\n  - Effondrement / Affaissement\n  - Chute de blocs / Eboulement au lieu Carrière du Chemin de la Cigale le 01/01/1980');
  });

  it('cavites : regroupe par type sans virgule parasite', async () => {
    stubGeorisques({
      '/api/v1/cavites': {
        data: [
          { type: 'naturelle', nom: 'Aven de la CIGALE', longitude: 4.3, latitude: 43.8 },
          { type: 'naturelle', nom: 'Source du BRIQUET', longitude: 4.3, latitude: 43.8 },
          { type: 'carrière', nom: null, longitude: 4.3, latitude: 43.8 },
        ],
      },
    });
    const r = risque('cavites');
    const exposition = await r.fetch(4.3601, 43.8367);
    expect(r.outputSchema.safeParse(exposition).success).toBe(true);
    const text = r.text(exposition);
    expect(text).not.toMatch(/,\n/);
    expect(text).toContain('Cavités de type "naturelle" :\n  - Aven de la CIGALE\n  - Source du BRIQUET');
    expect(text).toContain('Cavités de type "carrière" :\n  - Cavité sans nom');
  });

  it("inondations : sortie valide et PPR limités à ceux applicables à l'adresse en v1", async () => {
    stubGeorisques({
      '/api/v1/gaspar/tri': {
        data: [{ libelle_tri: 'TRI Métropole Francilienne', liste_libelle_risque: [{ libelle_risque_long: 'Inondation' }], code_insee: '75056', libelle_commune: 'Paris', date_arrete_pcb: '27/11/2012' }],
      },
      '/api/v1/gaspar/azi': {
        data: [{ libelle_azi: 'BV Vidourle', liste_libelle_risque: [], code_insee: null, libelle_commune: null, date_debut_information: null }],
      },
      '/api/v1/gaspar/pprn': {
        totalElements: 1,
        content: [{ libPpr: 'PPRN-I - Nîmes', modeleProcedure: 'PPRN-I', dateModification: '19/11/2026' }],
      },
    });
    const r = risque('inondations');
    const exposition = await r.fetch(4.3601, 43.8367);
    expect(r.outputSchema.safeParse(exposition).success).toBe(true);
    expect(exposition.tri.zones[0].date).toBe('2012-11-27');
    expect(exposition.azi.zones[0]).toMatchObject({ code_insee: '', commune: '', date: null });
    expect(exposition.ppr).toMatchObject({ total: 1, perimetre: 'adresse' });
    const text = r.text(exposition);
    expect(text).not.toMatch(/,\n/);
    expect(text).toContain("1 plans de prévention des inondations applicables à l'adresse indiquée.");
    expect(text).toContain('PPRN-I - Nîmes (mis à jour le 19/11/2026)');
  });

  it("inondations : n'envoie pas de rayon à api/v1/gaspar/pprn (paramètre inexistant)", async () => {
    const fetchMock = stubGeorisques({});
    await risque('inondations').fetch(4.3601, 43.8367);
    const pprnCall = fetchMock.mock.calls.map((c: any[]) => c[0] as string).find(u => u.includes('/api/v1/gaspar/pprn'));
    expect(pprnCall).toBeDefined();
    expect(pprnCall).not.toContain('rayon');
  });

  it('catnat : trie par date décroissante et ignore les dates absentes', async () => {
    stubGeorisques({
      '/api/v1/gaspar/catnat': {
        data: [
          { libelle_risque_jo: 'Inondations et/ou Coulées de Boue', code_insee: '30189', libelle_commune: 'Nîmes', date_debut_evt: '11/02/1987' },
          { libelle_risque_jo: 'Sécheresse', code_insee: '30189', libelle_commune: 'Nîmes', date_debut_evt: null },
          { libelle_risque_jo: 'Inondations et/ou Coulées de Boue', code_insee: '30189', libelle_commune: 'Nîmes', date_debut_evt: '03/10/1988' },
        ],
      },
    });
    const r = risque('catnat');
    const exposition = await r.fetch(4.3601, 43.8367);
    expect(r.outputSchema.safeParse(exposition).success).toBe(true);
    expect(exposition.catnat.map((c: any) => c.date)).toEqual(['1988-10-03', '1987-02-11', null]);
    expect(r.text(exposition)).not.toMatch(/,\n/);
  });

  it('icpe : ne garde que les Seveso, quel que soit le format du statut', async () => {
    stubGeorisques({
      '/api/v1/installations_classees': {
        data: [
          { raisonSociale: 'A', statutSeveso: 'Seveso seuil haut', longitude: 4.9, latitude: 43.4 },
          { raisonSociale: 'B', statutSeveso: 'SEUIL_BAS', longitude: 4.9, latitude: 43.4 },
          { raisonSociale: 'C', statutSeveso: 'Non Seveso', longitude: 4.9, latitude: 43.4 },
          { raisonSociale: 'D', statutSeveso: 'NON_SEVESO', longitude: 4.9, latitude: 43.4 },
          { raisonSociale: 'E', statutSeveso: null, longitude: 4.9, latitude: 43.4 },
        ],
      },
    });
    const r = risque('icpe');
    const exposition = await r.fetch(4.9, 43.4);
    expect(r.outputSchema.safeParse(exposition).success).toBe(true);
    expect(exposition.installations.map((i: any) => [i.raisonSociale, i.seveso])).toEqual([
      ['A', 'seveso_seuil_haut'],
      ['B', 'seveso_seuil_bas'],
    ]);
  });

  it('installations_nucleaires : rayon_ppi null quand il n\'y a pas de PPI', async () => {
    stubGeorisques({
      '/api/v1/installations_nucleaires': [
        { nomInstallationNucleaire: 'Atalante', typeInstallationNucleaire: 'Activités de recherche', ppi: true, rayon_ppi: 10000.0, longitude: 4.7, latitude: 44.1 },
        { nomInstallationNucleaire: 'Autre', typeInstallationNucleaire: 'Autre', ppi: false, rayon_ppi: null, longitude: 4.7, latitude: 44.1 },
      ],
    });
    const r = risque('installations_nucleaires');
    const exposition = await r.fetch(4.7, 44.1);
    expect(r.outputSchema.safeParse(exposition).success).toBe(true);
    expect(exposition.installations.map((i: any) => i.rayon_ppi)).toEqual([10000, null]);
  });
});

describe('couches WMS', () => {
  it("n'utilise plus la couche PPRN_INOND retirée du service WMS Géorisques", () => {
    const layers = (RISQUES as any[]).flatMap(r => r.layers);
    const tiles = layers
      .map((l: any) => { try { return l.source({ installations: [] }); } catch { return {}; } })
      .flatMap((s: any) => s.tiles ?? []);
    expect(tiles.some((t: string) => t.includes('LAYERS=PPRN_INOND'))).toBe(false);
    expect(tiles.some((t: string) => t.includes('LAYERS=SUP_INOND'))).toBe(true);
  });
});

describe('catnat.fetch (v2)', () => {
  const originalToken = process.env.API_V2_TOKEN;

  beforeEach(() => {
    process.env.API_V2_TOKEN = 'token';
  });

  afterEach(() => {
    if (originalToken !== undefined) {
      process.env.API_V2_TOKEN = originalToken;
    } else {
      delete process.env.API_V2_TOKEN;
    }
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("utilise api/v2/gaspar/catnat et aplatit communes → procédures → périls", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: vi.fn().mockResolvedValue({
        totalElements: 1,
        content: [{
          nom: 'Nîmes',
          codeInsee: '30189',
          procedures: [
            { idGaspar: 'A', libelle: 'Arrêté A', perils: [{ libelle: 'Inondations et/ou Coulées de Boue', dateDebut: '1988-10-03T00:00:00Z' }] },
            { idGaspar: 'B', libelle: 'Arrêté B', perils: [
              { libelle: 'Sécheresse', dateDebut: '2022-07-01T00:00:00Z' },
              { libelle: 'Sécheresse', dateDebut: '2022-04-01T00:00:00Z' },
            ] },
            { idGaspar: 'C', libelle: 'Arrêté C', perils: [] },
          ],
        }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const r = risque('catnat');
    const exposition = await r.fetch(4.3601, 43.8367);

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('/api/v2/gaspar/catnat?');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer token');
    expect(r.outputSchema.safeParse(exposition).success).toBe(true);
    expect(exposition.catnat).toEqual([
      { type: 'Sécheresse', code_insee: '30189', commune: 'Nîmes', date: '2022-04-01' },
      { type: 'Inondations et/ou Coulées de Boue', code_insee: '30189', commune: 'Nîmes', date: '1988-10-03' },
      { type: 'Arrêté C', code_insee: '30189', commune: 'Nîmes', date: null },
    ]);
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

describe('PPR (v2)', () => {
  const originalToken = process.env.API_V2_TOKEN;

  beforeEach(() => {
    process.env.API_V2_TOKEN = 'token';
  });

  afterEach(() => {
    if (originalToken !== undefined) {
      process.env.API_V2_TOKEN = originalToken;
    } else {
      delete process.env.API_V2_TOKEN;
    }
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([
    ['argiles', 'SEC'],
    ['mouvement_terrain', 'MVT'],
    ['inondations', 'INOND'],
  ])("%s : interroge api/v2/gaspar/pprn avec codesAlea=%s et un rayon de 5 km", async (code, codeAlea) => {
    const fetchMock = stubGeorisques({});
    const exposition = await risque(code).fetch(4.3601, 43.8367);
    const pprnCall = fetchMock.mock.calls.map((c: any[]) => c[0] as string).find(u => u.includes('/api/v2/gaspar/pprn'));
    expect(pprnCall).toBeDefined();
    const params = new URL(pprnCall!).searchParams;
    expect(params.get('codesAlea')).toBe(codeAlea);
    expect(params.get('rayon')).toBe('5000');
    expect(exposition.ppr.perimetre).toBe('rayon');
  });

  it('icpe : interroge api/v2/gaspar/pprt sans codesAlea', async () => {
    const fetchMock = stubGeorisques({});
    await risque('icpe').fetch(4.8589, 45.6731);
    const pprtCall = fetchMock.mock.calls.map((c: any[]) => c[0] as string).find(u => u.includes('/api/v2/gaspar/pprt'));
    expect(pprtCall).toBeDefined();
    expect(new URL(pprtCall!).searchParams.has('codesAlea')).toBe(false);
  });
});

describe('PPRN-Multi (v1) : filtrage sur les aléas réellement couverts', () => {
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
    vi.unstubAllGlobals();
  });

  // Liste v1 de la commune : un PPRN-Multi inondation + mouvement de terrain (cas de Tenay)
  const liste = {
    totalElements: 1,
    content: [{ idGaspar: '01DDT19970011', libPpr: 'PPRi PPRmt_Tenay', modeleProcedure: 'PPRN-Multi', dateModification: '26/03/2025' }],
  };
  const detail = {
    idGaspar: '01DDT19970011',
    communes: [{
      nom: 'TENAY',
      codeInsee: '01416',
      aleas: [
        { codeGaspar: '11', libelle: 'Inondation', sousAlea: [{ codeGaspar: '112' }, { codeGaspar: '113' }] },
        { codeGaspar: '12', libelle: 'Mouvement de terrain', sousAlea: [{ codeGaspar: '123' }, { codeGaspar: '124' }] },
      ],
    }],
  };

  it.each([
    ['argiles', 0],
    ['mouvement_terrain', 1],
    ['inondations', 1],
  ])("%s : %i plan(s) retenu(s)", async (code, attendu) => {
    const fetchMock = stubGeorisques({
      '/api/v1/gaspar/pprn': liste,
      '/api/v1/gaspar/pprn/01DDT19970011': detail,
    });
    const exposition = await risque(code).fetch(5.5097, 45.9186);
    expect(exposition.ppr.total).toBe(attendu);
    const urls = fetchMock.mock.calls.map((c: any[]) => c[0] as string);
    expect(urls.some(u => u.includes('/api/v1/gaspar/pprn/01DDT19970011'))).toBe(true);
  });

  it('argiles : retient un PPRN-Multi couvrant les tassements différentiels (127)', async () => {
    stubGeorisques({
      '/api/v1/gaspar/pprn': liste,
      '/api/v1/gaspar/pprn/01DDT19970011': {
        communes: [{ aleas: [{ codeGaspar: '12', sousAlea: [{ codeGaspar: '127' }] }] }],
      },
    });
    expect((await risque('argiles').fetch(5.5097, 45.9186)).ppr.total).toBe(1);
    expect((await risque('mouvement_terrain').fetch(5.5097, 45.9186)).ppr.total).toBe(0);
  });

  it('conserve le PPRN-Multi si son détail est indisponible', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      const path = new URL(url).pathname;
      if (path === '/api/v1/gaspar/pprn/01DDT19970011') {
        return Promise.resolve({ ok: false, status: 503, statusText: 'Service Unavailable' });
      }
      return Promise.resolve({
        ok: true,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: vi.fn().mockResolvedValue(path === '/api/v1/gaspar/pprn' ? liste : { data: [] }),
      });
    }));
    expect((await risque('argiles').fetch(5.5097, 45.9186)).ppr.total).toBe(1);
  });
});

describe('risques_miniers.fetch (v1)', () => {
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
    vi.unstubAllGlobals();
  });

  it('interroge api/v1/gaspar/pprm et ne conserve que les PPRM', async () => {
    const fetchMock = stubGeorisques({
      '/api/v1/gaspar/pprm': {
        totalElements: 2,
        content: [
          { idGaspar: '07DDT20120001', libPpr: 'PRIVAS/VEYRAS PPR Minier', modeleProcedure: 'PPRM', dateModification: '12/03/2019' },
          { idGaspar: 'X', libPpr: 'Autre', modeleProcedure: 'PPRN-I', dateModification: null },
        ],
      },
    });
    const r = risque('risques_miniers');
    const exposition = await r.fetch(4.6014, 44.7397);

    expect(r.outputSchema.safeParse(exposition).success).toBe(true);
    expect(exposition.ppr).toMatchObject({ total: 1, perimetre: 'adresse' });
    expect(exposition.ppr.plans[0]).toEqual({ libelle: 'PRIVAS/VEYRAS PPR Minier', risque: 'Risque minier', commune: '', date: '2019-03-12' });
    expect(r.text(exposition)).toBe(
      "1 plans de prévention des risques miniers (PPRM) applicables à l'adresse indiquée. Voici la liste des plans de prévention :\n  - PRIVAS/VEYRAS PPR Minier (mis à jour le 12/03/2019)"
    );
    const urls = fetchMock.mock.calls.map((c: any[]) => c[0] as string);
    expect(urls.every(u => !u.includes('/api/v1/gaspar/pprn'))).toBe(true);
  });
});

// Nouveaux risques fondés sur les PPRN : filtrage sur `modeleProcedure` et, pour les
// PPRN-Multi, sur les aléas réellement couverts (détail v1).
const testRisquePprn = (code: string, modele: string, codesCouverts: string[], codesV2: string[]) => {
  describe(`${code}.fetch`, () => {
    const originalToken = process.env.API_V2_TOKEN;

    afterEach(() => {
      if (originalToken !== undefined) {
        process.env.API_V2_TOKEN = originalToken;
      } else {
        delete process.env.API_V2_TOKEN;
      }
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });

    const aleas = (codes: string[]) => ({
      communes: [{ aleas: codes.map(c => c.length === 2 ? { codeGaspar: c } : { codeGaspar: c.slice(0, 2), sousAlea: [{ codeGaspar: c }] }) }],
    });

    it(`v1 : retient ${modele} et les PPRN-Multi couvrant l'aléa, écarte les autres`, async () => {
      delete process.env.API_V2_TOKEN;
      stubGeorisques({
        '/api/v1/gaspar/pprn': {
          totalElements: 4,
          content: [
            { idGaspar: 'A', libPpr: `${modele} - Commune`, modeleProcedure: modele, dateModification: '01/02/2020' },
            { idGaspar: 'B', libPpr: 'Multi couvrant', modeleProcedure: 'PPRN-Multi', dateModification: null },
            { idGaspar: 'C', libPpr: 'Multi inondation', modeleProcedure: 'PPRN-Multi', dateModification: null },
            { idGaspar: 'D', libPpr: 'PPRN-I - Commune', modeleProcedure: 'PPRN-I', dateModification: null },
          ],
        },
        '/api/v1/gaspar/pprn/B': aleas(['11', ...codesCouverts]),
        '/api/v1/gaspar/pprn/C': aleas(['11', '112']),
      });
      const r = risque(code);
      const exposition = await r.fetch(5, 45);
      expect(r.outputSchema.safeParse(exposition).success).toBe(true);
      expect(exposition.ppr.plans.map((p: any) => p.libelle)).toEqual([`${modele} - Commune`, 'Multi couvrant']);
      expect(r.text(exposition)).toMatch(/^2 plans de prévention .* applicables à l'adresse indiquée\./);
    });

    it(`v2 : filtre via codesAlea=${codesV2.join(',')}`, async () => {
      process.env.API_V2_TOKEN = 'token';
      const fetchMock = stubGeorisques({});
      await risque(code).fetch(5, 45);
      const call = fetchMock.mock.calls.map((c: any[]) => c[0] as string).find(u => u.includes('/api/v2/gaspar/pprn'));
      expect(new URL(call!).searchParams.getAll('codesAlea')).toEqual(codesV2);
    });
  });
};

testRisquePprn('feux_foret', 'PPRN-IF', ['16'], ['FEUFORET']);
testRisquePprn('avalanche', 'PPRN-Av', ['14'], ['AVAL']);
