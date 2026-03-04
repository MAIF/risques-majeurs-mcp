import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";


export function createServer() {
  const server = new McpServer({
    name: "risques-majeurs-mcp",
    version: "1.0.0",
  });

  server.registerTool(
    "geocode",
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

      const data = await response.json();

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

  return server;
}
