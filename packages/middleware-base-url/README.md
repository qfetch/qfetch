# @qfetch/middleware-base-url

Fetch middleware for resolving URLs against a configured base URL.

## Overview

Resolves string request URLs against a base URL using the WHATWG URL Standard (`new URL(input, base)`). Relative URLs are resolved, absolute paths replace the pathname, and absolute URLs with schemes bypass the base entirely. URL and Request objects pass through unchanged.

Intended for use with [`@qfetch/core`](https://github.com/qfetch/qfetch/tree/main/packages/core#readme).

## Installation

```bash
npm install @qfetch/middleware-base-url
```

## Quick Start

```typescript
import { withBaseUrl } from '@qfetch/middleware-base-url';
import { withHeaders } from '@qfetch/middleware-headers';
import { compose } from '@qfetch/core';

// Environment-aware API client
const apiBaseUrl = process.env.API_URL ?? 'https://api.example.com/v1/';

const api = compose(
  withHeaders({ 'Accept': 'application/json' }),
  withBaseUrl(apiBaseUrl),
)(fetch);

// Use relative paths throughout your application
const users = await api('users').then(r => r.json());
const user = await api('users/123').then(r => r.json());
const posts = await api('posts?limit=10').then(r => r.json());
```

## Documentation

For complete API reference, examples, and type definitions, see the [API documentation](https://qfetch.github.io/qfetch/modules/_qfetch_middleware_base_url.html).

## Standards References

- [WHATWG URL Standard](https://url.spec.whatwg.org/) - Defines URL resolution behavior
- [MDN: URL API](https://developer.mozilla.org/en-US/docs/Web/API/URL) - Browser implementation documentation
