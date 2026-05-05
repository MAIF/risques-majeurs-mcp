import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import CodeBlock from '@theme/CodeBlock';

const features = [
  {
    icon: '🌍',
    title: 'Geocodage intelligent',
    description: 'Transformez n\'importe quelle adresse en France en coordonnees GPS et code INSEE via l\'API IGN Geoplateforme.',
  },
  {
    icon: '⚠️',
    title: '7 risques majeurs',
    description: 'Argiles, inondations, mouvements de terrain, cavites, installations nucleaires, ICPE Seveso et catastrophes naturelles.',
  },
  {
    icon: '🗺️',
    title: 'Carte interactive',
    description: 'Visualisez l\'exposition aux risques sur une carte MapLibre avec couches WMS, legendes et controles interactifs.',
  },
  {
    icon: '🔌',
    title: 'Standard MCP',
    description: 'Compatible avec tout client MCP : Claude Desktop, Claude Code, ou n\'importe quel agent IA supportant le protocole.',
  },
  {
    icon: '📊',
    title: 'Open Data',
    description: (
      <>
        S'appuie sur les API publiques de{' '}
        <Link href="https://www.georisques.gouv.fr/">Georisques</Link>,{' '}
        de la{' '}
        <Link href="https://data.geopf.fr/">Geoplateforme IGN</Link>{' '}
        et des fonds de carte{' '}
        <Link href="https://carto.com/">CARTO</Link>.
        Donnees ouvertes, transparentes et a jour.
      </>
    ),
  },
  {
    icon: '🚀',
    title: 'Pret a l\'emploi',
    description: 'Aucune installation locale requise via `npx`. Modes stdio et Streamable HTTP supportes pour s\'adapter a tous les clients MCP.',
  },
];

const risks = [
  { icon: '🏜️', label: 'Retrait-gonflement des argiles' },
  { icon: '🌊', label: 'Inondations' },
  { icon: '⛰️', label: 'Mouvements de terrain' },
  { icon: '🕳️', label: 'Cavites souterraines' },
  { icon: '☢️', label: 'Installations nucleaires' },
  { icon: '🏭', label: 'Installations Seveso (ICPE)' },
  { icon: '🌪️', label: 'Catastrophes naturelles' },
];

function HeroBanner() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <header className="hero-banner">
      <div className="container">
        <img src="img/logo.png" alt="Risques Majeurs MCP" className="hero-logo" />
        <h1>{siteConfig.title}</h1>
        <p>{siteConfig.tagline}</p>
        <div className="hero-buttons">
          <Link className="button button--primary button--lg" to="/docs/demarrage-rapide">
            Demarrage rapide
          </Link>
          <Link className="button button--secondary button--lg" to="/docs/introduction">
            Decouvrir le projet
          </Link>
        </div>
      </div>
    </header>
  );
}

function FeaturesSection() {
  return (
    <section className="features-section">
      <div className="container">
        <h2>Un serveur MCP complet pour les risques majeurs</h2>
        <div className="row">
          {features.map((f, i) => (
            <div className="col col--4" key={i}>
              <div className="feature-card">
                <span className="feature-icon">{f.icon}</span>
                <h3>{f.title}</h3>
                <p>{f.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function RisksSection() {
  return (
    <section className="risks-section">
      <div className="container">
        <h2>7 risques majeurs couverts</h2>
        <div className="risk-grid">
          {risks.map((r, i) => (
            <div className="risk-item" key={i}>
              <span className="risk-icon">{r.icon}</span>
              <span>{r.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function QuickStartSection() {
  const configExample = `{
  "mcpServers": {
    "risques-majeurs": {
      "command": "npx",
      "args": ["-y", "github:MAIF/risques-majeurs-mcp", "--stdio"]
    }
  }
}`;

  return (
    <section className="quickstart-section">
      <div className="container">
        <h2>Pret en quelques secondes</h2>
        <p style={{ textAlign: 'center', marginBottom: '1rem', fontWeight: 500 }}>
          Pas d'installation, pas de build manuel. Copiez ce snippet dans la configuration MCP de votre client (Claude Desktop, Codex CLI, Gemini CLI…) — npx clone le depot, build le serveur et le lance en stdio :
        </p>
        <CodeBlock language="json">{configExample}</CodeBlock>
        <br />
        <p style={{ textAlign: 'center', marginBottom: '1rem' }}>
          Avec <strong>Claude Code</strong>, une seule commande suffit :
        </p>
        <CodeBlock language="bash">
          {`claude mcp add risques-majeurs -- npx -y github:MAIF/risques-majeurs-mcp --stdio`}
        </CodeBlock>
        <p style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          <Link className="button button--primary" to="/docs/demarrage-rapide">
            Voir le demarrage rapide complet →
          </Link>
        </p>
      </div>
    </section>
  );
}

function OSSSection() {
  return (
    <section className="oss-section">
      <div className="container">
        <h2>Un projet OSS by MAIF</h2>
        <p>
          Risques Majeurs MCP fait partie de <strong>OSS by MAIF</strong>, le chapter open source de la MAIF.
          La MAIF s'engage a partager ses outils et ses innovations avec la communaute,
          en misant sur la transparence, la collaboration et l'interet general.
        </p>
        <div className="hero-buttons">
          <Link className="button button--primary button--lg" href="https://maif.github.io/">
            Decouvrir OSS by MAIF
          </Link>
          <Link className="button button--outline button--primary button--lg" href="https://github.com/MAIF/risques-majeurs-mcp">
            Voir sur GitHub
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  return (
    <Layout description="Serveur MCP d'exposition aux risques majeurs en France, propulse par l'open data">
      <HeroBanner />
      <main>
        <FeaturesSection />
        <RisksSection />
        <QuickStartSection />
        <OSSSection />
      </main>
    </Layout>
  );
}
