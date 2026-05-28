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
        btn.textContent = 'Plein écran';
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
    _inputs: HTMLInputElement[];
    _groupName: string;
  constructor(ctrls: any) {
    this._container = document.createElement("div");
    this._container.classList.add(
      "maplibregl-ctrl",
      "maplibregl-ctrl-group",
      "layers-control",
    );
    this._ctrls = ctrls;
    this._inputs = [];
    this._groupName = `layers-control-${Math.random().toString(36).slice(2)}`;
    for (const key of Object.keys(this._ctrls)) {
      let labeled_radio = this._createLabeledRadio(key);
      this._container.appendChild(labeled_radio);
    }
  }

  _createLabeledRadio(key: string) {
    let label = document.createElement("label");
    label.classList.add("layer-control");
    let text = document.createTextNode(key);
    let input = document.createElement("input");
    this._inputs.push(input);
    input.type = "radio";
    input.name = this._groupName;
    input.id = key;
    input.addEventListener("change", () => {
      if (!input.checked) return;
      for (const other of this._inputs) {
        let visibility = other === input ? "visible" : "none";
        for (const layer of this._ctrls[other.id]) {
          this._map.setLayoutProperty(layer, "visibility", visibility);
        }
      }
    });
    label.appendChild(input);
    label.appendChild(text);
    return label;
  }

  onAdd(map: Map) {
    this._map = map;
    // Only the first layer is visible by default; hide every other layer.
    this._inputs.forEach((input, idx) => {
      const selected = idx === 0;
      input.checked = selected;
      const visibility = selected ? "visible" : "none";
      for (const layername of this._ctrls[input.id]) {
        this._map.setLayoutProperty(layername, "visibility", visibility);
      }
    });
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
        this._btn.textContent = 'Légende';
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
            .filter(l => l.ids.some((id: string) => this._map.getLayoutProperty(id, "visibility") !== "none"))
            .map(l => {
                const div = document.createElement('div');
                div.className = 'legend';
                const label = document.createElement('span');
                label.innerText = l.label;
                div.appendChild(label);
                div.appendChild(l.legend);
                return div;
            });
        const legends = document.createElement('div');
        legends.className = 'legends';
        nodes.forEach(n => legends.appendChild(n));
        this._container.replaceChildren(this._btn, legends);
        this._open = true;
    }
}
