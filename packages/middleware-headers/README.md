# @qfetch/middleware-headers

Fetch middleware for adding default headers to outgoing requests.

## Overview

Sets default headers on outgoing requests using the standard `Headers` API. Request headers take precedence over middleware headers - if a header already exists in the request, the middleware header is not applied.

**Input formats:**
- **Plain object** → `{ "Content-Type": "application/json" }`
- **Headers instance** → `new Headers({ "Content-Type": "application/json" })`

**Header handling:**
- Header names are case-insensitive per HTTP specification
- Request headers take precedence (no override)
- Empty headers object `{}` passes request through unchanged

This middleware follows the [HTTP/1.1 specification](https://www.rfc-editor.org/rfc/rfc9110.html#name-header-fields) for header field handling.

Intended for use with the composable middleware system provided by [`@qfetch/core`](https://github.com/qfetch/qfetch/tree/main/packages/core#readme).

## Installation

```bash
npm install @qfetch/middleware-headers
```

## API

### `withHeader(name, value)`

Creates a middleware that adds a single header to outgoing requests.

#### Parameters

- `name` (`string`) **(required)** - The header name
- `value` (`string`) **(required)** - The header value

### `withHeaders(headers)`

Creates a middleware that adds multiple headers to outgoing requests.

#### Parameters

- `headers` (`HeadersInput`) **(required)** - Headers to add
  - Plain object: `Record<string, string>`
  - Headers instance: `Headers`

### Types

```typescript
type HeaderEntries = Record<string, string>;
type HeadersInput = HeaderEntries | Headers;
```

#### Behavior

- **Case-insensitive** - Header names are case-insensitive per HTTP specification
- **No override** - Request headers take precedence over middleware headers
- **Fast path** - Empty headers object passes request through unchanged
- **Standard API** - Uses the native `Headers` API for proper handling

## Usage

```typescript
import { withHeader, withHeaders } from '@qfetch/middleware-headers';

// Single header
const qfetch = withHeader('Content-Type', 'application/json')(fetch);
await qfetch('https://api.example.com/users');
// Request includes: Content-Type: application/json

// Multiple headers
const qfetch = withHeaders({
  'Content-Type': 'application/json',
  'Accept': 'application/json',
  'X-Request-ID': 'abc123'
})(fetch);
await qfetch('https://api.example.com/users');

// Using Headers instance
const defaultHeaders = new Headers();
defaultHeaders.set('Content-Type', 'application/json');
defaultHeaders.set('Accept', 'application/json');

const qfetch = withHeaders(defaultHeaders)(fetch);
```

### Request Headers Take Precedence

```typescript
const qfetch = withHeader('Content-Type', 'application/json')(fetch);

// Request header overrides middleware header
await qfetch('https://api.example.com/users', {
  headers: { 'Content-Type': 'text/plain' }
});
// Request uses: Content-Type: text/plain (request value wins)
```

### Composition with Other Middlewares

```typescript
import { withHeaders, withHeader } from '@qfetch/middleware-headers';
import { withBaseUrl } from '@qfetch/middleware-base-url';
import { compose } from '@qfetch/core';

const qfetch = compose(
  withHeaders({
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }),
  withBaseUrl('https://api.example.com/v1/')
)(fetch);

await qfetch('users');
// → https://api.example.com/v1/users with headers

// Composing multiple single headers
const qfetch = compose(
  withHeader('Content-Type', 'application/json'),
  withHeader('Accept', 'application/json')
)(fetch);
```

## Notes

- Request headers always take precedence over middleware headers
- Header names are case-insensitive (`Content-Type` and `content-type` are the same)
- Empty headers object `{}` passes requests through unchanged (fast path)
- Works with string URLs, URL objects, and Request objects

## Standards References

- [RFC 9110 - HTTP Semantics: Header Fields](https://www.rfc-editor.org/rfc/rfc9110.html#name-header-fields) - HTTP header field specification
- [MDN: Headers](https://developer.mozilla.org/en-US/docs/Web/API/Headers) - Browser implementation documentation
- [Fetch Standard](https://fetch.spec.whatwg.org/) - Defines Request and fetch API semantics
