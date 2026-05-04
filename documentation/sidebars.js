/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  docSidebar: [
    'introduction',
    'demarrage-rapide',
    'clients-mcp',
    'api-georisques-v2',
    {
      type: 'category',
      label: 'Les outils MCP',
      collapsed: false,
      items: [
        'outils/index',
        'outils/geocodage',
        'outils/exposition-risques',
        'outils/carte-exposition-risques',
      ],
    },
    'risques',
    'architecture',
    'contribuer',
    {
      type: 'category',
      label: 'Demos',
      collapsed: false,
      items: [
        'demos/index',
        'demos/chatgpt',
        'demos/mistral',
      ],
    },
  ],
};

export default sidebars;
