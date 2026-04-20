import { z } from "zod";
import { format, parse } from 'date-and-time';
import { circle } from "@turf/turf";
import {
  callGeorisqueAPI,
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
        if (data.totalElements > 0) {
          return {
            libelle: data.content[0].exposition,
            score: parseInt(data.content[0].codeExposition)
          };
        } else {
          return {
            libelle: 'Non exposé',
            score: 0
          };
        }
      } else {
        const params = new URLSearchParams({
          latlon: `${longitude},${latitude}`,
        });
        const data: any = await callGeorisqueAPI('api/v1/rga', params, { exposition: 'Non exposé', codeExposition: "0" });
        return {
          libelle: data.exposition,
          score: parseInt(data.codeExposition)
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
      return `Le niveau d'exposition au risque de retrait-gonflement des argiles à l'adresse indiquée est : ${exposition.libelle} (score de ${exposition.score} sur 3})`;
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
          rayon: '5000',
          pageSize: '1000',
        });
        const data: any = await callGeorisqueAPI('api/v2/mvt', params, { totalElements: 0, content: [] }, process.env.API_V2_TOKEN);
        return {
          total: data.totalElements,
          mouvements: data.content.map((m: any) => {
            return {
              type: m.type,
              lieu: m.lieu,
              commentaire: m.commentaireLieu,
              date: m.dateDebut,
              longitude: m.longitude,
              latitude: m.latitude
            }
          })
        };
      } else {
        const params = new URLSearchParams({
          latlon: `${longitude},${latitude}`,
          rayon: '5000',
          page_size: '1000'
        });
        const data: any = await callGeorisqueAPI('api/v1/mvt', params, { data: [] });
        return {
          total: data.data.length,
          mouvements: data.data.map((m: any) => {
            return {
              type: m.type,
              lieu: m.lieu,
              commentaire: m.commentaire_lieu,
              date: m.date_debut,
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
        result += ' Voici la liste des mouvements de terrain : ' + exposition.mouvements
          .map((m: any) => `\n  - ${m.type} au lieu ${m.lieu}${m.commentaire ? ' (' + m.commentaire + ')' : ''}${m.date ? ' le ' + format(parse(m.date, 'YYYY-MM-DD'), 'DD/MM/YYYY') : ''}`);
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
          rayon: '5000',
          pageSize: '1000',
        });
        const data: any = await callGeorisqueAPI('api/v2/cavites', params, { totalElements: 0, content: [] }, process.env.API_V2_TOKEN);
        return {
          total: data.totalElements,
          cavites: data.content.map((c: any) => {
            return {
              type: c.type,
              nom: c.nom,
              longitude: c.longitude,
              latitude: c.latitude
            }
          })
        };
      } else {
        const params = new URLSearchParams({
          latlon: `${longitude},${latitude}`,
          rayon: '5000',
          page_size: '1000'
        });
        const data: any = await callGeorisqueAPI('api/v1/cavites', params, { data: [] });
        return {
          total: data.data.length,
          cavites: data.data.map((c: any) => {
            return {
              type: c.type,
              nom: c.nom,
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
        const byType = Object.groupBy(exposition.cavites, (c: any) => c.type);
        result += Object.keys(byType).map(t => `\nCavités de type "${t}" : ` + byType[t]!
          .map((c: any) => `\n  - ${c.nom}`)
        );
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
        const params = new URLSearchParams({
          longitude: `${longitude}`,
          latitude: `${latitude}`,
          rayon: '5000',
          pageSize: '1000',
        });
        const dataTri: any = await callGeorisqueAPI('api/v2/gaspar/tri', params, { totalElements: 0, content: [] }, process.env.API_V2_TOKEN);
        const dataAzi: any = await callGeorisqueAPI('api/v2/gaspar/azi', params, { totalElements: 0, content: [] }, process.env.API_V2_TOKEN);
        const dataPapi: any = await callGeorisqueAPI('api/v2/gaspar/papi', params, { totalElements: 0, content: [] }, process.env.API_V2_TOKEN);
        params.append('codesAlea', 'INOND');
        const dataPpr: any = await callGeorisqueAPI('api/v2/gaspar/pprn', params, { totalElements: 0, content: [] }, process.env.API_V2_TOKEN);
        return {
          tri: {
            total: dataTri.totalElements,
            zones: dataTri.content.map((z: any) => {
              return {
                libelle: z.libelle,
                risques: [...new Set(z.communes.flatMap((c:  any) => c.aleas).map((a: any) => a.libelle))],
                code_insee: z.communes[0].codeInsee,
                commune: z.communes[0].nom,
                date: z.dateModification && format(parse(z.dateModification, 'DD/MM/YYYY'), 'YYYY-MM-DD')
              }
            })
          },
          azi: {
            total: dataAzi.totalElements,
            zones: dataAzi.content.map((z: any) => {
              return {
                libelle: z.libelle,
                risques: [...new Set(z.communes.flatMap((c:  any) => c.aleas).map((a: any) => a.libelle))],
                code_insee: z.communes[0].codeInsee,
                commune: z.communes[0].nom,
                date: z.dateModification && format(parse(z.dateModification, 'DD/MM/YYYY'), 'YYYY-MM-DD')
              }
            })
          },
          papi: {
            total: dataPapi.totalElements,
            programmes: dataPapi.content.map((p: any) => {
              return {
                libelle: p.libelle,
                risques: [...new Set(p.communes.flatMap((c:  any) => c.aleas).map((a: any) => a.libelle))],
                code_insee: p.communes[0].codeInsee,
                commune: p.communes[0].nom,
                date: p.dateModification && format(parse(p.dateModification, 'DD/MM/YYYY'), 'YYYY-MM-DD')
              }
            })
          },
          ppr: {
            total: dataPpr.totalElements,
            plans: dataPpr.content.map((p: any) => {
              return {
                libelle: p.libPpr,
                risque: 'Inondation',
                commune: '',
                date: p.dateModification && format(parse(p.dateModification, 'DD/MM/YYYY'), 'YYYY-MM-DD')
              }
            })
          }
        };
      } else {
        const params = new URLSearchParams({
          latlon: `${longitude},${latitude}`,
          rayon: '5000',
          page_size: '1000'
        });
        const dataTri: any = await callGeorisqueAPI('api/v1/gaspar/tri', params, { data: [] });
        const dataAzi: any = await callGeorisqueAPI('api/v1/gaspar/azi', params, { data: [] });
        const dataPapi: any = await callGeorisqueAPI('api/v1/gaspar/papi', params, { data: [] });
        const dataPpr: any = await callGeorisqueAPI('api/v1/ppr', params, { data: [] });
        const filteredPpr = dataPpr.data
          .filter((p: any) => p.risque.code_risque === '11'); // Inondation
        return {
          tri: {
            total: dataTri.data.length,
            zones: dataTri.data.map((z: any) => {
              return {
                libelle: z.libelle_tri,
                risques: z.liste_libelle_risque.map((r:  any) => r.libelle_risque_long),
                code_insee: z.code_insee,
                commune: z.libelle_commune,
                date: z.date_arrete_pcb && format(parse(z.date_arrete_pcb, 'DD/MM/YYYY'), 'YYYY-MM-DD')
              }
            })
          },
          azi: {
            total: dataAzi.data.length,
            zones: dataAzi.data.map((z: any) => {
              return {
                libelle: z.libelle_azi,
                risques: z.liste_libelle_risque.map((r:  any) => r.libelle_risque_long),
                code_insee: z.code_insee,
                commune: z.libelle_commune,
                date: z.date_debut_information && format(parse(z.date_debut_information, 'DD/MM/YYYY'), 'YYYY-MM-DD')
              }
            })
          },
          papi: {
            total: dataPapi.data.length,
            programmes: dataPapi.data.map((p: any) => {
              return {
                libelle: p.libelle_papi,
                risques: p.liste_libelle_risque.map((r:  any) => r.libelle_risque_long),
                code_insee: p.code_insee,
                commune: p.libelle_commune,
                date: p.date_labellisation && format(parse(p.date_labellisation, 'DD/MM/YYYY'), 'YYYY-MM-DD')
              }
            })
          },
          ppr: {
            total: filteredPpr.length,
            plans: filteredPpr.map((p: any) => {
              return {
                libelle: p.nom_ppr,
                risque: p.risque.libelle_risque,
                commune: p.libelle_commune,
                date: p.date_approbation && format(parse(p.date_approbation, 'DD/MM/YYYY'), 'YYYY-MM-DD')
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
      let result = `${exposition.tri.total} zones à risque d'inondation recensées dans un rayon de 5 kilomètres autour de l'adresse indiquée.`;
      if (exposition.tri.total > 0) {
        result += ' Voici la liste des zones et des risques concernés : ' + exposition.tri.zones
          .map((z: any) => `\n  - ${z.libelle} exposée aux risques ${z.risques.join(', ')}${z.commune ? ' sur la commune de ' + z.commune : ''}`);
      }
      result += `\n\n${exposition.azi.total} zones inondables recensées dans un rayon de 5 kilomètres autour de l'adresse indiquée.`;
      if (exposition.azi.total > 0) {
        result += ' Voici la liste des zones et des risques concernés : ' + exposition.azi.zones
          .map((z: any) => `\n  - ${z.libelle} exposée aux risques ${z.risques.join(', ')}${z.commune ? ' sur la commune de ' + z.commune : ''}`);
      }
      result += `\n\n${exposition.papi.total} programmes d'action de prévention des inondations recensés dans un rayon de 5 kilomètres autour de l'adresse indiquée.`;
      if (exposition.papi.total > 0) {
        result += ' Voici la liste des programmes et des risques concernés : ' + exposition.papi.programmes
          .map((p: any) => `\n  - ${p.libelle} concernant les risques ${p.risques.join(', ')}${p.commune ? ' sur la commune de ' + p.commune : ''}`);
      }
      result += `\n\n${exposition.ppr.total} plans de prévention des inondations recensés dans un rayon de 5 kilomètres autour de l'adresse indiquée.`;
      if (exposition.ppr.total > 0) {
        result += ' Voici la liste des plans de prévention et des risques concernés : ' + exposition.ppr.plans
          .map((p: any) => `\n  - ${p.libelle} concernant le risque ${p.risque}${p.commune ? ' sur la commune de ' + p.commune : ''}`);
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
        rayon: '5000',
        page_size: '1000'
      });
      const data: any = await callGeorisqueAPI('api/v1/gaspar/catnat', params, { data: [] });
      return {
        total: data.data.length,
        catnat: data.data
          .sort((a: any, b: any) => parse(b.date_debut_evt, 'DD/MM/YYYY').getTime() - parse(a.date_debut_evt, 'DD/MM/YYYY').getTime())
          .map((c: any) => {
            return {
              type: c.libelle_risque_jo,
              code_insee: c.code_insee,
              commune: c.libelle_commune,
              date: c.date_debut_evt && format(parse(c.date_debut_evt, 'DD/MM/YYYY'), 'YYYY-MM-DD')
            }
          })
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
        result += ' Voici la liste des catastrophes naturelles : ' + exposition.catnat
          .map((c: any) => `\n  - ${c.type}${c.date ? ' le ' + format(parse(c.date, 'YYYY-MM-DD'), 'DD/MM/YYYY') : ''}${c.commune ? ' sur la commune de ' + c.commune : ''}`);
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
          rayon: '5000',
          pageSize: '1000',
        });
        const data: any = await callGeorisqueAPI('api/v2/installations_classees', params, { totalElements: 0, content: [] }, process.env.API_V2_TOKEN);
        const seveso = data.content
          .filter((i: any) => i.statutSeveso && i.statutSeveso !== 'Non Seveso');
        return {
          total: seveso.length,
          installations: seveso.map((i: any) => {
            let seveso = 'non_seveso';
            switch (i.statutSeveso) {
              case 'Seveso seuil haut':
                seveso = 'seveso_seuil_haut';
                break;
              case 'Seveso seuil bas':
                seveso = 'seveso_seuil_bas';
                break;
            }
            return {
              raisonSociale: i.raisonSociale,
              seveso,
              longitude: i.longitude,
              latitude: i.latitude
            }
          })
        };
      } else {
        const params = new URLSearchParams({
          latlon: `${longitude},${latitude}`,
          rayon: '5000',
          page_size: '1000'
        });
        const data: any = await callGeorisqueAPI('api/v1/installations_classees', params, { data: [] });
        const seveso = data.data
          .filter((i: any) => i.statutSeveso && i.statutSeveso !== 'Non Seveso');
        return {
          total: seveso.length,
          installations: seveso.map((i: any) => {
            let seveso = 'non_seveso';
            switch (i.statutSeveso) {
              case 'Seveso seuil haut':
                seveso = 'seveso_seuil_haut';
                break;
              case 'Seveso seuil bas':
                seveso = 'seveso_seuil_bas';
                break;
            }
            return {
              raisonSociale: i.raisonSociale,
              seveso,
              longitude: i.longitude,
              latitude: i.latitude
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
        result += ' Voici la liste des installations : ' + exposition.installations
          .map((i: any) => `\n  - ${i.raisonSociale} (${i.seveso.replaceAll('_', ' ')})`);
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
      // API Géorisques v2 si le jeton est configuré
      if (process.env.API_V2_TOKEN) {
        const params = new URLSearchParams({
          longitude: `${longitude}`,
          latitude: `${latitude}`,
          rayon: '5000',
          pageSize: '1000',
        });
        const data: any = await callGeorisqueAPI('api/v2/installations_nucleaires', params, { totalElements: 0, content: [] }, process.env.API_V2_TOKEN);
        return {
          total: data.totalElements,
          installations: data.content.map((i: any) => {
            return {
              nom: i.nomInstallationNucleaire,
              type: i.typeInstallationNucleaire,
              rayon_ppi: i.ppi && i.rayonPpi,
              longitude: i.longitude,
              latitude: i.latitude
            }
          })
        };
      } else {
        const params = new URLSearchParams({
          longitude: `${longitude}`,
          latitude: `${latitude}`
        });
        const data: any = await callGeorisqueAPI('api/v1/installations_nucleaires', params, []);
        return {
          total: data.length,
          installations: data.map((i: any) => {
            return {
              nom: i.nomInstallationNucleaire,
              type: i.typeInstallationNucleaire,
              rayon_ppi: i.ppi && i.rayon_ppi,
              longitude: i.longitude,
              latitude: i.latitude
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
        result += ' Voici la liste des installations : ' + exposition.installations
          .map((i: any) => `\n  - ${i.nom} (${i.type})${i.rayon_ppi ? ` (Rayon du Plan Particulier d'Intervention (PPI) : ${i.rayon_ppi} m)` : ''}`);
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
