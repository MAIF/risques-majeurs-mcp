<p align="center">
  <img src="resources/logo.png" alt="Risques Majeurs MCP" width="200">
</p>

# Risques Majeurs MCP

Serveur [MCP](https://modelcontextprotocol.io/) (Model Context Protocol) permettant d'interroger l'exposition aux risques majeurs en France. Il s'appuie sur les API publiques de [Géorisques](https://www.georisques.gouv.fr/) et de la [Géoplateforme IGN](https://data.geopf.fr/) pour fournir des données de géocodage et d'évaluation des risques, ainsi qu'une carte interactive de visualisation.

## Fonctionnalités

Le serveur expose 4 outils MCP :

| Outil | Description |
|---|---|
| **geocodage** | Géocode une adresse en France (adresse → coordonnées GPS + code INSEE) via l'API IGN Geoplateforme |
| **liste_risques** | Liste les risques disponibles et leur disponibilité (exposition textuelle / carte) |
| **exposition_risques** | Retourne le niveau d'exposition aux risques en texte pour des coordonnées données |
| **carte_exposition_risques** | Retourne l'exposition structurée et l'affiche sur une carte interactive (MCP App) |

### Risques couverts

| Code | Risque | Source API Géorisques (v1) | Source API Géorisques (v2) |
|---|---|---|---|
| `argiles` | Retrait-gonflement des argiles (+ PPRN) | `/api/v1/rga`, `gaspar/pprn` | `/api/v2/rga`, `gaspar/pprn` |
| `mouvement_terrain` | Mouvements de terrain (+ PPRN) | `/api/v1/mvt`, `gaspar/pprn` | `/api/v2/mvt`, `gaspar/pprn` |
| `cavites` | Cavités souterraines | `/api/v1/cavites` | `/api/v2/cavites` |
| `inondations` | Inondations (TRI, AZI, PAPI, PPRN) | `/api/v1/gaspar/tri`, `azi`, `papi`, `pprn` | `/api/v2/gaspar/tri`, `azi`, `papi`, `pprn` |
| `catnat` | Catastrophes naturelles (CatNat) | `/api/v1/gaspar/catnat` | `/api/v2/gaspar/catnat` |
| `icpe` | Installations classées Seveso (ICPE, + PPRT) | `/api/v1/installations_classees`, `gaspar/pprt` | `/api/v2/installations_classees`, `gaspar/pprt` |
| `installations_nucleaires` | Installations nucléaires | `/api/v1/installations_nucleaires` | `/api/v2/installations_nucleaires` |

Les endpoints v2 sont utilisés lorsque la variable d'environnement `API_V2_TOKEN` est configurée (jeton d'authentification Géorisques, gratuit). Sinon, les endpoints v1 publics sont utilisés.

> [!WARNING]
> Depuis fin 2026, la spécification OpenAPI de Géorisques documente une réponse `410 Gone` pour les endpoints v1 (hors PPR) : leur retrait est annoncé, sans date à ce jour. Configurer un jeton v2 est recommandé. Si un risque ne peut pas être évalué, les outils renvoient les autres risques et signalent l'erreur au lieu d'échouer entièrement.

Les risques `argiles`, `mouvement_terrain`, `inondations` et `icpe` incluent les plans de prévention associés (PPRN ou PPRT). En v1, les endpoints `gaspar/pprn` et `gaspar/pprt` ne prennent pas de rayon : seuls les plans dont le périmètre contient l'adresse sont renvoyés (rayon de 5 km en v2).

### Carte interactive

L'outil `carte_exposition_risques` inclut une application web embarquée ([MCP App](https://modelcontextprotocol.io/extensions/apps)) basée sur [MapLibre GL](https://maplibre.org/) qui affiche les couches de risques sur un fond Plan IGN, avec contrôle des couches et légendes.

## Prérequis

- [Node.js](https://nodejs.org/) >= 24 (ou utilisez [mise](https://mise.jdx.dev/) pour installer la bonne version automatiquement)

## Utilisation

### Sans installation locale (via `npx`)

Le moyen le plus rapide de connecter le serveur à un client MCP est de le lancer en stdio directement depuis GitHub :

```bash
npx -y --allow-git=all github:MAIF/risques-majeurs-mcp --stdio
```

Au premier appel, npx clone le dépôt, installe les dépendances et exécute le build (`tsc` + `vite`) via le script `prepare`. Les appels suivants réutilisent le cache de npx.

> [!NOTE]
> Depuis npm 12, l'installation de paquets depuis un dépôt git est désactivée par défaut (erreur `EALLOWGIT`). L'option `--allow-git=all` l'autorise pour cette commande ; elle est sans effet sur npm 11 (où c'est déjà le comportement par défaut).

Configuration MCP correspondante :

```json
{
  "mcpServers": {
    "risques-majeurs": {
      "command": "npx",
      "args": ["-y", "--allow-git=all", "github:MAIF/risques-majeurs-mcp", "--stdio"]
    }
  }
}
```

### Installation locale

```bash
git clone https://github.com/MAIF/risques-majeurs-mcp.git
cd risques-majeurs-mcp
npm install   # installe + build automatique via le script `prepare`
```

### Développement (HTTP avec hot-reload)

```bash
npm run start-dev
```

### Production (HTTP)

```bash
npm start
```

Le serveur démarre sur `http://localhost:3000/mcp` et peut être configuré via les variables d'environnement suivantes :

| Variable | Description | Défaut |
|---|---|---|
| `PORT` | Port d'écoute du serveur | `3000` |
| `NODE_ENV` | `development` pour écouter sur `127.0.0.1` (avec validation des en-têtes `Host` et `Origin`), sinon `0.0.0.0` | — |
| `CORS_ORIGIN` | Origine autorisée pour les requêtes CORS | `*` |
| `RATE_LIMIT_WINDOW_MS` | Fenêtre de temps du rate limiting (en ms) | `60000` |
| `RATE_LIMIT_MAX` | Nombre max de requêtes par fenêtre par IP | `100` |
| `TRUST_PROXY` | Configure Express `trust proxy` (`true`, `false`, un nombre de sauts, `loopback`, une IP ou un CIDR). Nécessaire derrière un reverse-proxy (nginx, ngrok, Cloudflare…) pour que le rate-limit identifie correctement l'IP client | — |
| `ALLOWED_HOSTS` | Liste (séparée par des virgules) des noms d'hôte acceptés dans l'en-tête `Host` (protection contre le DNS rebinding lorsque le serveur écoute sur `0.0.0.0`) | — |
| `ALLOWED_ORIGINS` | Liste (séparée par des virgules) des origines acceptées dans l'en-tête `Origin` (une origine non listée reçoit une erreur 403) | — |
| `API_V2_TOKEN` | Jeton d'authentification Géorisques (si configuré, les endpoints V2 sont utilisés) | — |

### Configuration MCP

Pour connecter ce serveur à un client MCP, ajoutez-le dans votre configuration :

```json
{
  "mcpServers": {
    "risques-majeurs": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

## Transport

Le serveur supporte deux transports MCP :

- **Streamable HTTP** (par défaut) — conforme à la [spécification MCP 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http) : protocole **sans état**, sans session ni handshake `initialize` (la version du protocole et les informations du client accompagnent chaque requête), découverte via `server/discover`. Les clients plus anciens (révisions 2025-03-26 à 2025-11-25) restent servis en mode stateless : une instance par requête, sans `Mcp-Session-Id`. Les requêtes `GET` et `DELETE` sur `/mcp` reçoivent une réponse `405`. Tous les outils exposés étant en lecture seule et idempotents, aucun état n'est conservé entre les requêtes.
- **stdio** — pour les clients qui lancent le serveur comme sous-processus (Claude Desktop, Codex CLI, etc.). Activé via le flag `--stdio` (ou la variable d'environnement `MCP_TRANSPORT=stdio`) :

```bash
npm run start-stdio
# ou en mode dev avec hot-reload
npm run start-dev-stdio
# ou directement
node dist/index.js --stdio
```

En mode stdio, le serveur n'écoute pas sur HTTP ; toute la communication passe par stdin/stdout. Les deux générations du protocole sont acceptées (2026-07-28 et handshake `initialize` des révisions 2025). Les logs sont redirigés vers stderr pour ne pas corrompre le flux JSON-RPC.

Le serveur est construit avec le [SDK TypeScript MCP v2](https://github.com/modelcontextprotocol/typescript-sdk) (`@modelcontextprotocol/server`, `createMcpHandler` et `serveStdio`).

## Architecture

```
server/
  index.ts       # Point d'entrée : Express + Streamable HTTP (createMcpHandler) ou stdio (serveStdio)
  server.ts      # Définition du serveur MCP et des outils
  risques.ts     # Définition des risques (fetch, schémas, texte, couches carte)
  utils.ts       # Helpers (appels API Géorisques, dates, sources WMS, icônes SVG)
client/
  mcp-app.html   # Page HTML de l'application carte
  mcp-app.ts     # Application MCP App (MapLibre GL)
  mcp-app.css    # Styles
  controls.ts    # Contrôles MapLibre (couches, légendes, plein écran)
```

## APIs externes utilisées

- **[Géorisques](https://www.georisques.gouv.fr/)** — Données et services WMS sur les risques naturels et technologiques (Ministère de la Transition Écologique)
- **[Géoplateforme IGN](https://data.geopf.fr/)** — Géocodage des adresses en France et fond de carte (Plan IGN v2)

## Licence

Ce projet est distribué sous licence [Apache 2.0](./LICENSE).
