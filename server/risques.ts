import { z } from "zod";

export const RISQUES = [
  

  //========== RISQUE - Retrait-gonflement des argiles ==========//

  {
    code: 'argiles',
    libelle: 'Retrait-gonflement des argiles',
    fetch: async (longitude: number, latitude: number) => {
      const params = new URLSearchParams({
        latlon: `${longitude},${latitude}`,
      });
      const url = `https://georisques.gouv.fr/api/v1/rga?${params}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Erreur lors de l'appel à l'API Géorisques : ${response.status} ${response.statusText}`);
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
    source: (exposition) => {
      return {
        type: 'raster',
        tiles: ['https://mapsref.brgm.fr/wxs/georisques/risques?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&FORMAT=image/png&TRANSPARENT=true&LAYERS=ALEARG&STYLES=&SRS=EPSG:3857&CRS=EPSG:3857&TILED=false&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}'],
        tileSize: 256,
        maxzoom: 16,
        attribution: 'Ministère de la Transition Écologique'
      };
    },
    layer: {
      type: 'raster'
    }
  },
  

  //========== RISQUE - Installations classées pour la protection de l'environnement (ICPE) ==========//
  
  {
    code: 'icpe',
    libelle: 'Installations classées pour la protection de l\'environnement (ICPE)',
    fetch: async (longitude: number, latitude: number) => {
      const params = new URLSearchParams({
        latlon: `${longitude},${latitude}`,
        rayon: '5000',
        page_size: '100'
      });
      const url = `https://georisques.gouv.fr/api/v1/installations_classees?${params}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Erreur lors de l'appel à l'API Géorisques : ${response.status} ${response.statusText}`);
      }
      let data = {
        data: []
      };
      const contentType = response.headers.get("Content-Type");
      if (contentType && contentType.includes("application/json")) {
        data = await response.json();
      }
      return {
        total: data.data.length,
        installations: data.data.map(i => {
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
              .describe("Nombre d'installations classées à proximité"),
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
              .describe("Liste des installation classées à proximité")
          })
          .optional()
          .describe("Exposition aux risque installations classées"),
    source: (exposition) => {
      return {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: exposition.installations.map(i => {
            let description = i.raisonSociale;
            let color = '#333333';
            switch (i.seveso) {
              case 'seveso_seuil_haut':
                description += ' (Seveso seuil haut)';
                color = '#ff0000';
                break;
              case 'seveso_seuil_bas':
                description += ' (Seveso seuil bas)';
                color = '#ff9900';
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
    }
  },
];
