# @qfetch/middleware-retry-after

Fetch middleware for **server-directed** retry timing based on `Retry-After` headers.

## Overview

Respects server-provided retry timing for rate limiting and temporary unavailability. When a response includes a valid `Retry-After` header with a retryable status code (`429` or `503` by default), the middleware waits the server-specified duration before retrying. Supports both delay-seconds and HTTP-date formats per RFC 9110.

Intended for use with [`@qfetch/core`](https://github.com/qfetch/qfetch/tree/main/packages/core#readme).

## Installation

```bash
npm install @qfetch/middleware-retry-after @proventuslabs/retry-strategies
```

## Quick Start

```typescript
import { withRetryAfter } from '@qfetch/middleware-retry-after';
import { withBaseUrl } from '@qfetch/middleware-base-url';
import { withResponseError } from '@qfetch/middleware-response-error';
import { fullJitter, upto } from '@proventuslabs/retry-strategies';
import { compose } from '@qfetch/core';

// Resilient API client that respects rate limits
const api = compose(
  withResponseError(),
  withRetryAfter({
    // Retry up to 3 times with jitter to prevent thundering herd
    strategy: () => upto(3, fullJitter(100, 5_000)),
    // Cap server-requested delays at 30 seconds
    maxServerDelay: 30_000,
  }),
  withBaseUrl('https://api.example.com/v1/'),
)(fetch);

// Automatic retry on 429/503 with Retry-After header
const data = await api('resource').then(r => r.json());
```

## Documentation

For complete API reference, examples, and type definitions, see the [API documentation](https://qfetch.github.io/qfetch/modules/_qfetch_middleware_retry_after.html).

## Standards References

- [RFC 9110 §10.2.3 - Retry-After](https://www.rfc-editor.org/rfc/rfc9110.html#section-10.2.3) - Defines `Retry-After` header format and semantics
- [RFC 6585 §4 - 429 Too Many Requests](https://www.rfc-editor.org/rfc/rfc6585.html#section-4) - Rate limiting status code
- [RFC 9110 §15.6.4 - 503 Service Unavailable](https://www.rfc-editor.org/rfc/rfc9110.html#section-15.6.4) - Temporary unavailability status code
