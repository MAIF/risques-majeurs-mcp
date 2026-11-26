import { describe, it, expect, vi, afterEach } from 'vitest';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler, InMemoryTransport } from '@modelcontextprotocol/server';
import { createServer } from './server.js';

const EXPECTED_TOOLS = [
  'carte_exposition_risques',
  'exposition_risques',
  'geocodage',
  'liste_risques',
];

// Client HTTP branché directement sur le handler MCP (sans socket).
const connectHttpClient = async (mode?: 'auto') => {
  const handler = createMcpHandler(() => createServer());
  const transport = new StreamableHTTPClientTransport(new URL('http://test.local/mcp'), {
    fetch: (url, init) => handler.fetch(new Request(url, init)),
  });
  const client = new Client(
    { name: 'test-client', version: '1.0.0' },
    mode ? { versionNegotiation: { mode } } : undefined
  );
  await client.connect(transport);
  return { client, handler };
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('createServer', () => {
  it('registers the expected 4 tools (in-memory, 2025 era)', async () => {
    const server = createServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    const client = new Client({ name: 'test-client', version: '1.0.0' });
    await Promise.all([
      client.connect(clientTransport),
      server.connect(serverTransport),
    ]);

    const { tools } = await client.listTools();
    expect(tools.map(t => t.name).sort()).toEqual(EXPECTED_TOOLS);
    expect(client.getInstructions()).toContain('geocodage');

    await client.close();
    await server.close();
  });

  it('links the map tool to its MCP App resource', async () => {
    const { client, handler } = await connectHttpClient();

    const { tools } = await client.listTools();
    const carte = tools.find(t => t.name === 'carte_exposition_risques')!;
    expect((carte._meta as any)?.ui?.resourceUri).toBe('ui://app-carte-exposition-risques/mcp-app.html');

    const { resources } = await client.listResources();
    const ui = resources.find(r => r.uri === 'ui://app-carte-exposition-risques/mcp-app.html')!;
    expect(ui.mimeType).toBe('text/html;profile=mcp-app');
    expect((ui._meta as any)?.ui?.csp?.resourceDomains).toContain('https://www.georisques.gouv.fr');

    await client.close();
    await handler.close();
  });
});

describe('Streamable HTTP', () => {
  it('serves 2026-07-28 clients (stateless, no initialize handshake)', async () => {
    const { client, handler } = await connectHttpClient('auto');

    expect(client.getProtocolEra()).toBe('modern');
    expect(client.getNegotiatedProtocolVersion()).toBe('2026-07-28');
    const { tools } = await client.listTools();
    expect(tools.map(t => t.name).sort()).toEqual(EXPECTED_TOOLS);

    await client.close();
    await handler.close();
  });

  it('serves 2025-era clients through the stateless fallback', async () => {
    const { client, handler } = await connectHttpClient();

    expect(client.getProtocolEra()).toBe('legacy');
    const result: any = await client.callTool({ name: 'liste_risques', arguments: {} });
    expect(result.structuredContent.risques.map((r: any) => r.code)).toContain('catnat');

    await client.close();
    await handler.close();
  });

  it('answers GET and DELETE with 405 (no session, no standalone SSE stream)', async () => {
    const handler = createMcpHandler(() => createServer());
    for (const method of ['GET', 'DELETE']) {
      const response = await handler.fetch(new Request('http://test.local/mcp', {
        method,
        headers: { accept: 'application/json, text/event-stream' },
      }));
      expect(response.status).toBe(405);
    }
    await handler.close();
  });
});

describe('tools', () => {
  it('exposition_risques reports a failing risk without failing the whole call', async () => {
    const realFetch = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn().mockImplementation((input: any, init?: any) => {
      const url = typeof input === 'string' ? input : input.url;
      if (!url.includes('georisques.gouv.fr')) {
        return realFetch(input, init);
      }
      if (url.includes('/api/v1/rga')) {
        return Promise.resolve({ ok: false, status: 410, statusText: 'Gone' });
      }
      return Promise.resolve({
        ok: true,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: () => Promise.resolve({ data: [] }),
      });
    }));
    delete process.env.API_V2_TOKEN;

    const { client, handler } = await connectHttpClient('auto');
    const result: any = await client.callTool({
      name: 'exposition_risques',
      arguments: { longitude: 4.3601, latitude: 43.8367, risques: ['argiles', 'cavites'] },
    });

    expect(result.isError).toBeFalsy();
    const text = result.content[0].text as string;
    expect(text).toContain('0 cavités sont recensées');
    expect(text).toContain("Le risque « Retrait-gonflement des argiles » n'a pas pu être évalué");
    expect(text).toContain('410 Gone');

    await client.close();
    await handler.close();
  });

  it('carte_exposition_risques returns partial results with the list of errors', async () => {
    const realFetch = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn().mockImplementation((input: any, init?: any) => {
      const url = typeof input === 'string' ? input : input.url;
      if (!url.includes('georisques.gouv.fr')) {
        return realFetch(input, init);
      }
      if (url.includes('/api/v1/cavites')) {
        return Promise.reject(new TypeError('fetch failed'));
      }
      return Promise.resolve({
        ok: true,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: () => Promise.resolve({ exposition: 'Exposition moyenne', codeExposition: '2' }),
      });
    }));
    delete process.env.API_V2_TOKEN;

    const { client, handler } = await connectHttpClient('auto');
    const result: any = await client.callTool({
      name: 'carte_exposition_risques',
      arguments: { longitude: 4.3601, latitude: 43.8367, risques: ['argiles', 'cavites'] },
    });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent.exposition.risques.argiles).toEqual({ libelle: 'Exposition moyenne', score: 2 });
    expect(result.structuredContent.exposition.risques.cavites).toBeUndefined();
    expect(result.structuredContent.erreurs).toEqual([
      { code: 'cavites', message: "Erreur lors de l'appel à l'API Géorisques 'api/v1/cavites' : fetch failed" },
    ]);

    await client.close();
    await handler.close();
  });
});
