# @qfetch/middleware-query-params

Fetch middleware for adding query parameters to outgoing request URLs.

## Overview

Sets default query parameters on request URLs using the standard `URLSearchParams` API. Parameters are properly encoded and merged with existing query strings, with request parameters taking precedence. Supports array values in both repeated key (`?tags=a&tags=b`) and bracket notation (`?tags[]=a&tags[]=b`) formats.

Intended for use with [`@qfetch/core`](https://github.com/qfetch/qfetch/tree/main/packages/core#readme).

## Installation

```bash
npm install @qfetch/middleware-query-params
```

## Quick Start

```typescript
import { withQueryParams } from '@qfetch/middleware-query-params';
import { withBaseUrl } from '@qfetch/middleware-base-url';
import { compose } from '@qfetch/core';

// API client with default pagination and filtering
const api = compose(
  withQueryParams({
    format: 'json',
    limit: '25',
    fields: ['id', 'name', 'email'],  // ?fields=id&fields=name&fields=email
  }),
  withBaseUrl('https://api.example.com/v1/'),
)(fetch);

// Fetch paginated users with defaults applied
const users = await api('users').then(r => r.json());
// → https://api.example.com/v1/users?format=json&limit=25&fields=id&fields=name&fields=email

// Request params override defaults
const page2 = await api('users?page=2&limit=50').then(r => r.json());
// → ...?format=json&limit=25&fields=...&page=2&limit=50 (limit=50 takes precedence)
```

## Documentation

For complete API reference, examples, and type definitions, see the [API documentation](https://qfetch.github.io/qfetch/modules/_qfetch_middleware_query_params.html).

## Standards References

- [WHATWG URL Standard](https://url.spec.whatwg.org/) - Defines URL and URLSearchParams behavior
- [MDN: URLSearchParams](https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams) - Browser implementation documentation
