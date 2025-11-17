# @qfetch/middleware-retry-after

Fetch middleware that automatically retries requests based on the `Retry-After` header.

## Overview

Implements automatic retry logic following [RFC 9110 §10.2.3](https://www.rfc-editor.org/rfc/rfc9110.html#section-10.2.3) and [RFC 6585 §4](https://www.rfc-editor.org/rfc/rfc6585.html#section-4) semantics for `429 (Too Many Requests)` and `503 (Service Unavailable)` responses. When the server responds with these status codes and a valid `Retry-After` header, this middleware will automatically wait and retry the request according to the server's guidance.

Intended for use with the composable middleware system provided by [`@qfetch/core`](https://github.com/qfetch/qfetch/tree/main/packages/core#readme).

## Important Limitations

> **Replayable vs. Non-Replayable Bodies**  
> Most request bodies — such as strings, `Blob`, `ArrayBuffer`, `Uint8Array`, `FormData`, and `URLSearchParams` — are **replayable**. Fetch recreates their internal body stream for each retry attempt, so these requests can be retried safely without any special handling.

> **Non-Replayable Bodies (Streaming Bodies)**  
> Requests whose body is a non-replayable type — such as `ReadableStream` — **cannot be retried** according to the Fetch specification. Attempting to retry such requests results in a `TypeError` because the body stream has already been consumed.  
>  
> To support retries for streaming bodies, you must provide a *body factory* using a middleware downstream that creates a **fresh stream** for each retry.

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
  - Negative or non-numeric values mean unlimited delay
  - If the server's `Retry-After` value exceeds this, an `AbortError` is thrown
- `maxJitter?: number` - Maximum random jitter using full-jitter strategy (default: no jitter)
  - `0` means no jitter (deterministic retry timing)
  - Positive integers set the jitter cap
  - Negative or non-numeric values mean no jitter

#### Behavior

- **Successful responses** (status 2xx) are returned immediately, even with a `Retry-After` header
- **Retryable statuses** (`429` or `503`) trigger retry logic when a valid `Retry-After` header is present
- **Retry-After parsing**:
  - Numeric values are interpreted as seconds (only non-negative integers)
  - Date values are interpreted as absolute future time (only HTTP-date IMF-fixdate format)
  - Past dates result in zero-delay retry (immediate retry)
  - Invalid or missing headers prevent retries (no error thrown, response returned as-is)
- **Full-jitter strategy**:
  - When `maxJitter` is configured, uses full-jitter: `delay + random(0, min(maxJitter, delay))`
  - Prevents thundering herd by spreading retries across a time window
  - Jitter automatically scales with the base delay (shorter delays = less jitter, longer delays = more jitter up to cap)
  - Always respects the minimum delay specified by the server
- **Error handling**:
  - Exceeding `maxDelayTime` throws a `DOMException` with name `"AbortError"` (checked before jitter is applied)
  - Exceeding INT32_MAX (2,147,483,647 milliseconds or ~24.8 days) throws a `DOMException` with name `"AbortError"` to prevent `setTimeout` overflow behavior where excessively large delays wrap around to immediate execution (checked before jitter is applied)
  - Exceeding `maxRetries` returns the last response without retrying (no error thrown)
- **Cancellation support**:
  - Respects `AbortSignal` passed via request options or `Request` object
  - Cancellation during retry wait period immediately aborts with `AbortError`
  - Cancellation during retry request execution propagates the abort signal to the fetch call

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

### With full-jitter to prevent thundering herd

```typescript
import { withRetryAfter } from '@qfetch/middleware-retry-after';
import { compose } from '@qfetch/core';

const qfetch = compose(
  withRetryAfter({
    maxRetries: 5,
    maxJitter: 5_000 // Cap jitter at 5 seconds
  })
)(fetch);

// Full-jitter examples:
// - Retry-After: 10s  → actual delay: 10s + random(0, 5s)   = 10-15s
// - Retry-After: 2s   → actual delay: 2s + random(0, 2s)    = 2-4s
// - Retry-After: 120s → actual delay: 120s + random(0, 5s)  = 120-125s
//
// This spreads retry attempts across a time window, preventing thundering herd
const response = await qfetch('https://api.example.com/data');
```

### Composing with other middlewares

```typescript
import { withRetryAfter } from '@qfetch/middleware-retry-after';
import { compose } from '@qfetch/core';

const qfetch = compose(
	// other middlewares...
  withRetryAfter({ maxRetries: 3 }),
)(fetch);

await qfetch('https://api.example.com/data');
```

## Notes

- Requests are retried with the exact same parameters (URL, method, headers, body, etc.)
- The middleware always schedules a microtask before retrying
