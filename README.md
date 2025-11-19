# qfetch

Quality fetch - A TypeScript framework for composable fetch middlewares.

## What is qfetch?

qfetch provides a middleware framework for the native `fetch` API, allowing you to compose reusable request/response processing logic. Build fetch clients with retry logic, error handling, logging, base URLs, and custom hooks through composable middleware.

```typescript
import { compose } from '@qfetch/core';
import { withRetry } from '@qfetch/middleware-retry';
import { withBaseUrl } from '@qfetch/middleware-base-url';

const qfetch = compose(
  withRetry({ maxRetries: 3 }),
  withBaseUrl('https://api.example.com')
)(fetch);

// Now use qfetch like regular fetch with retry + base URL
const response = await qfetch('/users');
```

## Features

- **Composable Middleware**: Build complex fetch behavior from simple, reusable middleware components
- **Type-Safe**: Full TypeScript support with type-safe middleware options
- **Standard-Compliant**: Built on standard Fetch API and MDN-documented web standards
- **Multiple Composition Styles**: Use `compose()` (right-to-left) or `pipeline()` (left-to-right)
- **Multi-Format Builds**: CommonJS, ESM, and IIFE outputs with ES2020 target for broad compatibility

## Development

This is a monorepo managed with pnpm workspaces, Turbo and release-please.

- **pnpm workspaces**: Manages npm dependencies and workspace linking
- **Turbo**: Orchestrates builds, tests, and manages monorepo task dependencies
- **release-please**: Automated versioning and publishing to NPM and JSR
- **tsdown**: TypeScript compilation and bundling to multiple formats
- **Biome**: Linting, formatting, and import organization

Each package follows a consistent structure and builds to multiple formats (CommonJS, ESM, and IIFE) with ES2020 target for broad compatibility.

### Environment Setup

A Nix flake is provided for the full development environment:

```bash
nix develop
```

### Common Commands

```bash
# Generate a new middleware from template
pnpm generate

# Watch mode for development (builds, type-checks, and tests on file changes)
pnpm dev

# Build all packages
pnpm build

# Run type checking
pnpm check-types

# Run all tests
pnpm test

# Run integration tests only
pnpm test:integration

# Run unit tests only
pnpm test:unit

# Lint and format code
pnpm style
pnpm repo:style
```

### Repository Structure

```
qfetch/
├── packages/
│   ├── core/                      # Core framework with middleware composition
│   └── middleware-<name>/         # Individual middleware packages
├── turbo/
│   └── templates/                 # Code generation templates
├── .github/workflows/             # CI/CD automation
└── release-please-config.json     # Release automation configuration
```

### Creating New Middleware

Generate a new middleware package from the template:

```bash
pnpm generate
```

This creates a properly structured middleware package with all necessary configuration for testing, building, and publishing to both NPM and JSR.

**Important**: After generating a middleware, manual steps are required:
1. An owner of the `@qfetch` organization on JSR must create the package scope before publishing
2. Update `release-please-config.json` with the new package configuration
3. Add CD workflow job in `.github/workflows/-packages-cd.yaml`
4. Create CI workflow file in `.github/workflows/<name>.ci.yaml`

See [CLAUDE.md](CLAUDE.md) for detailed instructions.

## Architecture

The framework is built around composable middleware that follows the Single Responsibility Principle:

- **Core Package** (`@qfetch/core`): Provides `compose()`, `pipeline()`, and the `Middleware<T>` type system
- **Middleware Packages**: Individual packages that each handle one specific concern (retries, base URLs, logging, etc.)
- **Type Safety**: Each middleware has type-safe, configurable options
- **Standard-Compliant**: Uses only standard Fetch API and MDN-documented web standards

## Contributing

Contributions are welcome! This project uses:
- **Conventional Commits** for automated changelog generation
- **Squash-merge only** for all pull requests
- **BDD-style tests** using Node.js native test runner
- **Automated CI/CD** with per-package workflows

See [CLAUDE.md](CLAUDE.md) for comprehensive development guidelines.

## License

MIT

