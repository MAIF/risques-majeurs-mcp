import { McpServer } from "@modelcontextprotocol/server";
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { RISQUES } from "./risques.js";
import { API_TIMEOUT_MS, GEORISQUES_BASE_URL } from "./utils.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json");
const DIST_DIR = path.join(import.meta.dirname, "../dist");

const INSTRUCTIONS = `Serveur d'exposition aux risques majeurs en France (données ouvertes Géorisques et IGN).
Pour une adresse, appeler d'abord l'outil 'geocodage' pour obtenir ses coordonnées, puis 'exposition_risques' (résumé textuel) ou 'carte_exposition_risques' (données structurées et carte interactive).
L'outil 'liste_risques' indique les codes de risques disponibles pour le paramètre 'risques'.`;

const coordonnees = {
  longitude: z
    .number()
    .gte(-180)
    .lte(180)
    .describe("Longitude dans le système géodésique EPSG:4326 / WGS 84"),
  latitude: z
    .number()
    .gte(-90)
    .lte(90)
    .describe("Latitude dans le système géodésique EPSG:4326 / WGS 84"),
};

const annotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true
};

const erreursSchema = z
  .array(
    z.object({
      code: z.string().describe("Code du risque"),
      message: z.string().describe("Message d'erreur"),
    })
  )
  .optional()
  .describe("Risques qui n'ont pas pu être évalués (les autres risques restent disponibles)");

type Risque = (typeof RISQUES)[number];

/**
 * Évalue les risques demandés en parallèle. Un risque en échec (API indisponible,
 * endpoint retiré…) n'empêche pas les autres d'être évalués : il est remonté dans
 * `erreurs`.
 */
const evaluer = async (risques: Risque[], longitude: number, latitude: number) => {
  const results = await Promise.allSettled(risques.map(r => r.fetch(longitude, latitude)));
  const expositions: Array<[Risque, any]> = [];
  const erreurs: Array<{ code: string, message: string }> = [];
  results.forEach((result, idx) => {
    const risque = risques[idx];
    if (result.status === 'fulfilled') {
      expositions.push([risque, result.value]);
    } else {
      const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
      console.error(`Risque '${risque.code}' : ${message}`);
      erreurs.push({ code: risque.code, message });
    }
  });
  return { expositions, erreurs };
};


export function createServer() {
  const server = new McpServer(
    {
      name: "risques-majeurs-mcp",
      title: "Risques Majeurs",
      version,
    },
    {
      instructions: INSTRUCTIONS,
    }
  );


  //========== TOOL - geocodage ==========//

  server.registerTool(
    "geocodage",
    {
      title: "Géocodage",
      description: "Géocode une adresse en France : transforme une adresse textuelle en coordonnées GPS (longitude, latitude) et code INSEE de la commune. Utilise l'API de géocodage de l'IGN (Geoplateforme).",
      inputSchema: z.object({
        adresse: z
          .string()
          .min(1)
          .max(200)
          .describe("L'adresse à géocoder, par exemple '20 avenue de Ségur, Paris'"),
        limite: z
          .number()
          .int()
          .gte(1)
          .lte(50)
          .optional()
          .default(5)
          .describe("Nombre maximum de résultats (1 à 50, défaut: 5)"),
      }),
      outputSchema: z
        .object({
          resultats: z
            .array(
              z
                .object({
                  libelle: z
                    .string()
                    .describe("Libellé complet de l'adresse"),
                  score: z
                    .number()
                    .gte(0)
                    .lte(1)
                    .describe("Score de pertinence du résultat"),
                  type: z
                    .string()
                    .describe("Type de résultat (housenumber, street, locality, municipality)"),
                  coordonnees: z
                    .object({
                      longitude: z
                        .number()
                        .describe("Longitude"),
                      latitude: z
                        .number()
                        .describe("Latitude"),
                    })
                    .describe("Coordonnées dans le système géodésique EPSG:4326 / WGS 84"),
                  codeInsee: z
                    .string()
                    .describe("Code INSEE de la commune"),
                  commune: z
                    .string()
                    .describe("Nom de la commune"),
                  codePostal: z
                    .string()
                    .describe("Code postal"),
                  contexte: z
                    .string()
                    .describe("Contexte complémentaire à l'adresse"),
                })
            )
            .optional()
            .describe("Liste de résultats"),
          erreur: z
            .string()
            .optional()
            .describe("Message d'erreur")
        }),
      annotations
    },
    async ({ adresse, limite }) => {
      console.log(`Outil 'geocodage' : ${adresse} / ${limite}`);
      const params = new URLSearchParams({
        q: adresse,
        limit: String(limite),
      });

      const url = `https://data.geopf.fr/geocodage/search?${params}`;
      let data: any;
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(API_TIMEOUT_MS) });
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`);
        }
        data = await response.json();
      } catch (e: any) {
        const erreur = `Erreur lors du géocodage : ${e?.name === 'TimeoutError' ? `délai de ${API_TIMEOUT_MS / 1000} s dépassé` : e?.message ?? e}`;
        console.error(erreur);
        return {
          isError: true,
          content: [{ type: "text" as const, text: JSON.stringify({ erreur }, null, 2) }],
          structuredContent: { erreur }
        };
      }

      const resultats = (data.features ?? []).map((feature: any) => ({
        libelle: String(feature.properties?.label ?? ''),
        score: Number(feature.properties?.score ?? 0),
        type: String(feature.properties?.type ?? ''),
        coordonnees: {
          longitude: feature.geometry.coordinates[0],
          latitude: feature.geometry.coordinates[1],
        },
        codeInsee: String(feature.properties?.citycode ?? ''),
        commune: String(feature.properties?.city ?? ''),
        codePostal: String(feature.properties?.postcode ?? ''),
        contexte: String(feature.properties?.context ?? ''),
      }));

      return {
        content: [{ type: "text" as const, text: JSON.stringify({ resultats }, null, 2) }],
        structuredContent: { resultats }
      };
    }
  );


  //========== TOOL - liste_risques ==========//

  server.registerTool(
    "liste_risques",
    {
      title: "Liste des risques disponibles",
      description: "Liste les risques disponibles pour les outils `Exposition aux risques` et `Carte d'exposition aux risques`.",
      outputSchema: z
        .object({
          risques: z
            .array(
              z
                .object({
                  code: z
                    .string()
                    .describe("Code du risque"),
                  libelle: z
                    .string()
                    .describe("Libellé du risque"),
                  exposition: z
                    .boolean()
                    .describe("Disponible dans l'outil exposition"),
                  carte: z
                    .boolean()
                    .describe("Disponible sur la carte des risques")
                })
            )
            .optional()
            .describe("Liste des risques"),
          erreur: z
            .string()
            .optional()
            .describe("Message d'erreur")
        }),
      annotations: {
        ...annotations,
        openWorldHint: false
      }
    },
    async () => {
      console.log(`Outil 'liste_risques'`);
      const risques = RISQUES.map(r => {
        return {
           code: r.code,
           libelle: r.libelle,
           exposition: typeof r.fetch !== 'undefined',
           carte: r.layers.length > 0
        };
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ risques }, null, 2) }],
        structuredContent: { risques }
      };
    }
  );


  //========== TOOL - exposition_risques ==========//

  const risquesExposition = RISQUES
    .filter(r => typeof r.fetch !== 'undefined');
  const codesExposition = risquesExposition.map(r => r.code) as [string, ...string[]];

  server.registerTool(
    "exposition_risques",
    {
      title: "Exposition aux risques",
      description: "Fournit le niveau d'exposition aux risques aux coordonnées indiquées (longitude, latitude). Utilise l'API de Géorisques.",
      inputSchema: z.object({
        ...coordonnees,
        risques: z
          .array(z.enum(codesExposition))
          .optional()
          .default(codesExposition)
          .describe('Liste de codes des risques à évaluer (défaut : tous)')
      }),
      annotations
    },
    async ({ longitude, latitude, risques }) => {
      console.log(`Outil 'exposition_risques' : ${longitude},${latitude} / ${risques}`);
      const selection = risquesExposition
        .filter(r => risques.length === 0 || risques.includes(r.code));
      const { expositions, erreurs } = await evaluer(selection, longitude, latitude);

      const textes = expositions.map(([r, exposition]) => r.text(exposition));
      erreurs.forEach(e => {
        const libelle = RISQUES.find(r => r.code === e.code)?.libelle ?? e.code;
        textes.push(`Le risque « ${libelle} » n'a pas pu être évalué : ${e.message}`);
      });

      return {
        isError: expositions.length === 0 && erreurs.length > 0,
        content: [{ type: "text" as const, text: textes.join('\n\n') }]
      };
    }
  );


  //========== TOOL and APP - carte_exposition_risques ==========//

  const appCarteExpositionRisquesResourceUri = "ui://app-carte-exposition-risques/mcp-app.html";

  const risquesCarte = RISQUES
    .filter(r => r.layers.length > 0);
  const codesCarte = risquesCarte.map(r => r.code) as [string, ...string[]];

  registerAppTool(
    server,
    "carte_exposition_risques",
    {
      title: "Carte d'exposition aux risques",
      description: "Affiche sur une carte le niveau d'exposition aux risques aux coordonnées indiquées (longitude, latitude). Utilise l'API de Géorisques.",
      inputSchema: z.object({
        ...coordonnees,
        risques: z
          .array(z.enum(codesCarte))
          .optional()
          .default(codesCarte)
          .describe('Liste de codes des risques à afficher (défaut : tous)')
      }),
      outputSchema: z
        .object({
          exposition: z
            .object({
              risques: z
                .object(Object.fromEntries(
                  risquesCarte.map(r => [r.code, r.outputSchema])
                ))
                .describe('Exposition par risque'),
              ...coordonnees,
            })
            .optional()
            .describe("Exposition aux risques"),
          erreurs: erreursSchema,
          erreur: z
            .string()
            .optional()
            .describe("Message d'erreur")
        }),
      annotations,
      _meta: {
        ui: {
          resourceUri: appCarteExpositionRisquesResourceUri,
        },
      }
    },
    async ({ longitude, latitude, risques }) => {
      console.log(`Outil 'carte_exposition_risques' : ${longitude},${latitude} / ${risques}`);
      const selection = risquesCarte
        .filter(r => risques.length === 0 || risques.includes(r.code));
      const { expositions, erreurs } = await evaluer(selection, longitude, latitude);

      if (expositions.length === 0 && erreurs.length > 0) {
        const erreur = erreurs.map(e => `${e.code} : ${e.message}`).join(' ; ');
        return {
          isError: true,
          content: [{ type: "text" as const, text: JSON.stringify({ erreur, erreurs }, null, 2) }],
          structuredContent: { erreur, erreurs }
        };
      }

      const exposition = {
        risques: Object.fromEntries(expositions.map(([r, e]) => [r.code, e])),
        longitude,
        latitude
      };
      const structuredContent = erreurs.length > 0 ? { exposition, erreurs } : { exposition };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(structuredContent, null, 2) }],
        structuredContent
      };
    }
  );

  // Domaines appelés par la carte (tuiles de fond CARTO, tuiles WMS et légendes Géorisques).
  const csp = {
    connectDomains: [
      "https://a.basemaps.cartocdn.com",
      "https://b.basemaps.cartocdn.com",
      "https://c.basemaps.cartocdn.com",
      "https://d.basemaps.cartocdn.com",
      GEORISQUES_BASE_URL
    ],
    // Images de légende (<img>) servies par le WMS Géorisques
    resourceDomains: [
      GEORISQUES_BASE_URL
    ],
  };

  registerAppResource(
    server,
    "carte_exposition_risques_ui",
    appCarteExpositionRisquesResourceUri,
    {
      description: "Carte interactive d'exposition aux risques (MapLibre GL)",
      mimeType: RESOURCE_MIME_TYPE,
      _meta: {
        ui: { csp },
      },
    },
    async () => {
      const html = await fs.readFile(path.join(DIST_DIR, "client/mcp-app.html"), "utf-8");
      return {
        contents: [
          {
            uri: appCarteExpositionRisquesResourceUri,
            mimeType: RESOURCE_MIME_TYPE,
            text: html,
            _meta: {
              ui: { csp },
            },
          },
        ],
      };
    },
  );

  return server;
}
