# @qfetch/middleware-retry-after

Fetch middleware that automatically retries requests based on the `Retry-After` header.

## Overview

Implements automatic retry logic following [RFC 9110 §10.2.3](https://www.rfc-editor.org/rfc/rfc9110.html#section-10.2.3) semantics for `429 (Too Many Requests)` and `503 (Service Unavailable)` responses. When the server responds with these status codes and a valid `Retry-After` header, this middleware will automatically wait and retry the request according to the server's guidance.

Intended for use with the composable middleware system provided by [`@qfetch/core`](https://github.com/qfetch/qfetch/tree/main/packages/core#readme).

## Important Limitations

> **Replayable vs. Non-Replayable Bodies**  
> Most request bodies — such as strings, `Blob`, `ArrayBuffer`, `Uint8Array`, `FormData`, and `URLSearchParams` — are **replayable**. Fetch recreates their internal body stream for each retry attempt, so these requests can be retried safely without any special handling.

> **Non-Replayable Bodies (Streaming Bodies)**  
> Requests whose body is a non-replayable type — such as `ReadableStream` — **cannot be retried** according to the Fetch specification. Attempting to retry such requests results in a `TypeError` because the body stream has already been consumed.  
>  
> To support retries for streaming bodies, you must provide a *body factory* using a middleware that creates a **fresh stream** for each retry.

> **Note**  
> These semantics apply consistently across browser Fetch and Node.js Fetch:  
> - Replayable bodies → safe to retry  
> - Streams → require a factory

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
  - Numeric values are interpreted as seconds (only non-negative integers matching `/^\d+$/` are valid)
  - HTTP-date values are interpreted as absolute future time in IMF-fixdate format
  - Invalid or missing headers prevent retries (no error thrown, response returned as-is)
  - Past dates result in zero-delay retry (immediate retry)
- **Error handling**:
  - Exceeding `maxDelayTime` throws a `DOMException` with name `"AbortError"`
  - Exceeding INT32_MAX (2,147,483,647 milliseconds or ~24.8 days) throws a `DOMException` with name `"AbortError"` to prevent `setTimeout` overflow behavior where excessively large delays wrap around to immediate execution
  - Exceeding `maxRetries` returns the last response without retrying (no error thrown)

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
