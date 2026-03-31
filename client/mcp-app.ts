import { RISQUES } from '../server/risques';
import { App } from "@modelcontextprotocol/ext-apps";
import { Map, Marker, NavigationControl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./mcp-app.css";
import { FullscreenControl, LayersControl, LegendsControl } from './controls.ts';

const app = new App(
    { name: "app-carte-exposition-risques-ui", version: "1.0.0" },
    {},
    // We manage size-changed messages manually to avoid infinite loop when relying on 'vw' and 'vh' units
    { autoResize: false }
);

app.ontoolresult = (result: any) => {
    console.log(result);
    if (result.structuredContent.exposition) {
        // Calculate display and limit bounds
        const SHOW_OFFSET = 0.01;
        const PAD_RATIO = 1.5;
        const min: [number, number] = [result.structuredContent.exposition.longitude - SHOW_OFFSET, result.structuredContent.exposition.latitude - SHOW_OFFSET];
        const max: [number, number] = [result.structuredContent.exposition.longitude + SHOW_OFFSET, result.structuredContent.exposition.latitude + SHOW_OFFSET];
		const widthBuffer = (max[0] - min[0]) * PAD_RATIO;
		const heightBuffer = (max[1] - min[1]) * PAD_RATIO;

        // Setup map
        const map = new Map({
            container: 'map',
            style: 'https://demotiles.maplibre.org/style.json',
            center: [result.structuredContent.exposition.longitude, result.structuredContent.exposition.latitude],
            zoom: 13,
            minZoom: 10,
            maxZoom: 16,
            maxBounds: [
                [min[0] - widthBuffer, min[1] - widthBuffer],
                [max[0] + heightBuffer, max[1] + heightBuffer]
            ],
            maplibreLogo: false
        });
        
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
            .setLngLat([result.structuredContent.exposition.longitude, result.structuredContent.exposition.latitude])
            .addTo(map);

        map.on('load', () => {
            // Background
            map.addSource('grayscale', {
                type: 'raster',
                tiles: [
                    'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
                    'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
                    'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
                    'https://d.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
                ],
                tileSize: 256,
                maxzoom: 20,
                attribution: '<a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="https://carto.com/attributions">CARTO</a>'
            });
            map.addLayer({
                'id': 'grayscale-layer',
                'type': 'raster',
                'source': 'grayscale'
            });
            // Data layers
            let activeRisks: any[] = RISQUES
                .filter(r => {
                    const exposition = result.structuredContent.exposition.risques[r.code];
                    console.log(exposition);
                    return exposition;
                });
            let layers: any[] = activeRisks
                .flatMap(r => {
                    const exposition = result.structuredContent.exposition.risques[r.code];
                    return r.layers.map((l: any) => {
                        const source: any = l.source(exposition);
                        console.log(source);
                        map.addSource(l.id, source);
                        map.addLayer({
                            ...l.layer,
                            id: l.id,
                            source: l.id
                        });
                        return {
                            id: l.id,
                            label: l.nom,
                            legend: l.legend(exposition)
                        };
                    });
                });

            // Create control
            if (layers.length > 1) {
                let label_to_layer_ids = Object.fromEntries(layers.map(l => [l.label, [l.id]]));
                map.addControl(new LayersControl(label_to_layer_ids), 'top-left');
            }

            // Legends
            map.addControl(new LegendsControl(layers), 'bottom-left');

            map.resize();

            app.sendSizeChanged({
                width: document.documentElement.scrollWidth,
                height: document.documentElement.scrollHeight
            });
            app.sendLog({ level: 'info', data: 'Map is ready'})
        });
    }
};

app.connect();