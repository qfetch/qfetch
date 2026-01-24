# @qfetch/middleware-retry-status

Fetch middleware for **client-controlled** retry timing based on response status codes.

## Overview

Retries transient failures using configurable backoff strategies. When a response has a retryable status code (`408`, `429`, `500`, `502`, `503`, `504` by default), the middleware waits according to the strategy before retrying. Unlike `middleware-retry-after`, retry timing is entirely client-controlled.

Intended for use with [`@qfetch/core`](https://github.com/qfetch/qfetch/tree/main/packages/core#readme).

## Installation

```bash
npm install @qfetch/middleware-retry-status @proventuslabs/retry-strategies
```

## Quick Start

```typescript
import { withRetryStatus } from '@qfetch/middleware-retry-status';
import { withBaseUrl } from '@qfetch/middleware-base-url';
import { withResponseError } from '@qfetch/middleware-response-error';
import { exponential, upto } from '@proventuslabs/retry-strategies';
import { compose } from '@qfetch/core';

// Resilient API client with exponential backoff
const api = compose(
  withResponseError(),
  withRetryStatus({
    // Retry up to 3 times with exponential backoff (1s, 2s, 4s)
    strategy: () => upto(3, exponential(1_000, 2)),
  }),
  withBaseUrl('https://api.example.com/v1/'),
)(fetch);

// Automatic retry on transient failures (500, 502, 503, 504, etc.)
const data = await api('resource').then(r => r.json());
```

## Documentation

For complete API reference, examples, and type definitions, see the [API documentation](https://qfetch.github.io/qfetch/modules/_qfetch_middleware_retry_status.html).

## Standards References

- [RFC 9110 - Status Codes](https://www.rfc-editor.org/rfc/rfc9110.html#name-status-codes) - HTTP status code definitions
- [RFC 9110 §15.5.9 - 408 Request Timeout](https://www.rfc-editor.org/rfc/rfc9110.html#section-15.5.9) - Client timeout status
- [RFC 9110 §15.6 - Server Error 5xx](https://www.rfc-editor.org/rfc/rfc9110.html#section-15.6) - Server error status codes
