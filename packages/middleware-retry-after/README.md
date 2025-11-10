# @qfetch/middleware-retry-after

Fetch middleware that automatically retries requests based on the `Retry-After` header.

## Overview

Implements automatic retry logic following [RFC 9110 §10.2.3](https://www.rfc-editor.org/rfc/rfc9110.html#section-10.2.3) semantics for `429 (Too Many Requests)` and `503 (Service Unavailable)` responses. When the server responds with these status codes and a valid `Retry-After` header, this middleware will automatically wait and retry the request according to the server's guidance.

Intended for use with the composable middleware system provided by [`@qfetch/core`](https://github.com/qfetch/qfetch/tree/main/packages/core#readme).

## Installation

```bash
npm install @qfetch/middleware-retry-after
```

## API

### `withRetryAfter(options?)`

Creates a middleware that retries failed requests based on the `Retry-After` header.

#### Options

- `maxRetries?: number` - Maximum number of retry attempts (default: `0`)
  - Set to `0` to disable retries
  - Non-numeric or negative values disable retries
- `maxDelayTime?: number` - Maximum delay in milliseconds for a single retry (default: `undefined`)
  - If the server's `Retry-After` value exceeds this, an `AbortError` is thrown
  - Omit or set to `undefined` for no limit

#### Behavior

- **Successful responses** (status 2xx) are returned immediately, even with a `Retry-After` header
- **Retryable statuses** (`429` or `503`) trigger retry logic when a valid `Retry-After` header is present
- **Retry-After parsing**:
  - Numeric values are interpreted as seconds
  - HTTP-date values are interpreted as absolute future time
  - Invalid or missing headers prevent retries
  - Past dates result in zero-delay retry
- **Error handling**:
  - Exceeding `maxDelayTime` throws an `AbortError`
  - Exceeding `maxRetries` returns the last response without retrying

## Usage

### Basic usage with retry limit

```typescript
import { withRetryAfter } from '@qfetch/middleware-retry-after';
import { compose } from '@qfetch/core';

const qfetch = compose(
  withRetryAfter({ maxRetries: 3 })
)(fetch);

// Automatically retries up to 3 times on 429 or 503 with Retry-After header
const response = await qfetch('https://api.example.com/data');
```

### With maximum retry delay ceiling

```typescript
import { withRetryAfter } from '@qfetch/middleware-retry-after';
import { compose } from '@qfetch/core';

const qfetch = compose(
  withRetryAfter({
    maxRetries: 5,
    maxDelayTime: 60_000 // 60 seconds max delay
  })
)(fetch);

// Throws AbortError if server requests delay > 60 seconds
const response = await qfetch('https://api.example.com/data');
```

### Composing with other middlewares

```typescript
import { withRetryAfter } from '@qfetch/middleware-retry-after';
import { compose } from '@qfetch/core';

const qfetch = compose(
  withRetryAfter({ maxRetries: 3 }),
  // other middlewares...
)(fetch);

await qfetch('https://api.example.com/data');
```

## Notes

- This middleware respects the server's rate-limiting guidance through the standard `Retry-After` header
- It only retries on `429 (Too Many Requests)` and `503 (Service Unavailable)` status codes
- Requests are retried with the exact same parameters (URL, method, headers, body, etc.)
- The middleware waits synchronously during retry delays using `setTimeout`
- Zero or negative retry delays execute immediately
