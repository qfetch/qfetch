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

## Development

This is a monorepo managed with pnpm workspaces, Turbo and release-please.

- `pnpm workspaces`: manages npm dependencies and workspaces
- `Turbo`: manages dev, builds and monorepo dependencies
- `release-please`: manages versioning and publishing

Each package builds to multiple formats (CommonJS, ESM, and IIFE) with ES2020 target for broad compatibility, as configured in their respective `tsdown.config.ts` files.

### Environment Setup

A Nix flake is provided for the full development environment:

```bash
nix develop
```

### Common Commands

```bash
# Generate a new middleware from template
pnpm generate

# Watch mode for dev
pnpm dev

# Build all packages
pnpm build

# Run type checking
pnpm check-types

# Run tests
pnpm test
```

### Repository Structure

```
qfetch/
├── packages/
│   ├── core/                      # Core framework with middleware composition
│   └── middleware-<name>/         # Middleware <name> content
└── turbo/                         # Turbo build configuration
```

