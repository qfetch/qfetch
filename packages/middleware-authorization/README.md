# @qfetch/middleware-authorization

Fetch middleware for automatic `Authorization` header injection with retry on `401 Unauthorized`.

## Overview

Injects `Authorization` headers using a flexible `TokenProvider` interface. When a `401 Unauthorized` response is received, the middleware refreshes the token and retries according to the configured backoff strategy. Supports any authorization scheme (Bearer, Basic, Token, etc.).

Intended for use with [`@qfetch/core`](https://github.com/qfetch/qfetch/tree/main/packages/core#readme).

## Installation

```bash
npm install @qfetch/middleware-authorization @proventuslabs/retry-strategies
```

## Quick Start

```typescript
import { withAuthorization } from '@qfetch/middleware-authorization';
import { withBaseUrl } from '@qfetch/middleware-base-url';
import { withResponseError } from '@qfetch/middleware-response-error';
import { constant, upto } from '@proventuslabs/retry-strategies';
import { compose } from '@qfetch/core';

// Token provider that refreshes on 401 retry
let accessToken = 'initial-token';

const api = compose(
  withResponseError(),
  withAuthorization({
    tokenProvider: {
      getToken: async () => {
        // On retry after 401, this fetches a fresh token
        return { accessToken, tokenType: 'Bearer' };
      },
    },
    // Retry once immediately on 401
    strategy: () => upto(1, constant(0)),
  }),
  withBaseUrl('https://api.example.com/v1/'),
)(fetch);

// Automatic auth header injection and 401 retry
const user = await api('me').then(r => r.json());
```

## Documentation

For complete API reference, examples, and type definitions, see the [API documentation](https://qfetch.github.io/qfetch/modules/_qfetch_middleware_authorization.html).

## Standards References

- [RFC 9110 - 401 Unauthorized](https://www.rfc-editor.org/rfc/rfc9110.html#name-401-unauthorized) - Unauthorized status code
- [RFC 9110 - Authorization](https://www.rfc-editor.org/rfc/rfc9110.html#name-authorization) - Authorization header
- [RFC 6750 - Bearer Token Usage](https://www.rfc-editor.org/rfc/rfc6750.html) - Bearer authentication scheme
- [RFC 7617 - Basic Authentication](https://www.rfc-editor.org/rfc/rfc7617.html) - Basic authentication scheme
