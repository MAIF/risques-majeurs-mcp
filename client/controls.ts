import type { IControl } from "maplibre-gl";

export class FullscreenControl implements IControl {
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
