# @qfetch/middleware-retry-after

Fetch middleware that automatically retries requests based on server-provided `Retry-After` headers with configurable backoff strategies.

## Overview

Implements automatic retry logic following [RFC 9110 §10.2.3](https://www.rfc-editor.org/rfc/rfc9110.html#section-10.2.3) and [RFC 6585 §4](https://www.rfc-editor.org/rfc/rfc6585.html#section-4) semantics for `429 (Too Many Requests)` and `503 (Service Unavailable)` responses. When the server responds with these status codes and a valid `Retry-After` header, this middleware automatically parses the delay value and retries the request.

The middleware uses configurable backoff strategies from [`@proventuslabs/retry-strategies`](https://jsr.io/@proventuslabs/retry-strategies) to add optional jitter to server-requested delays and control retry limits. The total wait time is the sum of the server's `Retry-After` delay plus the strategy's backoff value.

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
npm install @qfetch/middleware-retry-after @proventuslabs/retry-strategies
```

## API

### `withRetryAfter(options)`

Creates a middleware that retries failed requests based on the `Retry-After` header.

#### Options

- `strategy: () => BackoffStrategy` **(required)** - Factory function that creates a backoff strategy for retry delays
  - The strategy determines additional delay (jitter) to add to the server-requested `Retry-After` delay
  - Controls when to stop retrying by returning `NaN`
  - Total wait time = `Retry-After` value + strategy backoff value
  - A new strategy instance is created for each request chain
  - Use `upto()` wrapper from `@proventuslabs/retry-strategies` to limit retry attempts
  - Common strategies: `zero()` (no jitter), `fullJitter()`, `linear()`, `exponential()`
- `maxServerDelay?: number` - Maximum delay in milliseconds accepted from the server for a single retry (default: unlimited)
  - `0` means only allow instant retries (zero delay)
  - Positive integers set a ceiling on the server's requested delay
  - Negative or `NaN` values mean unlimited delay
  - If the server's `Retry-After` value exceeds this, a `ConstraintError` is thrown
- `retryableStatuses?: ReadonlySet<number>` - Set of HTTP status codes that trigger automatic retries (default: `new Set([429, 503])`)
  - Only responses with these status codes and a valid `Retry-After` header will be retried
  - Override to customize which status codes should trigger retry behavior
  - Common additional codes: `502` (Bad Gateway), `503` (Service Unavailable), `504` (Gateway Timeout)
  - Use an empty set (`new Set()`) to disable all automatic retries

#### Behavior

- **Successful responses** (status 2xx) are returned immediately, even with a `Retry-After` header
- **Retryable statuses** - By default, only `429 Too Many Requests` or `503 Service Unavailable` trigger retry logic when a valid `Retry-After` header is present. This can be customized using the `retryableStatuses` option
- **Retry-After parsing** - Supports both formats specified in RFC 9110:
  - **Delay-seconds**: Integer values are interpreted as seconds to wait (e.g., `"120"`)
  - **HTTP-date**: IMF-fixdate timestamps are interpreted as absolute retry time (e.g., `"Wed, 21 Oct 2015 07:28:00 GMT"`)
  - Past dates result in zero-delay retry (immediate retry)
  - Invalid or missing headers prevent retries (response returned as-is, no error thrown)
  - Values exceeding safe integer range are treated as invalid
- **Backoff strategy**:
  - The strategy determines additional delay (jitter) to add to the server's requested delay
  - Total wait time = `Retry-After` value + strategy backoff value
  - Strategy controls when to stop retrying by returning `NaN`
  - Use `upto()` wrapper to limit the number of retry attempts
  - Common strategies include `zero()` (no jitter), `fullJitter()`, `linear()`, and `exponential()`
- **Request body cleanup**:
  - Automatically cancels the response body stream before retrying to prevent memory leaks
  - This is a best-effort operation that won't block retries if cancellation fails
- **Error handling**:
  - Exceeding `maxServerDelay` throws a `DOMException` with name `"ConstraintError"`
  - Exceeding INT32_MAX (2,147,483,647 milliseconds or ~24.8 days) for total delay throws a `RangeError`
  - When the strategy returns `NaN`, retrying stops and the last response is returned (no error thrown)
- **Cancellation support**:
  - Respects `AbortSignal` passed via request options or `Request` object
  - Cancellation during retry wait period immediately aborts and throws the abort reason
  - Cancellation during retry request execution propagates the abort signal to the fetch call

## Usage

### Basic usage (respect server delay exactly)

```typescript
import { withRetryAfter } from '@qfetch/middleware-retry-after';
import { zero } from '@proventuslabs/retry-strategies';

const qfetch = withRetryAfter({
  strategy: () => zero() // No jitter, respect server delay exactly
})(fetch);

const response = await qfetch('https://api.example.com/data');
```

### With limited retries

```typescript
import { withRetryAfter } from '@qfetch/middleware-retry-after';
import { upto, zero } from '@proventuslabs/retry-strategies';

const qfetch = withRetryAfter({
  strategy: () => upto(3, zero()) // Maximum 3 retries
})(fetch);

const response = await qfetch('https://api.example.com/data');
```

### With jitter (recommended to prevent thundering herd)

```typescript
import { withRetryAfter } from '@qfetch/middleware-retry-after';
import { fullJitter, upto } from '@proventuslabs/retry-strategies';

const qfetch = withRetryAfter({
  strategy: () => upto(3, fullJitter(100, 10_000))
})(fetch);

const response = await qfetch('https://api.example.com/data');
```

### With custom retryable status codes

```typescript
import { withRetryAfter } from '@qfetch/middleware-retry-after';
import { fullJitter, upto } from '@proventuslabs/retry-strategies';

// Retry on 429 (Too Many Requests), 502 (Bad Gateway), and 520 (Cloudflare Unknown Error)
const qfetch = withRetryAfter({
  strategy: () => upto(3, fullJitter(100, 10_000)),
  retryableStatuses: new Set([429, 502, 520])
})(fetch);

const response = await qfetch('https://api.example.com/data');
```

### With maximum server delay constraint

```typescript
import { withRetryAfter } from '@qfetch/middleware-retry-after';
import { fullJitter, upto } from '@proventuslabs/retry-strategies';

const qfetch = withRetryAfter({
  strategy: () => upto(3, fullJitter(100, 10_000)),
  maxServerDelay: 120_000 // Maximum 2 minutes delay
})(fetch);

const response = await qfetch('https://api.example.com/data');
```

## Notes

- Requests are retried with the exact same parameters (URL, method, headers, body, etc.)
- Response bodies are automatically cancelled before retrying to prevent memory leaks
- By default, the middleware only retries on `429` and `503` status codes with valid `Retry-After` headers (customizable via `retryableStatuses` option)
- Use the `zero()` strategy to respect server delays exactly without adding jitter
- Use the `upto()` wrapper to limit the number of retry attempts
- See [`@proventuslabs/retry-strategies`](https://jsr.io/@proventuslabs/retry-strategies) for available backoff strategies
