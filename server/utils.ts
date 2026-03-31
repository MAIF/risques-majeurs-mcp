export const callGeorisqueAPI = async (path: string, params: URLSearchParams, defaultPayload: any) => {
  const url = `https://georisques.gouv.fr/${path}?${params}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Erreur lors de l'appel à l'API Géorisques '${path}' : ${response.status} ${response.statusText}`);
  }
  let data = defaultPayload;
  const contentType = response.headers.get("Content-Type");
  if (contentType && contentType.includes("application/json")) {
    data = await response.json();
  }
  return data;
}

export const makeRasterGeorisqueSource = (layerName: string) => {
  return {
    type: 'raster',
    tiles: [`https://www.georisques.gouv.fr/services?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&FORMAT=image/png&TRANSPARENT=true&LAYERS=${layerName}&STYLES=&SRS=EPSG:3857&CRS=EPSG:3857&TILED=false&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}`],
    tileSize: 256,
    maxzoom: 16,
    attribution: 'Ministère de la Transition Écologique'
  };
}

export const makeGeorisqueLegend = (layerName: string) => {
  const src = `https://georisques.gouv.fr/services?language=fre&version=1.3.0&service=WMS&request=GetLegendGraphic&sld_version=1.1.0&layer=${layerName}&format=image/png&STYLE=default`;
  const img = document.createElement('img');
  img.src = src;
  return img;
}

/*export const makeRasterGeoPFSource = (layerName: string) => {
  return {
    type: 'raster',
    tiles: [`https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&FORMAT=image/png&LAYER=${layerName}&STYLE=normal&TILEMATRIXSET=PM_6_16&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}`],
    tileSize: 256,
    maxzoom: 16,
    attribution: 'Ministère de la Transition Écologique'
  };
}*/

const htmlToElement = (html: string) => {
    const placeholder = document.createElement('template');
    placeholder.insertAdjacentHTML('afterbegin', html);
    return placeholder.firstElementChild;
}

const makeSvgIcon = (content: string, style: any) => {
  return htmlToElement(`<svg xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 100 100"
    fill-opacity="${style.fillOpacity}"
    fill="${style.fillColor}"
    stroke="${style.strokeColor}"
    stroke-width="${style.strokeWidth}">
      ${content}
    </svg>`);
}

export const makeCircleSvg = (style: any) => {
  return makeSvgIcon('<circle cx="50" cy="50" r="48"/>', style);
}

export const makeSquareSvg = (style: any) => {
  return makeSvgIcon('<rect x="0" y="0" width="100" height="100"/>', style);
}

export const makeLineSvg = (style: any) => {
  return makeSvgIcon('<line x1="0" y1="50" x2="100" y2="50"/>', style);
}

export const makeDiamondSvg = (style: any) => {
  return makeSvgIcon('<polygon points="50 0, 0 50, 50 100, 100 50"/>', style);
}

export const makeTriangleUpSvg = (style: any) => {
  return makeSvgIcon('<polygon points="50 15, 100 100, 0 100"/>', style);
}

export const makeTriangleDownSvg = (style: any) => {
  return makeSvgIcon('<polygon points="50 85, 0 0, 100 0"/>', style);
}

export const makeStarSvg = (style: any) => {
  return makeSvgIcon('<polygon points="50,9 60.5,39.5 92.7,40.1 67,59.5 76.4,90.3 50,71.9 23.6,90.3 32.9,59.5 7.2,40.1 39.4,39.5"/>', style);
}

export const makeLegends = (entries: Array<[Node, string]>) => {
  let ul = document.createElement('ul');
  ul.className = 'legend-entry';
  entries.forEach(e => {
    let entry = document.createElement('li');
    entry.appendChild(e[0]);
    let label = document.createElement('span');
    label.innerText = e[1];
    entry.appendChild(label);
    ul.appendChild(entry);
  })
  return ul;
}
