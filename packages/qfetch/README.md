# qfetch

Composable fetch middlewares - includes core utilities and all official middlewares.

## Installation

```bash
npm install qfetch
```

## Usage

```ts
import {
  compose,
  withAuthorization,
  withBaseUrl,
  withHeaders,
  withQueryParams,
  withRetryAfter,
  withRetryStatus,
} from "qfetch";

const qfetch = compose(
  withRetryStatus({ statuses: [500, 502, 503] }),
  withRetryAfter(),
  withHeaders({ "Content-Type": "application/json" }),
  withBaseUrl("https://api.example.com")
)(fetch);

// Use like regular fetch
const response = await qfetch("/users");
```

## What's included

- **Core**: `compose`, `pipeline` - middleware composition utilities
- **Middlewares**:
  - `withAuthorization` - Add authorization headers with token refresh
  - `withBaseUrl` - Prepend base URL to requests
  - `withHeaders` - Add default headers to requests
  - `withQueryParams` - Add query parameters to request URLs
  - `withRetryAfter` - Retry requests based on Retry-After header
  - `withRetryStatus` - Retry requests based on HTTP status codes

## Individual packages

If you only need specific functionality, install individual packages:

- `@qfetch/core` - Core composition utilities
- `@qfetch/middleware-authorization`
- `@qfetch/middleware-base-url`
- `@qfetch/middleware-headers`
- `@qfetch/middleware-query-params`
- `@qfetch/middleware-retry-after`
- `@qfetch/middleware-retry-status`
- `@qfetch/middlewares` - All middlewares without core

## License

MIT
