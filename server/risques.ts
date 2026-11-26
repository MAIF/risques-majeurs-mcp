import { z } from "zod";
import { circle } from "@turf/turf";
import {
  callGeorisqueAPI,
  toIsoDate,
  toFrenchDate,
  str,
  makeRasterGeorisqueSource,
  makeCircleSvg,
  makeSquareSvg,
  makeLineSvg,
  makeDiamondSvg,
  makeTriangleUpSvg,
  makeTriangleDownSvg,
  makeStarSvg,
  makeLegends,
  sanitize
} from './utils.js';


// Rayon de recherche (en mètres) utilisé pour les risques évalués autour d'un point.
const RAYON = '5000';

// Libellés uniques des aléas des communes d'une procédure GASPAR v2 (TRI, AZI, PAPI).
const aleasV2 = (procedure: any): string[] => {
  return [...new Set<string>((procedure.communes ?? [])
    .flatMap((c: any) => c.aleas ?? [])
    .map((a: any) => str(a.libelle))
    .filter((l: string) => l !== ''))];
};

// Procédure GASPAR v2 (TRI, AZI, PAPI) → format de sortie commun.
const procedureV2 = (p: any) => {
  const commune = p.communes?.[0];
  return {
    libelle: str(p.libelle),
    risques: aleasV2(p),
    code_insee: str(commune?.codeInsee),
    commune: str(commune?.nom),
    date: toIsoDate(p.dateModification)
  };
};

// Procédure GASPAR v1 (TRI, AZI, PAPI) → format de sortie commun.
const procedureV1 = (p: any, libelle: string, date: unknown) => {
  return {
    libelle: str(libelle),
    risques: (p.liste_libelle_risque ?? []).map((r: any) => str(r.libelle_risque_long)),
    code_insee: str(p.code_insee),
    commune: str(p.libelle_commune),
    date: toIsoDate(date)
  };
};

// Ne conserve que les PPRN qui concernent l'inondation
// (PPRN-I, et PPRN-Multi qui peut inclure l'aléa Inondation parmi d'autres).
const pprInondation = (data: any) => {
  return (data.content ?? []).filter((p: any) =>
    p.modeleProcedure === 'PPRN-I' || p.modeleProcedure === 'PPRN-Multi'
  );
};

// Normalise le statut Seveso : l'API renvoie un libellé ('Seveso seuil haut')
// ou un code ('SEUIL_HAUT') selon la version.
const statutSeveso = (statut: unknown): 'seveso_seuil_haut' | 'seveso_seuil_bas' | 'non_seveso' => {
  const s = str(statut).toLowerCase().replace(/_/g, ' ');
  if (s.includes('non')) return 'non_seveso';
  if (s.includes('haut')) return 'seveso_seuil_haut';
  if (s.includes('bas')) return 'seveso_seuil_bas';
  return 'non_seveso';
};

const installationsSeveso = (installations: any[]) => {
  return installations
    .map((i: any) => ({
      raisonSociale: str(i.raisonSociale),
      seveso: statutSeveso(i.statutSeveso),
      longitude: i.longitude,
      latitude: i.latitude
    }))
    .filter((i: any) => i.seveso !== 'non_seveso');
};

// Formate une liste d'éléments sous forme de puces pour les sorties textuelles.
const bullets = (items: string[]) => items.map(i => `\n  - ${i}`).join('');


export const RISQUES = [
  

  //========== RISQUE - Retrait-gonflement des argiles ==========//

  {
    code: 'argiles',
    libelle: 'Retrait-gonflement des argiles',
    fetch: async (longitude: number, latitude: number) => {
      // API Géorisques v2 si le jeton est configuré
      if (process.env.API_V2_TOKEN) {
        const params = new URLSearchParams({
          longitude: `${longitude}`,
          latitude: `${latitude}`,
        });
        const data: any = await callGeorisqueAPI('api/v2/rga', params, { totalElements: 0, content: [] }, process.env.API_V2_TOKEN);
        const rga = data.content?.[0];
        return {
          libelle: str(rga?.exposition) || 'Non exposé',
          score: parseInt(rga?.codeExposition, 10) || 0
        };
      } else {
        const params = new URLSearchParams({
          latlon: `${longitude},${latitude}`,
        });
        const data: any = await callGeorisqueAPI('api/v1/rga', params, { exposition: 'Non exposé', codeExposition: "0" });
        return {
          libelle: str(data.exposition) || 'Non exposé',
          score: parseInt(data.codeExposition, 10) || 0
        };
      }
    },
    outputSchema: z
          .object({
            libelle: z
              .string()
              .describe("Libellé du niveau d'exposition"),
            score: z
              .number()
              .gte(0)
              .lte(3)
              .describe("Valeur du niveau d'exposition")
          })
          .optional()
          .describe("Exposition au risque de retrait-gonflement des argiles"),
    text: (exposition: any) => {
      return `Le niveau d'exposition au risque de retrait-gonflement des argiles à l'adresse indiquée est : ${exposition.libelle} (score de ${exposition.score} sur 3)`;
    },
    layers: [
      {
        id: 'argiles',
        nom: 'Argiles',
        source: (exposition: any) => makeRasterGeorisqueSource('ALEARG'),
        layer: {
          type: 'raster'
        },
        legend: (exposition: any) : Node => makeLegends([
          [ makeSquareSvg({ fillOpacity: 1, fillColor: '#ef7070', strokeColor: '#ef7070', strokeWidth: 1 })!, 'Exposition forte'],
          [ makeSquareSvg({ fillOpacity: 1, fillColor: '#efc270', strokeColor: '#efc270', strokeWidth: 1 })!, 'Exposition moyenne'],
          [ makeSquareSvg({ fillOpacity: 1, fillColor: '#f0f0bd', strokeColor: '#f0f0bd', strokeWidth: 1 })!, 'Exposition faible']
        ])
      }
    ]
  },
  

  //========== RISQUE - Mouvements de terrain ==========//

  {
    code: 'mouvement_terrain',
    libelle: 'Mouvements de terrain',
    fetch: async (longitude: number, latitude: number) => {
      // API Géorisques v2 si le jeton est configuré
      if (process.env.API_V2_TOKEN) {
        const params = new URLSearchParams({
          longitude: `${longitude}`,
          latitude: `${latitude}`,
          rayon: RAYON,
          pageSize: '1000',
        });
        const data: any = await callGeorisqueAPI('api/v2/mvt', params, { totalElements: 0, content: [] }, process.env.API_V2_TOKEN);
        const mouvements = data.content ?? [];
        return {
          total: mouvements.length,
          mouvements: mouvements.map((m: any) => {
            return {
              type: str(m.type),
              lieu: str(m.lieu),
              commentaire: m.commentaireLieu ?? null,
              date: toIsoDate(m.dateDebut),
              longitude: m.longitude,
              latitude: m.latitude
            }
          })
        };
      } else {
        const params = new URLSearchParams({
          latlon: `${longitude},${latitude}`,
          rayon: RAYON,
          page_size: '1000'
        });
        const data: any = await callGeorisqueAPI('api/v1/mvt', params, { data: [] });
        const mouvements = data.data ?? [];
        return {
          total: mouvements.length,
          mouvements: mouvements.map((m: any) => {
            return {
              type: str(m.type),
              lieu: str(m.lieu),
              commentaire: m.commentaire_lieu ?? null,
              date: toIsoDate(m.date_debut),
              longitude: m.longitude,
              latitude: m.latitude
            }
          })
        };
      }
    },
    outputSchema: z
          .object({
            total: z
              .number()
              .gte(0)
              .describe("Nombre de mouvements de terrain à proximité"),
            mouvements: z
              .array(
                z
                  .object({
                    type: z
                      .string()
                      .describe("Type de mouvement"),
                    lieu: z
                      .string()
                      .describe("Lieu du mouvement"),
                    commentaire: z
                      .string()
                      .nullable()
                      .optional()
                      .describe("Précision sur le lieu"),
                    date: z
                      .iso.date()
                      .nullable()
                      .optional()
                      .describe("Date de début"),
                    longitude: z
                      .number()
                      .describe("Longitude"),
                    latitude: z
                      .number()
                      .describe("Latitude"),
                  })
              )
              .describe("Liste des mouvements de terrain à proximité")
          })
          .optional()
          .describe("Exposition au risque mouvements de terrain"),
    text: (exposition: any) => {
      let result = `${exposition.total} mouvements de terrain sont recensés dans un rayon de 5 kilomètres autour de l'adresse indiquée.`;
      if (exposition.total > 0) {
        result += ' Voici la liste des mouvements de terrain :' + bullets(exposition.mouvements
          .map((m: any) => {
            const date = toFrenchDate(m.date);
            return `${m.type || 'Mouvement de terrain'}${m.lieu ? ' au lieu ' + m.lieu : ''}${m.commentaire ? ' (' + m.commentaire + ')' : ''}${date ? ' le ' + date : ''}`;
          }));
      }
      return result;
    },
    layers: [
      {
        id: 'mouvement_terrain',
        nom: 'Mouvements de terrain',
        source: (exposition: any) => makeRasterGeorisqueSource('MVT_LOCALISE'),
        layer: {
          type: 'raster'
        },
        legend: (exposition: any) : Node => makeLegends([
          [ makeSquareSvg({ fillOpacity: 1, fillColor: '#f28694', strokeColor: '#f28694', strokeWidth: 1 })!, 'Glissement'],
          [ makeDiamondSvg({ fillOpacity: 1, fillColor: '#92fa9f', strokeColor: '#92fa9f', strokeWidth: 1 })!, 'Éboulement'],
          [ makeTriangleDownSvg({ fillOpacity: 1, fillColor: '#f5f9a0', strokeColor: '#f5f9a0', strokeWidth: 1 })!, 'Coulée'],
          [ makeStarSvg({ fillOpacity: 1, fillColor: '#8a8dff', strokeColor: '#8a8dff', strokeWidth: 1 })!, 'Effondrement'],
          [ makeTriangleUpSvg({ fillOpacity: 1, fillColor: '#f287ff', strokeColor: '#f287ff', strokeWidth: 1 })!, 'Érosion des berges']
        ])
      }
    ]
  },
  

  //========== RISQUE - Cavités ==========//

  {
    code: 'cavites',
    libelle: 'Cavités',
    fetch: async (longitude: number, latitude: number) => {
      // API Géorisques v2 si le jeton est configuré
      if (process.env.API_V2_TOKEN) {
        const params = new URLSearchParams({
          longitude: `${longitude}`,
          latitude: `${latitude}`,
          rayon: RAYON,
          pageSize: '1000',
        });
        const data: any = await callGeorisqueAPI('api/v2/cavites', params, { totalElements: 0, content: [] }, process.env.API_V2_TOKEN);
        const cavites = data.content ?? [];
        return {
          total: cavites.length,
          cavites: cavites.map((c: any) => {
            return {
              type: str(c.type),
              nom: str(c.nom),
              longitude: c.longitude,
              latitude: c.latitude
            }
          })
        };
      } else {
        const params = new URLSearchParams({
          latlon: `${longitude},${latitude}`,
          rayon: RAYON,
          page_size: '1000'
        });
        const data: any = await callGeorisqueAPI('api/v1/cavites', params, { data: [] });
        const cavites = data.data ?? [];
        return {
          total: cavites.length,
          cavites: cavites.map((c: any) => {
            return {
              type: str(c.type),
              nom: str(c.nom),
              longitude: c.longitude,
              latitude: c.latitude
            }
          })
        };
      }
    },
    outputSchema: z
          .object({
            total: z
              .number()
              .gte(0)
              .describe("Nombre de cavités à proximité"),
            cavites: z
              .array(
                z
                  .object({
                    type: z
                      .string()
                      .describe("Type de cavité"),
                    nom: z
                      .string()
                      .describe("Nom"),
                    longitude: z
                      .number()
                      .describe("Longitude"),
                    latitude: z
                      .number()
                      .describe("Latitude"),
                  })
              )
              .describe("Liste des cavités à proximité")
          })
          .optional()
          .describe("Exposition au risque cavités"),
    text: (exposition: any) => {
      let result = `${exposition.total} cavités sont recensées dans un rayon de 5 kilomètres autour de l'adresse indiquée.`;
      if (exposition.total > 0) {
        const byType = Object.groupBy(exposition.cavites, (c: any) => c.type || 'indéterminé');
        result += Object.keys(byType)
          .map(t => `\nCavités de type "${t}" :` + bullets(byType[t]!.map((c: any) => c.nom || 'Cavité sans nom')))
          .join('');
      }
      return result;
    },
    layers: [
      {
        id: 'cavites',
        nom: 'Cavités',
        source: (exposition: any) => makeRasterGeorisqueSource('CAVITE_LOCALISEE'),
        layer: {
          type: 'raster'
        },
        legend: (exposition: any) : Node => makeLegends([
          [ makeSquareSvg({ fillOpacity: 1, fillColor: '#5fe2fa', strokeColor: '#5fe2fa', strokeWidth: 1 })!, 'Cave'],
          [ makeDiamondSvg({ fillOpacity: 1, fillColor: '#87de4d', strokeColor: '#87de4d', strokeWidth: 1 })!, 'Carrière'],
          [ makeTriangleDownSvg({ fillOpacity: 1, fillColor: '#f5f515', strokeColor: '#f5f515', strokeWidth: 1 })!, 'Naturelle'],
          [ makeCircleSvg({ fillOpacity: 1, fillColor: '#ffffff', strokeColor: '#ff0000', strokeWidth: 5 })!, 'Indéterminée'],
          [ makeTriangleUpSvg({ fillOpacity: 1, fillColor: '#000000', strokeColor: '#000000', strokeWidth: 1 })!, 'Galerie'],
          [ makeStarSvg({ fillOpacity: 1, fillColor: '#0100ff', strokeColor: '#0100ff', strokeWidth: 1 })!, 'Ouvrage civil'],
          [ makeCircleSvg({ fillOpacity: 1, fillColor: '#660066', strokeColor: '#660066', strokeWidth: 1 })!, 'Ouvrage militaire'],
          [ makeStarSvg({ fillOpacity: 1, fillColor: '#5fe2fa', strokeColor: '#5fe2fa', strokeWidth: 1 })!, 'Puits'],
          [ makeCircleSvg({ fillOpacity: 1, fillColor: '#6600ff', strokeColor: '#6600ff', strokeWidth: 1 })!, 'Souterrain']
        ])
      }
    ]
  },
  

  //========== RISQUE - Territoires à Risques importants d'Inondation (TRI) ==========//

  {
    code: 'inondations',
    libelle: "Inondations",
    fetch: async (longitude: number, latitude: number) => {
      // API Géorisques v2 si le jeton est configuré
      if (process.env.API_V2_TOKEN) {
        const token = process.env.API_V2_TOKEN;
        const params = new URLSearchParams({
          longitude: `${longitude}`,
          latitude: `${latitude}`,
          rayon: RAYON,
          pageSize: '1000',
        });
        const pprParams = new URLSearchParams(params);
        pprParams.append('codesAlea', 'INOND');
        const empty = { totalElements: 0, content: [] };
        const [dataTri, dataAzi, dataPapi, dataPpr]: any[] = await Promise.all([
          callGeorisqueAPI('api/v2/gaspar/tri', params, empty, token),
          callGeorisqueAPI('api/v2/gaspar/azi', params, empty, token),
          callGeorisqueAPI('api/v2/gaspar/papi', params, empty, token),
          callGeorisqueAPI('api/v2/gaspar/pprn', pprParams, empty, token),
        ]);
        // Filtre côté serveur par sécurité, en plus du filtre `codesAlea`.
        const ppr = pprInondation(dataPpr);
        return {
          tri: {
            total: (dataTri.content ?? []).length,
            zones: (dataTri.content ?? []).map(procedureV2)
          },
          azi: {
            total: (dataAzi.content ?? []).length,
            zones: (dataAzi.content ?? []).map(procedureV2)
          },
          papi: {
            total: (dataPapi.content ?? []).length,
            programmes: (dataPapi.content ?? []).map(procedureV2)
          },
          ppr: {
            total: ppr.length,
            perimetre: 'rayon' as const,
            plans: ppr.map((p: any) => {
              return {
                libelle: str(p.libPpr),
                risque: 'Inondation',
                commune: '',
                date: toIsoDate(p.dateModification)
              }
            })
          }
        };
      } else {
        const params = new URLSearchParams({
          latlon: `${longitude},${latitude}`,
          rayon: RAYON,
          page_size: '1000'
        });
        // PPR a migré de api/v1/ppr (supprimé) vers api/v1/gaspar/pprn, qui ne
        // supporte que longitude/latitude (et non latlon), sans rayon : la recherche
        // porte sur la commune du point. Le paramètre `codesAlea` n'est pas honoré
        // par cet endpoint v1, le filtre par aléa Inondation se fait donc côté
        // serveur sur `modeleProcedure`.
        const pprParams = new URLSearchParams({
          longitude: `${longitude}`,
          latitude: `${latitude}`,
          page_size: '1000'
        });
        const [dataTri, dataAzi, dataPapi, dataPpr]: any[] = await Promise.all([
          callGeorisqueAPI('api/v1/gaspar/tri', params, { data: [] }),
          callGeorisqueAPI('api/v1/gaspar/azi', params, { data: [] }),
          callGeorisqueAPI('api/v1/gaspar/papi', params, { data: [] }),
          callGeorisqueAPI('api/v1/gaspar/pprn', pprParams, { totalElements: 0, content: [] }),
        ]);
        const ppr = pprInondation(dataPpr);
        return {
          tri: {
            total: (dataTri.data ?? []).length,
            zones: (dataTri.data ?? []).map((z: any) => procedureV1(z, z.libelle_tri, z.date_arrete_pcb))
          },
          azi: {
            total: (dataAzi.data ?? []).length,
            zones: (dataAzi.data ?? []).map((z: any) => procedureV1(z, z.libelle_azi, z.date_debut_information))
          },
          papi: {
            total: (dataPapi.data ?? []).length,
            programmes: (dataPapi.data ?? []).map((p: any) => procedureV1(p, p.libelle_papi, p.date_labellisation))
          },
          ppr: {
            total: ppr.length,
            perimetre: 'commune' as const,
            plans: ppr.map((p: any) => {
              return {
                libelle: str(p.libPpr),
                risque: 'Inondation',
                commune: '',
                date: toIsoDate(p.dateModification)
              }
            })
          }
        };
      }
    },
    outputSchema: z
          .object({
            tri: z
              .object({
                total: z
                  .number()
                  .gte(0)
                  .describe("Nombre de zones à risque à proximité"),
                zones: z
                  .array(
                    z
                      .object({
                        libelle: z
                          .string()
                          .describe("Libellé de la zone à risque"),
                        risques: z
                          .array(
                            z
                              .string()
                          )
                          .describe("Liste des risques"),
                        code_insee: z
                          .string()
                          .describe("Code INSEE de la commune concernée"),
                        commune: z
                          .string()
                          .describe("Nom de la commune concernée"),
                        date: z
                          .iso.date()
                          .nullable()
                          .optional()
                          .describe("Date d'arrêté")
                      })
                  )
                  .describe("Liste des zones à risque à proximité")
              })
              .optional()
              .describe("Territoires à Risques importants d'Inondation (TRI)"),
            azi: z
              .object({
                total: z
                  .number()
                  .gte(0)
                  .describe("Nombre de zones inondables"),
                zones: z
                  .array(
                    z
                      .object({
                        libelle: z
                          .string()
                          .describe("Libellé de la zone inondable"),
                        risques: z
                          .array(
                            z
                              .string()
                          )
                          .describe("Liste des risques"),
                        code_insee: z
                          .string()
                          .describe("Code INSEE de la commune concernée"),
                        commune: z
                          .string()
                          .describe("Nom de la commune concernée"),
                        date: z
                          .iso.date()
                          .nullable()
                          .optional()
                          .describe("Date de publication")
                      })
                  )
                  .describe("Liste des zones inondables à proximité")
              })
              .optional()
              .describe("Atlas de Zones Inondables (AZI)"),
            papi: z
              .object({
                total: z
                  .number()
                  .gte(0)
                  .describe("Nombre de programmes"),
                programmes: z
                  .array(
                    z
                      .object({
                        libelle: z
                          .string()
                          .describe("Libellé du programme"),
                        risques: z
                          .array(
                            z
                              .string()
                          )
                          .describe("Liste des risques"),
                        code_insee: z
                          .string()
                          .describe("Code INSEE de la commune concernée"),
                        commune: z
                          .string()
                          .describe("Nom de la commune concernée"),
                        date: z
                          .iso.date()
                          .nullable()
                          .optional()
                          .describe("Date de labellisation")
                      })
                  )
                  .describe("Liste des programmes à proximité")
              })
              .optional()
              .describe("Programmes d'Actions de Prévention des Inondations (PAPI)"),
            ppr: z
              .object({
                total: z
                  .number()
                  .gte(0)
                  .describe("Nombre de plans de prévention"),
                perimetre: z
                  .enum(['commune', 'rayon'])
                  .optional()
                  .describe("Périmètre de recherche : commune de l'adresse (API v1) ou rayon de 5 km (API v2)"),
                plans: z
                  .array(
                    z
                      .object({
                        libelle: z
                          .string()
                          .describe("Libellé du plans de prévention"),
                        risque: z
                          .string()
                          .describe("Risque"),
                        commune: z
                          .string()
                          .optional()
                          .describe("Nom de la commune concernée"),
                        date: z
                          .iso.date()
                          .nullable()
                          .optional()
                          .describe("Date d'approbation")
                      })
                  )
                  .describe("Liste des plans de prévention à proximité")
              })
              .optional()
              .describe("Plans de Prévention des Risques Naturels (PPRN)")
          })
          .optional()
          .describe("Exposition au risque inondation"),
    text: (exposition: any) => {
      const risques = (r: string[]) => r.length > 0 ? ` (risques : ${r.join(', ')})` : '';
      const commune = (c: string) => c ? ' sur la commune de ' + c : '';
      let result = `${exposition.tri.total} zones à risque d'inondation recensées dans un rayon de 5 kilomètres autour de l'adresse indiquée.`;
      if (exposition.tri.total > 0) {
        result += ' Voici la liste des zones et des risques concernés :' + bullets(exposition.tri.zones
          .map((z: any) => `${z.libelle}${risques(z.risques)}${commune(z.commune)}`));
      }
      result += `\n\n${exposition.azi.total} zones inondables recensées dans un rayon de 5 kilomètres autour de l'adresse indiquée.`;
      if (exposition.azi.total > 0) {
        result += ' Voici la liste des zones et des risques concernés :' + bullets(exposition.azi.zones
          .map((z: any) => `${z.libelle}${risques(z.risques)}${commune(z.commune)}`));
      }
      result += `\n\n${exposition.papi.total} programmes d'action de prévention des inondations recensés dans un rayon de 5 kilomètres autour de l'adresse indiquée.`;
      if (exposition.papi.total > 0) {
        result += ' Voici la liste des programmes et des risques concernés :' + bullets(exposition.papi.programmes
          .map((p: any) => `${p.libelle}${risques(p.risques)}${commune(p.commune)}`));
      }
      const perimetre = exposition.ppr.perimetre === 'commune'
        ? "sur la commune de l'adresse indiquée"
        : "dans un rayon de 5 kilomètres autour de l'adresse indiquée";
      result += `\n\n${exposition.ppr.total} plans de prévention des inondations recensés ${perimetre}.`;
      if (exposition.ppr.total > 0) {
        result += ' Voici la liste des plans de prévention :' + bullets(exposition.ppr.plans
          .map((p: any) => {
            const date = toFrenchDate(p.date);
            return `${p.libelle}${commune(p.commune)}${date ? ' (mis à jour le ' + date + ')' : ''}`;
          }));
      }
      return result;
    },
    layers: [
      {
        id: 'tri',
        nom: 'TRI',
        source: (exposition: any) => makeRasterGeorisqueSource('LIMITETRI_FXX'),
        layer: {
          type: 'raster'
        },
        legend: (exposition: any) : Node => makeLegends([
          [ makeLineSvg({ fillOpacity: 1, fillColor: '#e53075', strokeColor: '#e53075', strokeWidth: 15 })!, 'Périmètre de TRI']
        ])
      },
      {
        id: 'pprn',
        nom: 'PPR Inondation',
        source: (exposition: any) => makeRasterGeorisqueSource('PPRN_INOND'),
        layer: {
          type: 'raster'
        },
        legend: (exposition: any) : Node => makeLegends([
          [ makeSquareSvg({ fillOpacity: 1, fillColor: '#89d9e7', strokeColor: '#89d9e7', strokeWidth: 1 })!, 'Prescriptions hors zone d\'aléa'],
          [ makeSquareSvg({ fillOpacity: 1, fillColor: '#0000ff', strokeColor: '#0000ff', strokeWidth: 1 })!, 'Prescriptions'],
          [ makeSquareSvg({ fillOpacity: 1, fillColor: '#ff6060', strokeColor: '#ff6060', strokeWidth: 1 })!, 'Interdiction'],
          [ makeSquareSvg({ fillOpacity: 1, fillColor: '#e00000', strokeColor: '#e00000', strokeWidth: 1 })!, 'Interdiction stricte'],
          [ makeSquareSvg({ fillOpacity: 1, fillColor: '#c993ff', strokeColor: '#c993ff', strokeWidth: 1 })!, 'Délaissement possible'],
          [ makeSquareSvg({ fillOpacity: 1, fillColor: '#9a359b', strokeColor: '#9a359b', strokeWidth: 1 })!, 'Expropriation possible']
        ])
      }
    ]
  },
  

  //========== RISQUE - Catastrophes naturelles (CatNat) ==========//

  {
    code: 'catnat',
    libelle: 'Catastrophes naturelles (CatNat)',
    fetch: async (longitude: number, latitude: number) => {
      // API Géorisques v2 indisponible : on utilise toujours l'endpoint v1
      const params = new URLSearchParams({
        latlon: `${longitude},${latitude}`,
        rayon: RAYON,
        page_size: '1000'
      });
      const data: any = await callGeorisqueAPI('api/v1/gaspar/catnat', params, { data: [] });
      const catnat = (data.data ?? [])
        .map((c: any) => {
          return {
            type: str(c.libelle_risque_jo),
            code_insee: str(c.code_insee),
            commune: str(c.libelle_commune),
            date: toIsoDate(c.date_debut_evt)
          }
        })
        // Tri par date décroissante (les dates ISO se comparent lexicographiquement)
        .sort((a: any, b: any) => (b.date ?? '').localeCompare(a.date ?? ''));
      return {
        total: catnat.length,
        catnat
      };
    },
    outputSchema: z
          .object({
            total: z
              .number()
              .gte(0)
              .describe("Nombre de catastrophes naturelles à proximité"),
            catnat: z
              .array(
                z
                  .object({
                    type: z
                      .string()
                      .describe("Type de catastrophe naturelle / Risque associé"),
                    code_insee: z
                      .string()
                      .describe("Code INSEE de la commune concernée"),
                    commune: z
                      .string()
                      .describe("Nom de la commune concernée"),
                    date: z
                      .iso.date()
                      .nullable()
                      .optional()
                      .describe("Date de début de l'événement"),
                  })
              )
              .describe("Liste des catastrophes naturelles à proximité")
          })
          .optional()
          .describe("Exposition au risque catastrophes naturelles"),
    text: (exposition: any) => {
      let result = `${exposition.total} catastrophes naturelles sont recensées dans un rayon de 5 kilomètres autour de l'adresse indiquée.`;
      if (exposition.total > 0) {
        result += ' Voici la liste des catastrophes naturelles :' + bullets(exposition.catnat
          .map((c: any) => {
            const date = toFrenchDate(c.date);
            return `${c.type || 'Catastrophe naturelle'}${date ? ' le ' + date : ''}${c.commune ? ' sur la commune de ' + c.commune : ''}`;
          }));
      }
      return result;
    },
    layers: []
  },
  

  //========== RISQUE - Installations classées pour la protection de l'environnement (ICPE) ==========//
  
  {
    code: 'icpe',
    libelle: 'Installations classées pour la protection de l\'environnement (ICPE)',
    fetch: async (longitude: number, latitude: number) => {
      // API Géorisques v2 si le jeton est configuré
      if (process.env.API_V2_TOKEN) {
        const params = new URLSearchParams({
          longitude: `${longitude}`,
          latitude: `${latitude}`,
          rayon: RAYON,
          pageSize: '1000',
        });
        const data: any = await callGeorisqueAPI('api/v2/installations_classees', params, { totalElements: 0, content: [] }, process.env.API_V2_TOKEN);
        const installations = installationsSeveso(data.content ?? []);
        return {
          total: installations.length,
          installations
        };
      } else {
        const params = new URLSearchParams({
          latlon: `${longitude},${latitude}`,
          rayon: RAYON,
          page_size: '1000'
        });
        const data: any = await callGeorisqueAPI('api/v1/installations_classees', params, { data: [] });
        const installations = installationsSeveso(data.data ?? []);
        return {
          total: installations.length,
          installations
        };
      }
    },
    outputSchema: z
          .object({
            total: z
              .number()
              .gte(0)
              .describe("Nombre d'installations classées Seveso à proximité"),
            installations: z
              .array(
                z
                  .object({
                    raisonSociale: z
                      .string()
                      .describe("Raison sociale"),
                    seveso: z
                      .enum(['seveso_seuil_haut', 'seveso_seuil_bas', 'non_seveso'])
                      .describe("Statut Seveso"),
                    longitude: z
                      .number()
                      .describe("Longitude"),
                    latitude: z
                      .number()
                      .describe("Latitude"),
                  })
              )
              .describe("Liste des installation classées Seveso à proximité")
          })
          .optional()
          .describe("Exposition au risque installations classées Seveso"),
    text: (exposition: any) => {
      let result = `${exposition.total} installations classées pour la protection de l'environnement (ICPE) avec le statut Seveso sont recensées dans un rayon de 5 kilomètres autour de l'adresse indiquée.`;
      if (exposition.total > 0) {
        result += ' Voici la liste des installations :' + bullets(exposition.installations
          .map((i: any) => `${i.raisonSociale || 'Installation sans raison sociale'} (${i.seveso.replaceAll('_', ' ')})`));
      }
      return result;
    },
    layers: [
      {
        id: 'icpe',
        nom: 'ICPE',
        source: (exposition: any) => {
          return {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: exposition.installations.map((i: any) => {
                let description = sanitize(i.raisonSociale);
                let color = '#000000';
                switch (i.seveso) {
                  case 'seveso_seuil_haut':
                    description += ' (Seveso seuil haut)';
                    color = '#fc0d1a';
                    break;
                  case 'seveso_seuil_bas':
                    description += ' (Seveso seuil bas)';
                    color = '#2e404f';
                    break;
                  default:
                    description += ' (Non Seveso)';
                    break;
                }
                return {
                  type: 'Feature',
                  properties: {
                    raisonSociale: sanitize(i.raisonSociale),
                    seveso: i.seveso,
                    description,
                    color
                  },
                  geometry: {
                    type: 'Point',
                    coordinates: [i.longitude, i.latitude]
                  }
                };
              })
            },
            maxzoom: 16,
            attribution: 'Ministère de la Transition Écologique'
          };
        },
        layer: {
          'type': 'circle',
          'paint': {
            'circle-color': ['get', 'color'],
            'circle-stroke-width': 1,
            'circle-stroke-color': '#ffffff'
          }
        },
        legend: (exposition: any) : Node => makeLegends([
          [ makeCircleSvg({ fillOpacity: 1, fillColor: '#fc0d1a', strokeColor: '#ffffff', strokeWidth: 5 })!, 'Seveso seuil haut'],
          [ makeCircleSvg({ fillOpacity: 1, fillColor: '#2e404f', strokeColor: '#ffffff', strokeWidth: 5 })!, 'Seveso seuil bas'],
          [ makeCircleSvg({ fillOpacity: 1, fillColor: '#000000', strokeColor: '#ffffff', strokeWidth: 5 })!, 'Non Seveso']
        ])
      }
    ]
  },
  

  //========== RISQUE - Installations nucléaires ==========//
  
  {
    code: 'installations_nucleaires',
    libelle: 'Installations nucléaires',
    fetch: async (longitude: number, latitude: number) => {
      const installation = (i: any, rayonPpi: unknown) => {
        return {
          nom: str(i.nomInstallationNucleaire),
          type: str(i.typeInstallationNucleaire),
          rayon_ppi: i.ppi && typeof rayonPpi === 'number' ? rayonPpi : null,
          longitude: i.longitude,
          latitude: i.latitude
        };
      };
      // API Géorisques v2 si le jeton est configuré
      if (process.env.API_V2_TOKEN) {
        const params = new URLSearchParams({
          longitude: `${longitude}`,
          latitude: `${latitude}`,
          rayon: RAYON,
          pageSize: '1000',
        });
        const data: any = await callGeorisqueAPI('api/v2/installations_nucleaires', params, { totalElements: 0, content: [] }, process.env.API_V2_TOKEN);
        const installations = (data.content ?? []).map((i: any) => installation(i, i.rayonPpi));
        return {
          total: installations.length,
          installations
        };
      } else {
        const params = new URLSearchParams({
          longitude: `${longitude}`,
          latitude: `${latitude}`
        });
        const data: any = await callGeorisqueAPI('api/v1/installations_nucleaires', params, []);
        const installations = (Array.isArray(data) ? data : []).map((i: any) => installation(i, i.rayon_ppi));
        return {
          total: installations.length,
          installations
        };
      }
    },
    outputSchema: z
          .object({
            total: z
              .number()
              .gte(0)
              .describe("Nombre d'installations nucléaires à proximité"),
            installations: z
              .array(
                z
                  .object({
                    nom: z
                      .string()
                      .describe("Nom de l'installation"),
                    type: z
                      .string()
                      .describe("Type d'installation"),
                    rayon_ppi: z
                      .number()
                      .nullable()
                      .optional()
                      .describe("Rayon du Plan Particulier d'Intervention (PPI)"),
                    longitude: z
                      .number()
                      .describe("Longitude"),
                    latitude: z
                      .number()
                      .describe("Latitude"),
                  })
              )
              .describe("Liste des installation nucléaires à proximité")
          })
          .optional()
          .describe("Exposition au risque installations nucléaires"),
    text: (exposition: any) => {
      let result = `${exposition.total} installations nucléaires sont recensées autour de l'adresse indiquée.`;
      if (exposition.total > 0) {
        result += ' Voici la liste des installations :' + bullets(exposition.installations
          .map((i: any) => `${i.nom}${i.type ? ' (' + i.type + ')' : ''}${i.rayon_ppi ? ` (rayon du Plan Particulier d'Intervention (PPI) : ${i.rayon_ppi} m)` : ''}`));
      }
      return result;
    },
    layers: [
      {
        id: 'installations_nucleaires',
        nom: 'Installations nucléaires',
        source: (exposition: any) => {
          return {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: exposition.installations.flatMap((i: any) => {
                let color = '#2e404f';
                switch (i.type) {
                  case 'Centrales nucléaires':
                    color = '#c62222';
                    break;
                  default:
                    break;
                }
                const properties = {
                  nom: sanitize(i.nom),
                  type: sanitize(i.type),
                  rayon_ppi: i.rayon_ppi,
                  color
                };
                let features = [
                  {
                    type: 'Feature',
                    properties: {
                      nom: sanitize(i.nom),
                      type: sanitize(i.type),
                      color
                    },
                    geometry: {
                      type: 'Point',
                      coordinates: [i.longitude, i.latitude]
                    }
                  }
                ];
                if (i.rayon_ppi) {
                  features = [
                    ...features,
                    circle(
                      [i.longitude, i.latitude],
                      i.rayon_ppi,
                      { steps: 64, units: 'meters', properties }
                    )
                  ];
                }
                return features
              })
            },
            maxzoom: 16,
            attribution: 'Ministère de la Transition Écologique'
          };
        },
        layer: [
          // Marker
          {
            'type': 'circle',
            'paint': {
              'circle-color': ['get', 'color'],
              'circle-stroke-width': 1,
              'circle-stroke-color': '#ffffff'
            },
            'filter': ["==", ["geometry-type"], "Point"]
          },
          // Radius fill
          {
            'type': 'fill',
            'paint': {
              'fill-color': ['get', 'color'],
              'fill-opacity': 0.05,
            },
            'filter': ["==", ["geometry-type"], "Polygon"]
          },
          // Radius outline
          {
            'type': 'line',
            'paint': {
              'line-width': 2,
              'line-color': '#c62222'
            },
            'filter': ["==", ["geometry-type"], "Polygon"]
          }
        ],
        legend: (exposition: any) : Node => makeLegends([
          [ makeCircleSvg({ fillOpacity: 1, fillColor: '#c62222', strokeColor: '#ffffff', strokeWidth: 5 })!, 'Centrale'],
          [ makeCircleSvg({ fillOpacity: 1, fillColor: '#2e404f', strokeColor: '#ffffff', strokeWidth: 5 })!, 'Autre installation'],
          [ makeCircleSvg({ fillOpacity: 0.05, fillColor: '#c62222', strokeColor: '#c62222', strokeWidth: 5 })!, 'Rayon du PPI']
        ])
      }
    ]
  },

];
