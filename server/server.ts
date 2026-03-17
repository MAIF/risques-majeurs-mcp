import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import { RISQUES } from "./risques.js";

const DIST_DIR = path.join(import.meta.dirname, "../dist");


export function createServer() {
  const server = new McpServer({
    name: "risques-majeurs-mcp",
    version: "1.0.0",
  });


  //========== TOOL - geocodage ==========//

  server.registerTool(
    "geocodage",
    {
      title: "Géocodage",
      description: "Géocode une adresse en France : transforme une adresse textuelle en coordonnées GPS (longitude, latitude) et code INSEE de la commune. Utilise l'API de géocodage de l'IGN (Geoplateforme).",
      inputSchema: {
        adresse: z
          .string()
          .describe("L'adresse à géocoder, par exemple '20 avenue de Ségur, Paris'"),
        limite: z
          .number()
          .gte(1)
          .lte(50)
          .multipleOf(1)
          .optional()
          .default(5)
          .describe("Nombre maximum de résultats (1 à 50, défaut: 5)"),
      },
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
                    .enum(["housenumber", "street", "locality", "municipality"])
                    .describe("Type de résultat"),
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
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async ({ adresse, limite }) => {
      const params = new URLSearchParams({
        q: adresse,
        limit: String(limite),
      });

      const url = `https://data.geopf.fr/geocodage/search?${params}`;
      const response = await fetch(url);

      if (!response.ok) {
        const erreur = `Erreur lors du géocodage : ${response.status} ${response.statusText}`
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({erreur}, null, 2),
            },
          ],
          structuredContent: {erreur}
        };
      }

      const data : any = await response.json();

      const resultats = data.features.map((feature: any) => ({
        libelle: feature.properties.label,
        score: feature.properties.score,
        type: feature.properties.type,
        coordonnees: {
          longitude: feature.geometry.coordinates[0],
          latitude: feature.geometry.coordinates[1],
        },
        codeInsee: feature.properties.citycode,
        commune: feature.properties.city,
        codePostal: feature.properties.postcode,
        contexte: feature.properties.context,
      }));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({resultats}, null, 2),
          },
        ],
        structuredContent: {resultats}
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
                    .describe("Libellé du risque")
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
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async () => {
      const risques = RISQUES.map((r: any) => {
        return {
           code: r.code,
           libelle: r.libelle
        };
      });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({risques}, null, 2),
          },
        ],
        structuredContent: {risques}
      };
    }
  );


  //========== TOOL - exposition_risques ==========//

  server.registerTool(
    "exposition_risques",
    {
      title: "Exposition aux risques",
      description: "Fournit le niveau d'exposition aux risques aux coordonnées indiquées (longitude, latitude). Utilise l'API de Géorisques.",
      inputSchema: {
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
        risques: z
          .array(
            z
              .enum(RISQUES.map((r: any) => r.code))
          )
          .optional()
          .default(RISQUES.map((r: any) => r.code))
          .describe('Liste de codes des risques à évaluer')
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async ({ longitude, latitude, risques }) => {
      try {
        const expositions = await Promise.all(RISQUES
          .filter((r: any) => risques.length === 0 || risques.includes(r.code))
          .map(async (r: any) => {
            const exposition = await r.fetch(longitude, latitude);
            return r.text(exposition);
          })
        )

        const text = expositions.join('\n\n');

        return {
          content: [
            {
              type: "text" as const,
              text,
            },
          ]
        };
      } catch (e: any) {
        const erreur = e.message;
        return {
          content: [
            {
              type: "text" as const,
              text: erreur,
            },
          ]
        };
      }
    }
  );


  //========== TOOL and APP - carte_exposition_risques ==========//

  const appCarteExpositionRisquesResourceUri = "ui://app-carte-exposition-risques/mcp-app.html";

  server.registerTool(
    "carte_exposition_risques",
    {
      title: "Carte d'exposition aux risques",
      description: "Affiche sur une carte le niveau d'exposition aux risques aux coordonnées indiquées (longitude, latitude). Utilise l'API de Géorisques.",
      inputSchema: {
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
        risques: z
          .array(
            z
              .enum(RISQUES.map((r: any) => r.code))
          )
          .optional()
          .default(RISQUES.map((r: any) => r.code))
          .describe('Liste de codes des risques à afficher')
      },
      outputSchema: z
        .object({
          exposition: z
            .object({
              risques: z
                .object(Object.fromEntries(
                  RISQUES.map((r: any) => [r.code, r.outputSchema])
                ))
                .describe('Exposition aux risques'),
              longitude: z
                .number()
                .gte(-180)
                .lte(180)
                .describe("Longitude dans le système géodésique EPSG:4326 / WGS 84"),
              latitude: z
                .number()
                .gte(-90)
                .lte(90)
                .describe("Latitude dans le système géodésique EPSG:4326 / WGS 84")
            })
            .optional()
            .describe("Exposition au risque de retrait-gonflement des argiles"),
          erreur: z
            .string()
            .optional()
            .describe("Message d'erreur")
        }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      },
      _meta: {
        ui: {
          resourceUri: appCarteExpositionRisquesResourceUri,
          visibility: ["app"]
        },
        "ui/resourceUri": appCarteExpositionRisquesResourceUri
      }
    },
    async ({ longitude, latitude, risques }) => {
      try {
        const expositions = await Promise.all(RISQUES
          .filter((r: any) => risques.length === 0 || risques.includes(r.code))
          .map(async (r: any) => {
            const exposition = await r.fetch(longitude, latitude);
            return [r.code, exposition];
          })
        )

        const exposition = {
          risques: Object.fromEntries(expositions),
          longitude,
          latitude
        };

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({exposition}, null, 2),
            },
          ],
          structuredContent: {exposition}
        };
      } catch (e: any) {
        const erreur = e.message;
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({erreur}, null, 2),
            },
          ],
          structuredContent: {erreur}
        };
      }
    }
  );

  server.registerResource(
    "app-argiles-ui",
    appCarteExpositionRisquesResourceUri,
    {
      mimeType: "text/html;profile=mcp-app"
    },
    async () => {
      const html = await fs.readFile(path.join(DIST_DIR, "client/mcp-app.html"), "utf-8");
      return {
        contents: [
          {
            uri: appCarteExpositionRisquesResourceUri,
            mimeType: "text/html;profile=mcp-app",
            text: html
          },
        ],
      };
    },
  );

  return server;
}
