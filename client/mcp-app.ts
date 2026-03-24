import { RISQUES } from '../server/risques';
import { App } from "@modelcontextprotocol/ext-apps";
import { Map, Marker, NavigationControl, type IControl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./mcp-app.css";

class FullscreenControl implements IControl {
    _map: Map;
    _container: HTMLElement;
    _onClick: any;
    constructor(onClick: any) {
        this._onClick = onClick;
    }
    onAdd(map: Map) {
        this._map = map;
        this._container = document.createElement('div');
        this._container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
        let btn = document.createElement('button');
        btn.className = 'maplibregl-ctrl-toggle-displaymode';
        btn.textContent = 'Toggle fullscreen';
        btn.addEventListener('click', this._onClick);
        this._container.appendChild(btn);
        return this._container;
    }
    onRemove() {
        this._container.remove();
        this._map = undefined;
    }
}

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
            RISQUES.map(r => {
                console.log('Risque: ' + r.code);
                const exposition = result.structuredContent.exposition.risques[r.code];
                console.log(exposition);
                if (exposition) {
                    const source: any = r.source(exposition);
                    console.log(source);
                    map.addSource(r.code, source);
                    map.addLayer({
                        ...r.layer,
                        id: r.code,
                        source: r.code
                    });
                }
            });

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