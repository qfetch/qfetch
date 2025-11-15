# @qfetch/middleware-base-url

Fetch middleware for automatically resolving URLs against a configured base URL.

## Overview

Automatically resolves request URLs against a configured base URL with **consistent same-origin handling**. All same-origin requests (even those with absolute paths like `/users`) are treated as relative to the base path, while different-origin requests pass through unchanged.

This utility-first approach deviates from strict [URL Standard](https://url.spec.whatwg.org/) behavior to provide a more intuitive and consistent developer experience when working with API clients.

Intended for use with the composable middleware system provided by [`@qfetch/core`](https://github.com/qfetch/qfetch/tree/main/packages/core#readme).

## Installation

```bash
npm install @qfetch/middleware-base-url
```

## API

### `withBaseUrl(options)`

Creates a middleware that resolves request URLs against the given base URL.

#### Parameters

- `options` (`BaseUrlOptions`): The base URL as a string or `URL` instance

#### Returns

A middleware function compatible with `@qfetch/core`.

#### Throws

- `TypeError` - When the provided base URL is invalid

### URL Resolution Behavior

The middleware uses **consistent same-origin detection** across all input types:

#### Same-Origin Requests

All same-origin requests (strings, URLs, or Requests) have their paths treated as **relative** and resolved against the base path - even if they start with `/`:

* `"users"` → appended to base path
* `"/users"` → **also** appended to base path (leading slash stripped)
* `new URL("/users", origin)` → pathname appended to base path

#### Different-Origin Requests

Cross-origin URLs are **passed through unchanged**, regardless of input type:

* `"https://example.com/data"` → unchanged
* `new URL("https://example.com/data")` → unchanged

This consistent behavior favors practical utility: if you're using a base URL middleware, you probably want **all** same-origin requests to use that base path.

### Important Note: Trailing Slashes

A trailing slash (`/`) is recommended at the end of the base URL.
Without it, the `URL` constructor treats the final path segment as a filename and replaces it instead of appending new paths. This follows standard URL resolution behavior:

```typescript
new URL("users", "https://api.example.com/v1");  // → "https://api.example.com/users"
new URL("users", "https://api.example.com/v1/"); // → "https://api.example.com/v1/users"
```

## Usage

### Basic Usage with String Inputs

```typescript
import { withBaseUrl } from '@qfetch/middleware-base-url';
import { compose } from '@qfetch/core';

// Create a fetch instance with a base URL
const qfetch = compose(
  withBaseUrl('https://api.example.com/v1/')
)(fetch);

// Same-origin paths → all resolve against the base
await qfetch('users');  // → https://api.example.com/v1/users
await qfetch('/users'); // → https://api.example.com/v1/users (leading slash stripped)

// Different-origin URL → left unchanged
await qfetch('https://external.com/data'); // → https://external.com/data
```

### Using with URL Objects

URL objects with the same origin have their paths resolved against the base:

```typescript
import { withBaseUrl } from '@qfetch/middleware-base-url';

const qfetch = withBaseUrl('https://api.example.com/v1/')(fetch);

// Same origin → path resolved against base
const sameOriginUrl = new URL('/users', 'https://api.example.com');
await qfetch(sameOriginUrl); // → https://api.example.com/v1/users

// Different origin → passed through unchanged
const differentOriginUrl = new URL('https://external.com/data');
await qfetch(differentOriginUrl); // → https://external.com/data

// Query parameters and hash are preserved
const urlWithQuery = new URL('/users?page=1#top', 'https://api.example.com');
await qfetch(urlWithQuery); // → https://api.example.com/v1/users?page=1#top
```

### Using with Request Objects

Request objects follow the same same-origin resolution logic as URL objects:

```typescript
import { withBaseUrl } from '@qfetch/middleware-base-url';

const qfetch = withBaseUrl('https://api.example.com/v1/')(fetch);

// Same-origin Request → path resolved against base
const sameOriginRequest = new Request(
  new URL('/users', 'https://api.example.com'),
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'John Doe' })
  }
);
// → https://api.example.com/v1/users
// All other properties (method, headers, body) are preserved
await qfetch(sameOriginRequest);

// Different-origin Request → passed through unchanged
const crossOriginRequest = new Request('https://external.com/webhook', {
  method: 'POST',
  body: JSON.stringify({ event: 'user.created' })
});
await qfetch(crossOriginRequest); // → https://external.com/webhook
```

## Limitations

* `Request` objects are reconstructed with new URLs rather than mutated (the API is immutable)
* Request body streams are preserved but not cloned (body remains consumable once)

## Standards References

- [WHATWG URL Standard](https://url.spec.whatwg.org/) - Defines URL resolution behavior
- [MDN: URL API](https://developer.mozilla.org/en-US/docs/Web/API/URL) - Browser implementation documentation
- [Fetch Standard](https://fetch.spec.whatwg.org/) - Defines Request and fetch API semantics
