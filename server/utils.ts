export const GEORISQUES_BASE_URL = 'https://www.georisques.gouv.fr';

// Délai maximal accordé à un appel aux API externes (Géorisques, IGN).
export const API_TIMEOUT_MS = 15_000;

export const sanitize = (str: string): string => {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Normalise une date renvoyée par l'API Géorisques au format ISO `YYYY-MM-DD`.
 * Les endpoints v1 renvoient des dates `DD/MM/YYYY`, les endpoints v2 des dates
 * ISO (`YYYY-MM-DD` ou date-heure ISO 8601). Toute valeur illisible donne `null`
 * plutôt qu'une date invalide qui ferait échouer la validation du schéma de sortie.
 */
export const toIsoDate = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const v = value.trim();
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  let year: number, month: number, day: number;
  if (m) {
    [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else if ((m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})/))) {
    [year, month, day] = [Number(m[3]), Number(m[2]), Number(m[1])];
  } else {
    return null;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Formate une date ISO `YYYY-MM-DD` en `DD/MM/YYYY` pour les sorties textuelles. */
export const toFrenchDate = (isoDate: string | null | undefined): string | null => {
  const m = isoDate?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
}

/** Chaîne, ou chaîne vide si la valeur est absente (évite les `null` dans les schémas de sortie). */
export const str = (value: unknown): string => {
  return value === null || value === undefined ? '' : String(value);
}

export const callGeorisqueAPI = async (path: string, params: URLSearchParams, defaultPayload: any, token: string = '') => {
  const url = `${GEORISQUES_BASE_URL}/${path}?${params}`;
  const headers: Record<string, string> = { 'Accept': 'application/json' };
  if (token) {
    headers['Authorization'] = 'Bearer ' + token;
  }
  let response: Response;
  try {
    response = await fetch(url, { headers, signal: AbortSignal.timeout(API_TIMEOUT_MS) });
  } catch (e: any) {
    const reason = e?.name === 'TimeoutError' ? `délai de ${API_TIMEOUT_MS / 1000} s dépassé` : (e?.message ?? String(e));
    throw new Error(`Erreur lors de l'appel à l'API Géorisques '${path}' : ${reason}`);
  }
  if (!response.ok) {
    let message = `Erreur lors de l'appel à l'API Géorisques '${path}' : ${response.status} ${response.statusText}`;
    if (response.status === 410) {
      message += ` (endpoint retiré par Géorisques : configurez API_V2_TOKEN pour utiliser l'API v2)`;
    } else if (response.status === 401 && token) {
      message += ` (jeton API_V2_TOKEN invalide ou expiré)`;
    }
    throw new Error(message);
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
    tiles: [`${GEORISQUES_BASE_URL}/services?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&FORMAT=image/png&TRANSPARENT=true&LAYERS=${layerName}&STYLES=&CRS=EPSG:3857&TILED=false&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}`],
    tileSize: 256,
    maxzoom: 16,
    attribution: 'Ministère de la Transition Écologique'
  };
}

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
