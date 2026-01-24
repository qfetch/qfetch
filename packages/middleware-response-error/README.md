# @qfetch/middleware-response-error

Fetch middleware for throwing errors on HTTP error responses.

## Overview

Automatically throws errors for HTTP responses based on status codes. By default, throws a `ResponseError` for any response with status >= 400. Provides flexible customization through status-specific mappers and configurable thresholds, enabling standardized error handling across your application.

Intended for use with [`@qfetch/core`](https://github.com/qfetch/qfetch/tree/main/packages/core#readme).

## Installation

```bash
npm install @qfetch/middleware-response-error
```

## Quick Start

```typescript
import { withResponseError, ResponseError } from '@qfetch/middleware-response-error';
import { withRetryStatus } from '@qfetch/middleware-retry-status';
import { withBaseUrl } from '@qfetch/middleware-base-url';
import { upto, zero } from '@proventuslabs/retry-strategies';
import { compose } from '@qfetch/core';

// Custom application errors
class NotFoundError extends Error {
  constructor(public url: string) {
    super(`Resource not found: ${url}`);
    this.name = 'NotFoundError';
  }
}

// API client with custom error handling
const api = compose(
  withResponseError({
    statusMap: new Map([
      [404, (res) => new NotFoundError(res.url)],
      [400, async (res) => {
        const body = await res.json();
        return new Error(`Validation failed: ${body.message}`);
      }],
    ]),
  }),
  withRetryStatus({ strategy: () => upto(3, zero()) }),
  withBaseUrl('https://api.example.com/v1/'),
)(fetch);

try {
  const user = await api('users/123').then(r => r.json());
} catch (error) {
  if (error instanceof NotFoundError) {
    // Handle 404 specifically
  } else if (error instanceof ResponseError) {
    // Handle other HTTP errors (500, etc.)
    console.log(error.status, error.statusText);
  }
}
```

## Documentation

For complete API reference, examples, and type definitions, see the [API documentation](https://qfetch.github.io/qfetch/modules/_qfetch_middleware_response_error.html).

## Standards References

- [MDN: Response.ok](https://developer.mozilla.org/en-US/docs/Web/API/Response/ok) - Response success indicator
- [MDN: HTTP Status Codes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status) - HTTP status code reference
