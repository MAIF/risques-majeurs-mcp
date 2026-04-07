import {themes as prismThemes} from 'prism-react-renderer';

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Risques Majeurs MCP',
  tagline: 'Le serveur MCP de prévention des risques majeurs, propulsé par l\'open data',
  favicon: 'img/logo.ico',

  future: {
    v4: true,
  },

  url: 'https://maif.github.io',
  baseUrl: '/risques-majeurs-mcp/',

  organizationName: 'MAIF',
  projectName: 'risques-majeurs-mcp',

  onBrokenLinks: 'throw',

  markdown: {
    format: 'detect',
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: 'warn',
      onBrokenMarkdownImages: 'warn',
    },
  },

  i18n: {
    defaultLocale: 'fr',
    locales: ['fr'],
  },

  themes: [
    '@docusaurus/theme-mermaid',
    [
      require.resolve("@easyops-cn/docusaurus-search-local"),
      ({
        hashed: true,
        language: ['fr'],
        indexBlog: false,
      }),
    ],
  ],

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: './sidebars.js',
          editUrl: 'https://github.com/MAIF/risques-majeurs-mcp/tree/main/documentation/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      image: 'img/logo.png',
      colorMode: {
        defaultMode: 'light',
        respectPrefersColorScheme: true,
      },
      navbar: {
        title: 'Risques Majeurs MCP',
        logo: {
          alt: 'Risques Majeurs MCP',
          src: 'img/logo.png',
        },
        items: [
          {
            type: 'docSidebar',
            sidebarId: 'docSidebar',
            position: 'left',
            label: 'Documentation',
          },
          {
            href: 'https://maif.github.io/',
            label: 'OSS by MAIF',
            position: 'right',
          },
          {
            href: 'https://github.com/MAIF/risques-majeurs-mcp',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Documentation',
            items: [
              { label: 'Introduction', to: '/docs/introduction' },
              { label: 'Demarrage rapide', to: '/docs/demarrage-rapide' },
              { label: 'Les outils MCP', to: '/docs/outils/' },
            ],
          },
          {
            title: 'Communaute',
            items: [
              { label: 'GitHub', href: 'https://github.com/MAIF/risques-majeurs-mcp' },
              { label: 'OSS by MAIF', href: 'https://maif.github.io/' },
              { label: 'Contribuer', to: '/docs/contribuer' },
            ],
          },
          {
            title: 'Ressources',
            items: [
              { label: 'Georisques', href: 'https://www.georisques.gouv.fr/' },
              { label: 'Model Context Protocol', href: 'https://modelcontextprotocol.io/' },
              { label: 'Geoplateforme IGN', href: 'https://data.geopf.fr/' },
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} MAIF — Licence Apache 2.0`,
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
        additionalLanguages: ['bash', 'json'],
      },
    }),
};

export default config;
