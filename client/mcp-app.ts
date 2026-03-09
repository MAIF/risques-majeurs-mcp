import { App } from "@modelcontextprotocol/ext-apps";
import * as ML from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const expositionEl = document.getElementById('exposition')!;

const app = new App({ name: "app-argiles-ui", version: "1.0.0" });

app.ontoolresult = (result: any) => {
    console.log(result);
    if (result.structuredContent.exposition) {
        expositionEl.innerText = result.structuredContent.exposition.libelle;

        // Calculate display and limit bounds
        const SHOW_OFFSET = 0.01;
        const PAD_RATIO = 1.5;
        const min: [number, number] = [result.structuredContent.exposition.longitude - SHOW_OFFSET, result.structuredContent.exposition.latitude - SHOW_OFFSET];
        const max: [number, number] = [result.structuredContent.exposition.longitude + SHOW_OFFSET, result.structuredContent.exposition.latitude + SHOW_OFFSET];
		const widthBuffer = (max[0] - min[0]) * PAD_RATIO;
		const heightBuffer = (max[1] - min[1]) * PAD_RATIO;

        const map = new ML.Map({
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

        map.addControl(new ML.NavigationControl({
            showZoom: true
        }));

        new ML.Marker()
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
            // Data layer
            map.addSource('argiles-wmts', {
                type: 'raster',
                tiles: ['https://mapsref.brgm.fr/wxs/georisques/risques?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&FORMAT=image/png&TRANSPARENT=true&LAYERS=ALEARG&STYLES=&SRS=EPSG:3857&CRS=EPSG:3857&TILED=false&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}'],
                tileSize: 256,
                maxzoom: 16,
                attribution: 'Ministère de la Transition Écologique'
            });
            map.addLayer({
                'id': 'argiles-wmts-layer',
                'type': 'raster',
                'source': 'argiles-wmts'
            });
        });
    }
};

app.connect();
