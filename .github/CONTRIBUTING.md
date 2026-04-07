# Contributing to Risques Majeurs MCP

First off, thank you for considering contributing to this project! Every contribution is appreciated.

## Code of Conduct

This project adheres to a [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to oss@maif.fr.

## How Can I Contribute?

### Reporting Bugs

- Check existing [issues](../../issues) to avoid duplicates.
- Open a new issue using the issue template, providing as much context as possible (steps to reproduce, expected vs actual behavior, environment details).

### Suggesting Features

- Open an issue describing the feature, its motivation, and how it should work.
- If you'd like to implement it yourself, please discuss it in the issue first so we can align on the approach.

### Submitting a Pull Request

1. Fork the repository and create your branch from `main`.
2. Install dependencies: `npm install` (or `mise run install`).
3. Make your changes.
4. Make sure the project builds successfully: `npm run build` (or `mise run build`).
5. Commit your changes with a clear, descriptive commit message.
6. Push your branch and open a pull request using the PR template.

### Adding a New Risk

To add a new risk, add an entry to the `RISQUES` array in `server/risques.ts`. Each risk must define:

- `code` — Unique identifier
- `libelle` — Display name
- `fetch(longitude, latitude)` — Function calling the Georisques API
- `outputSchema` — Zod schema for the structured output
- `text(exposition)` — Function returning a human-readable summary
- `layers[]` — Map layers (WMS raster source or GeoJSON) with legends; can be empty if the risk has no map visualization

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) >= 20 (or use [mise](https://mise.jdx.dev/) which will install the correct version automatically)

### Getting Started

```bash
# Install dependencies
npm install

# Start in development mode (server + client watch)
npm run start-dev

# Or using mise
mise run dev
```

The MCP server will be available at `http://localhost:3000/mcp`.

## License

By contributing, you agree that your contributions will be licensed under the [Apache 2.0 License](../license).
