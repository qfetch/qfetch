# qfetch - Quality Fetch

A TypeScript framework for composable fetch middlewares built on standard web APIs.

## Overview

qfetch lets you compose reusable request/response processing logic around the native `fetch` API. Build fetch clients with retry logic, error handling, logging, base URLs, and more through composable middleware.

```typescript
import { compose } from '@qfetch/core';
import { withRetry } from '@qfetch/middleware-retry';
import { withBaseUrl } from '@qfetch/middleware-base-url';

const qfetch = compose(
  withRetry({ maxRetries: 3 }),
  withBaseUrl('https://api.example.com')
)(fetch);

// Use qfetch like regular fetch with baked in retry + base URL
const response = await qfetch('/users');
```

## Features

- **Composable**: Build complex behavior from simple, reusable middleware
- **Type-Safe**: Full TypeScript support with type-safe options
- **Standard-Compliant**: Built on Fetch API and MDN web standards
- **Flexible**: Compose right-to-left with `compose()` or left-to-right with `pipeline()`
- **Universal**: Works in Node.js, browsers, and edge runtimes

## Quick Start

```bash
# Install core package
npm install @qfetch/core

# Install middleware packages as needed
# npm install @qfetch/middleware-<name>
```

## Packages

- **[@qfetch/core](packages/core)**: Core middleware composition system

## License

MIT

