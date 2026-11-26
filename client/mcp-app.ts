import { RISQUES } from '../server/risques';
import { App } from "@modelcontextprotocol/ext-apps";
import { Map, Marker, NavigationControl, setWorkerUrl } from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";
// MapLibre v6 charge son worker depuis une URL. L'application étant livrée en un seul
// fichier HTML (servi dans une iframe sandboxée par l'hôte MCP), le code du worker est
// embarqué tel quel puis exposé via une URL blob:, comme le faisait MapLibre v5.
import maplibreWorkerSource from "maplibre-gl/dist/maplibre-gl-worker.mjs?raw";
import { fr } from 'maplibre-ui-translations';
import "maplibre-gl/dist/maplibre-gl.css";
import "./mcp-app.css";
import { FullscreenControl, LayersControl, LegendsControl } from './controls.ts';

setWorkerUrl(URL.createObjectURL(new Blob([maplibreWorkerSource], { type: "text/javascript" })));

// Fond de carte : Plan IGN v2 (Géoplateforme IGN, licence ouverte, sans clé d'API),
// désaturé pour que les couches de risques portent toute la couleur. CARTO a fermé
// ses tuiles raster sans clé (filigrane « API KEY REQUIRED »). Les tuiles sont appelées
// directement (pas de proxy) car en mode stdio il n'y a pas de serveur HTTP.
// Déclaré directement dans le style (aucun style distant à télécharger).
const BASEMAP_STYLE: StyleSpecification = {
    version: 8,
    sources: {
        basemap: {
            type: 'raster',
            tiles: [
                'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/png&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}'
            ],
            tileSize: 256,
            maxzoom: 19,
            attribution: '<a href="https://www.ign.fr/">IGN</a> – <a href="https://geoservices.ign.fr/">Géoplateforme</a>'
        }
    },
    layers: [
        {
            id: 'basemap-layer',
            type: 'raster',
            source: 'basemap',
            paint: {
                'raster-saturation': -1,
                'raster-brightness-min': 0.1
            }
        }
    ]
};

const app = new App(
    { name: "app-carte-exposition-risques-ui", version: "1.0.0" },
    {},
    // We manage size-changed messages manually to avoid infinite loop when relying on 'vw' and 'vh' units
    { autoResize: false }
);

let currentMap: Map | undefined;

const sendSize = () => {
    app.sendSizeChanged({
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight
    });
};

const showMessage = (message: string) => {
    currentMap?.remove();
    currentMap = undefined;
    const container = document.getElementById('map')!;
    container.replaceChildren();
    const div = document.createElement('div');
    div.className = 'map-message';
    div.textContent = message;
    container.appendChild(div);
    sendSize();
};

app.ontoolresult = (result: any) => {
    const exposition = result?.structuredContent?.exposition;
    if (!exposition) {
        const erreur = result?.structuredContent?.erreur;
        showMessage(erreur ? `Impossible d'afficher la carte : ${erreur}` : "Aucune donnée d'exposition à afficher.");
        return;
    }

    // Un nouveau résultat remplace la carte précédente
    currentMap?.remove();
    document.getElementById('map')!.replaceChildren();

    // Calculate display and limit bounds
    const SHOW_OFFSET = 0.01;
    const PAD_RATIO = 10;
    const min: [number, number] = [exposition.longitude - SHOW_OFFSET, exposition.latitude - SHOW_OFFSET];
    const max: [number, number] = [exposition.longitude + SHOW_OFFSET, exposition.latitude + SHOW_OFFSET];
    const widthBuffer = (max[0] - min[0]) * PAD_RATIO;
    const heightBuffer = (max[1] - min[1]) * PAD_RATIO;

    // Setup map
    const map = new Map({
        container: 'map',
        style: BASEMAP_STYLE,
        center: [exposition.longitude, exposition.latitude],
        zoom: 13,
        minZoom: 10,
        maxZoom: 16,
        maxBounds: [
            [min[0] - widthBuffer, min[1] - heightBuffer],
            [max[0] + widthBuffer, max[1] + heightBuffer]
        ],
        maplibreLogo: false,
        locale: fr
    });
    currentMap = map;

    map.fitBounds([min, max]);

    map.addControl(new NavigationControl({
        showZoom: true
    }));

    // Add fullscreen toggle if supported
    if (app.getHostContext()?.availableDisplayModes?.includes('fullscreen')) {
        map.addControl(new FullscreenControl(() => {
            const ctx = app.getHostContext();
            const newMode = ctx?.displayMode === 'inline' ? 'fullscreen' : 'inline';
            if (ctx?.availableDisplayModes?.includes(newMode)) {
                app.requestDisplayMode({ mode: newMode });
            }
        }), 'top-left');
    }

    new Marker()
        .setLngLat([exposition.longitude, exposition.latitude])
        .addTo(map);

    map.on('load', () => {
        // Data layers (risks that could not be evaluated are absent from the result)
        const activeRisks: any[] = RISQUES
            .filter(r => exposition.risques?.[r.code]);
        const layers: any[] = activeRisks
            .flatMap(r => {
                const risque = exposition.risques[r.code];
                return r.layers.map((l: any) => {
                    const source: any = l.source(risque);
                    map.addSource(l.id, source);
                    // May contain multiple maplibre draw layers
                    const drawLayers = [l.layer].flat();
                    drawLayers.forEach((layer, idx) => map.addLayer({
                        ...layer,
                        id: `${l.id}_${idx}`,
                        source: l.id
                    }));
                    return {
                        ids: drawLayers.map((_layer, idx) => `${l.id}_${idx}`),
                        label: l.nom,
                        legend: l.legend(risque)
                    };
                });
            });

        // Create control
        if (layers.length > 1) {
            const label_to_layer_ids = Object.fromEntries(layers.map(l => [l.label, l.ids]));
            map.addControl(new LayersControl(label_to_layer_ids), 'top-left');
        }

        // Legends
        if (layers.length > 0) {
            map.addControl(new LegendsControl(layers), 'bottom-left');
        }

        map.resize();
        sendSize();
        app.sendLog({ level: 'info', data: 'Map is ready' });
    });
};

app.connect();
