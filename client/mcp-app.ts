import { App } from "@modelcontextprotocol/ext-apps";

const expositionEl = document.getElementById('exposition')!;

const app = new App({ name: "app-argiles-ui", version: "1.0.0" });

app.ontoolresult = (result: any) => {
    console.log(result);
    if (result.structuredContent.exposition) {
        expositionEl.innerText = result.structuredContent.exposition.libelle;
    }
};

app.connect();
