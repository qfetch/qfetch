# qfetch - Quality Fetch

A TypeScript framework for composable fetch middlewares built on standard web APIs.

## Overview

qfetch lets you compose reusable request/response processing logic around the native `fetch` API. Build fetch clients with retry logic, authorization, default headers, base URLs, and more through composable middleware.

```typescript
import {
  compose,
  withRetryStatus,
  withRetryAfter,
  withHeaders,
  withBaseUrl,
} from '@qfetch/qfetch';

const qfetch = compose(
  withRetryStatus({ statuses: [500, 502, 503] }),
  withRetryAfter(),
  withHeaders({ 'Content-Type': 'application/json' }),
  withBaseUrl('https://api.example.com')
)(fetch);

// Use like regular fetch with retry, headers, and base URL baked in
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
# Install everything (recommended)
npm install @qfetch/qfetch

# Or install individual packages
npm install @qfetch/core @qfetch/middleware-base-url
```

## Packages

### Main

| Package | Description |
|---------|-------------|
| [@qfetch/qfetch](packages/qfetch) | All-in-one package with core and all middlewares |
| [@qfetch/core](packages/core) | Core middleware composition system |
| [@qfetch/middlewares](packages/middlewares) | Collection of all middlewares (without core) |

### Middlewares

| Package | Description |
|---------|-------------|
| [@qfetch/middleware-authorization](packages/middleware-authorization) | Authorization header injection and 401 retry handling |
| [@qfetch/middleware-base-url](packages/middleware-base-url) | Base URL resolution using standard URL constructor |
| [@qfetch/middleware-headers](packages/middleware-headers) | Default headers for requests |
| [@qfetch/middleware-query-params](packages/middleware-query-params) | Query parameters for request URLs |
| [@qfetch/middleware-response-error](packages/middleware-response-error) | Throw errors based on HTTP response status codes |
| [@qfetch/middleware-retry-after](packages/middleware-retry-after) | Server-directed retry timing (Retry-After header) |
| [@qfetch/middleware-retry-status](packages/middleware-retry-status) | Client-controlled retry based on status codes |

## License

MIT

