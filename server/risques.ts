import { z } from "zod";
import { format, parse } from 'date-and-time';
import {
  makeRasterGeorisqueSource,
  makeCircleSvg,
  makeSquareSvg,
  makeLineSvg,
  makeDiamondSvg,
  makeTriangleUpSvg,
  makeTriangleDownSvg,
  makeStarSvg,
  makeLegends
} from './utils.js';


export const RISQUES = [
  

  //========== RISQUE - Retrait-gonflement des argiles ==========//

  {
    code: 'argiles',
    libelle: 'Retrait-gonflement des argiles',
    nom: 'Argiles',
    fetch: async (longitude: number, latitude: number) => {
      const params = new URLSearchParams({
        latlon: `${longitude},${latitude}`,
      });
      const url = `https://georisques.gouv.fr/api/v1/rga?${params}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Erreur lors de l'appel à l'API Géorisques 'rga' : ${response.status} ${response.statusText}`);
      }
      let data = {
        exposition: 'Non exposé',
        codeExposition: "0"
      };
      const contentType = response.headers.get("Content-Type");
      if (contentType && contentType.includes("application/json")) {
        data = await response.json();
      }
      return {
        libelle: data.exposition,
        score: parseInt(data.codeExposition)
      };
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
    source: (exposition: any) => makeRasterGeorisqueSource('ALEARG'),
    layer: {
      type: 'raster'
    },
    legend: (exposition: any) : Node => makeLegends([
      [ makeSquareSvg({ fillOpacity: 1, fillColor: '#ef7070', strokeColor: '#ef7070', strokeWidth: 1 })!, 'Exposition forte'],
      [ makeSquareSvg({ fillOpacity: 1, fillColor: '#efc270', strokeColor: '#efc270', strokeWidth: 1 })!, 'Exposition moyenne'],
      [ makeSquareSvg({ fillOpacity: 1, fillColor: '#f0f0bd', strokeColor: '#f0f0bd', strokeWidth: 1 })!, 'Exposition faible']
    ])
  },
  

  //========== RISQUE - Installations classées pour la protection de l'environnement (ICPE) ==========//
  
  {
    code: 'icpe',
    libelle: 'Installations classées pour la protection de l\'environnement (ICPE)',
    nom: 'ICPE',
    fetch: async (longitude: number, latitude: number) => {
      const params = new URLSearchParams({
        latlon: `${longitude},${latitude}`,
        rayon: '5000',
        page_size: '100'
      });
      const url = `https://georisques.gouv.fr/api/v1/installations_classees?${params}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Erreur lors de l'appel à l'API Géorisques 'installations_classees' : ${response.status} ${response.statusText}`);
      }
      let data: any = {
        data: []
      };
      const contentType = response.headers.get("Content-Type");
      if (contentType && contentType.includes("application/json")) {
        data = await response.json();
      }
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
        result += 'Voici la liste des installations : ' + exposition.installations
          .map((i: any) => `\n  - ${i.raisonSociale} (${i.seveso.replaceAll('_', ' ')})`);
      }
      return result;
    },
    source: (exposition: any) => {
      return {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: exposition.installations.map((i: any) => {
            let description = i.raisonSociale;
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
                raisonSociale: i.raisonSociale,
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
        'circle-color': ['get', 'color']
      }
    },
    legend: (exposition: any) : Node => makeLegends([
      [ makeCircleSvg({ fillOpacity: 1, fillColor: '#fc0d1a', strokeColor: '#fc0d1a', strokeWidth: 1 })!, 'Seveso seuil haut'],
      [ makeCircleSvg({ fillOpacity: 1, fillColor: '#2e404f', strokeColor: '#2e404f', strokeWidth: 1 })!, 'Seveso seuil bas'],
      [ makeCircleSvg({ fillOpacity: 1, fillColor: '#000000', strokeColor: '#000000', strokeWidth: 1 })!, 'Non Seveso']
    ])
  },
  

  //========== RISQUE - Mouvements de terrain ==========//

  {
    code: 'mouvement_terrain',
    libelle: 'Mouvements de terrain',
    nom: 'Mouvements de terrain',
    fetch: async (longitude: number, latitude: number) => {
      const params = new URLSearchParams({
        latlon: `${longitude},${latitude}`,
        rayon: '5000',
        page_size: '100'
      });
      const url = `https://georisques.gouv.fr/api/v1/mvt?${params}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Erreur lors de l'appel à l'API Géorisques 'mvt' : ${response.status} ${response.statusText}`);
      }
      let data: any = {
        data: []
      };
      const contentType = response.headers.get("Content-Type");
      if (contentType && contentType.includes("application/json")) {
        data = await response.json();
      }
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
        result += 'Voici la liste des mouvements de terrain : ' + exposition.mouvements
          .map((m: any) => `\n  - ${m.type} au lieu ${m.lieu}${m.commentaire ? ' (' + m.commentaire + ')' : ''}${m.date ? ' le ' + format(parse(m.date, 'YYYY-MM-DD'), 'DD/MM/YYYY') : ''}`);
      }
      return result;
    },
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
  },
  

  //========== RISQUE - Territoires à Risques importants d'Inondation (TRI) ==========//

  {
    code: 'tri',
    libelle: "Territoires à Risques importants d'Inondation (TRI)",
    nom: 'Inondations',
    fetch: async (longitude: number, latitude: number) => {
      const params = new URLSearchParams({
        latlon: `${longitude},${latitude}`,
        rayon: '5000',
        page_size: '100'
      });
      const url = `https://georisques.gouv.fr/api/v1/gaspar/tri?${params}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Erreur lors de l'appel à l'API Géorisques 'tri' : ${response.status} ${response.statusText}`);
      }
      let data: any = {
        data: []
      };
      const contentType = response.headers.get("Content-Type");
      if (contentType && contentType.includes("application/json")) {
        data = await response.json();
      }
      return {
        total: data.data.length,
        zones: data.data.map((z: any) => {
          return {
            libelle: z.libelle_tri,
            risques: z.liste_libelle_risque.map((r:  any) => r.libelle_risque_long),
            code_insee: z.code_insee,
            commune: z.libelle_commune,
            date: z.date_arrete_pcb && format(parse(z.date_arrete_pcb, 'DD/MM/YYYY'), 'YYYY-MM-DD')
          }
        })
      };
    },
    outputSchema: z
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
          .describe("Exposition au risque inondation"),
    text: (exposition: any) => {
      let result = `${exposition.total} zones à risque d'inondation recensées dans un rayon de 5 kilomètres autour de l'adresse indiquée.`;
      if (exposition.total > 0) {
        result += 'Voici la liste des zones et des risques concernés : ' + exposition.zones
          .map((z: any) => `\n  - ${z.libelle} exposée aux risques ${z.risques.join(', ')}${z.commune ? ' sur la commune de ' + z.commune : ''}`);
      }
      return result;
    },
    source: (exposition: any) => makeRasterGeorisqueSource('LIMITETRI_FXX'),
    layer: {
      type: 'raster'
    },
    legend: (exposition: any) : Node => makeLegends([
      [ makeLineSvg({ fillOpacity: 1, fillColor: '#e53075', strokeColor: '#e53075', strokeWidth: 15 })!, 'Périmètre de TRI']
    ])
  },

];
