import type { Map, IControl } from "maplibre-gl";
import "./mcp-app.css";

export class FullscreenControl implements IControl {
    _container: HTMLElement;
    _onClick: any;
    constructor(onClick: any) {
        this._onClick = onClick;
    }
    onAdd() {
        this._container = document.createElement('div');
        this._container.classList.add(
            "maplibregl-ctrl",
            "maplibregl-ctrl-group"
        );
        let btn = document.createElement('button');
        btn.className = 'maplibregl-ctrl-toggle-displaymode';
        btn.textContent = 'Toggle fullscreen';
        btn.addEventListener('click', this._onClick);
        this._container.appendChild(btn);
        return this._container;
    }
    onRemove() {
        this._container.remove();
    }
}

export class LayersControl implements IControl {
    _map: Map;
    _container: HTMLElement;
    _ctrls: any;
    _inputs: any;
  constructor(ctrls: any) {
    // This div will hold all the checkboxes and their labels
    this._container = document.createElement("div");
    this._container.classList.add(
      "maplibregl-ctrl",
      "maplibregl-ctrl-group",
      "layers-control",
    );
    this._ctrls = ctrls;
    this._inputs = [];
    // Create the checkboxes and add them to the container
    for (const key of Object.keys(this._ctrls)) {
      let labeled_checkbox = this._createLabeledCheckbox(key);
      this._container.appendChild(labeled_checkbox);
    }
  }

  // Creates one checkbox and its label
  _createLabeledCheckbox(key: string) {
    let label = document.createElement("label");
    label.classList.add("layer-control");
    let text = document.createTextNode(key);
    let input = document.createElement("input");
    this._inputs.push(input);
    input.type = "checkbox";
    input.id = key;
    // When changed, toggle all the layers associated with the checkbox via
    // `this._ctrls`.
    input.addEventListener("change", () => {
      let visibility = input.checked ? "visible" : "none";
      for (const layer of this._ctrls[input.id]) {
        this._map.setLayoutProperty(layer, "visibility", visibility);
      }
    });
    label.appendChild(input);
    label.appendChild(text);
    return label;
  }

  onAdd(map: Map) {
    this._map = map;
    // For every checkbox, find out if all its associated layers are visible.
    // Check the box if so.
    for (const input of this._inputs) {
      let layers = this._ctrls[input.id];
      let is_visible = true;
      for (const layername of layers) {
        is_visible =
          is_visible &&
          this._map.getLayoutProperty(layername, "visibility") !== "none";
      }
      input.checked = is_visible;
    }
    return this._container;
  }

  onRemove() {
    this._container.remove();
    this._map = undefined;
  }
}

export class LegendsControl implements IControl {
    _map: Map;
    _container: HTMLElement;
    _open: boolean = false;
    _btn: Node;
    _legends: any[];
    constructor(legends: any[]) {
        this._legends = legends;
    }
    onAdd(map: Map) {
        this._map = map;
        this._container = document.createElement('div');
        this._container.classList.add(
            "maplibregl-ctrl",
            "maplibregl-ctrl-group",
            "legends-control"
        );
        this._btn = document.createElement('button');
        this._btn.className = 'toggle-legends';
        this._btn.textContent = 'Legends';
        this._btn.addEventListener('click', () => this.togglePopup());
        this.hide();
        return this._container;
    }
    onRemove() {
        this._container.remove();
        this._map = undefined;
    }
    togglePopup() {
        this._open ? this.hide() : this.show();
    }
    hide() {
        this._container.replaceChildren(this._btn);
        this._open = false;
    }
    show() {
        const nodes = this._legends
            .filter(l => this._map.getLayoutProperty(l.id, "visibility") !== "none")
            .map(l => {
                const div = document.createElement('div');
                div.className = 'legend';
                const label = document.createElement('span');
                label.innerText = l.label;
                div.appendChild(label);
                div.appendChild(l.legend);
                return div;
            });
        this._container.replaceChildren(this._btn, ...nodes);
        this._open = true;
    }
}
