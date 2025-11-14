# @qfetch/middleware-retry-after

Fetch middleware that automatically retries requests based on the `Retry-After` header.

## Overview

Implements automatic retry logic following [RFC 9110 §10.2.3](https://www.rfc-editor.org/rfc/rfc9110.html#section-10.2.3) semantics for `429 (Too Many Requests)` and `503 (Service Unavailable)` responses. When the server responds with these status codes and a valid `Retry-After` header, this middleware will automatically wait and retry the request according to the server's guidance.

Intended for use with the composable middleware system provided by [`@qfetch/core`](https://github.com/qfetch/qfetch/tree/main/packages/core#readme).

## Important Limitations

> **Note**: Requests with streaming bodies (e.g., `ReadableStream`) cannot be retried per the Fetch API specification. Attempting to retry such requests will result in a `TypeError`. If you need to retry requests with streaming bodies, consider using an additional middleware in the chain that provides a body stream factory capable of recreating the stream for each retry attempt.

## Installation

```bash
npm install @qfetch/middleware-retry-after
```

## API

### `withRetryAfter(options?)`

Creates a middleware that retries failed requests based on the `Retry-After` header.

#### Options

- `maxRetries?: number` - Maximum number of retry attempts (default: unlimited)
  - `0` means no retries at all (fail immediately on first error)
  - Positive integers limit the number of retry attempts
  - Negative or non-numeric values mean unlimited retries
- `maxDelayTime?: number` - Maximum delay in milliseconds for a single retry (default: unlimited)
  - `0` means retry only instant requests (delay must be 0ms, otherwise abort)
  - Positive integers set a ceiling on retry delay duration
  - If the server's `Retry-After` value exceeds this, an `AbortError` is thrown
  - Negative or non-numeric values mean unlimited delay

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

### Basic usage with unlimited retries

```typescript
import { withRetryAfter } from '@qfetch/middleware-retry-after';
import { compose } from '@qfetch/core';

const qfetch = compose(
  withRetryAfter()
)(fetch);

// Automatically retries indefinitely on 429 or 503 with Retry-After header
const response = await qfetch('https://api.example.com/data');
```

### With retry limit

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
- The middleware waits asynchronously during retry delays using `setTimeout`
- Zero or negative retry delays from the server execute immediately
