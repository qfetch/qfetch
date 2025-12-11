# @qfetch/middleware-retry-status

Fetch middleware that automatically retries requests based on response status codes with configurable backoff strategies.

## Overview

Implements automatic retry logic following [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html#name-status-codes) semantics for transient error responses. When a request fails with a retryable status code (by default `408`, `429`, `500`, `502`, `503`, `504`), this middleware automatically retries using configurable backoff strategies from [`@proventuslabs/retry-strategies`](https://jsr.io/@proventuslabs/retry-strategies).

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
npm install @qfetch/middleware-retry-status @proventuslabs/retry-strategies
```

## API

### `withRetryStatus(options)`

Creates a middleware that retries failed requests based on response status codes.

#### Options

- `strategy: () => BackoffStrategy` **(required)** - Factory function that creates a backoff strategy for retry delays
  - The strategy determines how long to wait between retry attempts
  - Controls when to stop retrying by returning `NaN`
  - A new strategy instance is created for each request chain
  - Use `upto()` wrapper from `@proventuslabs/retry-strategies` to limit retry attempts
  - Common strategies: `linear()`, `exponential()`, `fullJitter()`
- `retryableStatuses?: ReadonlySet<number>` - Set of HTTP status codes that trigger automatic retries (default: `new Set([408, 429, 500, 502, 503, 504])`)
  - Only responses with these status codes will be retried
  - Override to customize which status codes should trigger retry behavior
  - Common codes: `408` (Request Timeout), `429` (Too Many Requests), `500` (Internal Server Error), `502` (Bad Gateway), `503` (Service Unavailable), `504` (Gateway Timeout)
  - Use an empty set (`new Set()`) to disable all automatic retries

#### Behavior

- **Successful responses** (status 2xx) are returned immediately without retrying
- **Retryable statuses** - By default, only `408`, `429`, `500`, `502`, `503`, and `504` status codes trigger retry logic. This can be customized using the `retryableStatuses` option
- **Non-retryable statuses** - Client errors (4xx except 408 and 429) and other status codes are returned immediately without retrying
- **Backoff strategy**:
  - The strategy determines how long to wait between retry attempts
  - Strategy controls when to stop retrying by returning `NaN`
  - Use `upto()` wrapper to limit the number of retry attempts
  - Common strategies include `linear()`, `exponential()`, and `fullJitter()`
- **Request body cleanup**:
  - Automatically cancels the response body stream before retrying to prevent memory leaks
  - This is a best-effort operation that won't block retries if cancellation fails
- **Error handling**:
  - Exceeding INT32_MAX (2,147,483,647 milliseconds or ~24.8 days) for delay throws a `RangeError`
  - When the strategy returns `NaN`, retrying stops and the last response is returned (no error thrown)
- **Cancellation support**:
  - Respects `AbortSignal` passed via request options or `Request` object
  - Cancellation during retry wait period immediately aborts and throws the abort reason
  - Cancellation during retry request execution propagates the abort signal to the fetch call

## Usage

### Basic usage with linear backoff

```typescript
import { withRetryStatus } from '@qfetch/middleware-retry-status';
import { linear, upto } from '@proventuslabs/retry-strategies';

const qfetch = withRetryStatus({
  strategy: () => upto(3, linear(1000, 10_000)) // Maximum 3 retries
})(fetch);

const response = await qfetch('https://api.example.com/data');
```

### With exponential backoff

```typescript
import { withRetryStatus } from '@qfetch/middleware-retry-status';
import { exponential, upto } from '@proventuslabs/retry-strategies';

const qfetch = withRetryStatus({
  strategy: () => upto(5, exponential(500, 30_000, 2)) // Maximum 5 retries, doubling delay
})(fetch);

const response = await qfetch('https://api.example.com/data');
```

### With jitter (recommended to prevent thundering herd)

```typescript
import { withRetryStatus } from '@qfetch/middleware-retry-status';
import { fullJitter, upto } from '@proventuslabs/retry-strategies';

const qfetch = withRetryStatus({
  strategy: () => upto(3, fullJitter(100, 10_000))
})(fetch);

const response = await qfetch('https://api.example.com/data');
```

### With custom retryable status codes

```typescript
import { withRetryStatus } from '@qfetch/middleware-retry-status';
import { linear, upto } from '@proventuslabs/retry-strategies';

// Only retry on rate limits and gateway errors
const qfetch = withRetryStatus({
  strategy: () => upto(3, linear(1000, 10_000)),
  retryableStatuses: new Set([429, 502, 503])
})(fetch);

const response = await qfetch('https://api.example.com/data');
```

## Notes

- Requests are retried with the exact same parameters (URL, method, headers, body, etc.)
- Response bodies are automatically cancelled before retrying to prevent memory leaks
- By default, the middleware retries on `408`, `429`, `500`, `502`, `503`, and `504` status codes (customizable via `retryableStatuses` option)
- Use the `upto()` wrapper to limit the number of retry attempts
- This middleware does **not** automatically respect `Retry-After` headers - use `@qfetch/middleware-retry-after` for that behavior
- See [`@proventuslabs/retry-strategies`](https://jsr.io/@proventuslabs/retry-strategies) for available backoff strategies
