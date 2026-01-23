# @qfetch/middleware-headers

Fetch middleware for adding default headers to outgoing requests.

## Overview

Sets default headers on outgoing requests using the standard `Headers` API. Request headers take precedence over middleware headers. Supports both plain objects and `Headers` instances. Header names are case-insensitive per HTTP specification.

Intended for use with [`@qfetch/core`](https://github.com/qfetch/qfetch/tree/main/packages/core#readme).

## Installation

```bash
npm install @qfetch/middleware-headers
```

## Quick Start

```typescript
import { withHeaders } from '@qfetch/middleware-headers';
import { withBaseUrl } from '@qfetch/middleware-base-url';
import { withAuthorization } from '@qfetch/middleware-authorization';
import { compose } from '@qfetch/core';

// Build an API client with default headers for JSON communication
const api = compose(
  withHeaders({
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-Client-Version': '1.0.0',
  }),
  withBaseUrl('https://api.example.com/v1/'),
)(fetch);

// All requests include the default headers
await api('users', {
  method: 'POST',
  body: JSON.stringify({ name: 'Alice' }),
});
```

## Documentation

For complete API reference, examples, and type definitions, see the [API documentation](https://qfetch.github.io/qfetch/modules/_qfetch_middleware_headers.html).

## Standards References

- [RFC 9110 - HTTP Semantics: Header Fields](https://www.rfc-editor.org/rfc/rfc9110.html#name-header-fields) - HTTP header field specification
- [MDN: Headers](https://developer.mozilla.org/en-US/docs/Web/API/Headers) - Browser implementation documentation
