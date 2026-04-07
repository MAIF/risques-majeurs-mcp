import { describe, it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from './server.js';

describe('createServer', () => {
  it('registers the expected 4 tools', async () => {
    const server = createServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    const client = new Client({ name: 'test-client', version: '1.0.0' });
    await Promise.all([
      client.connect(clientTransport),
      server.connect(serverTransport),
    ]);

    const { tools } = await client.listTools();
    const toolNames = tools.map(t => t.name).sort();
    expect(toolNames).toEqual([
      'carte_exposition_risques',
      'exposition_risques',
      'geocodage',
      'liste_risques',
    ]);

    await client.close();
    await server.close();
  });
});
