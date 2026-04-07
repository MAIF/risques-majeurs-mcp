import { describe, it, expect } from 'vitest';
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
