import { App } from "@modelcontextprotocol/ext-apps";

const expositionEl = document.getElementById('exposition')!;

const app = new App({ name: "app-argiles-ui", version: "1.0.0" });

app.ontoolresult = (result: any) => {
    console.log(result);
    if (result.structuredContent.exposition) {
        expositionEl.innerText = result.structuredContent.exposition.libelle;

        const map = new maplibregl.Map({
            container: 'map',
            style: 'https://demotiles.maplibre.org/style.json',
            center: [result.structuredContent.exposition.longitude, result.structuredContent.exposition.latitude],
            zoom: 13,
            minZoom: 10,
            maxZoom: 20,
            maplibreLogo: true
        });

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
                maxZoom: 20
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
                maxZoom: 20
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
