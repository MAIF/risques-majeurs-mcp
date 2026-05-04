/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  docSidebar: [
    'introduction',
    'demarrage-rapide',
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
  ],
};

export default sidebars;
