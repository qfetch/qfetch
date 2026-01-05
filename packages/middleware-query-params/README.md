# @qfetch/middleware-query-params

Fetch middleware for adding query parameters to outgoing request URLs.

## Overview

Appends query parameters to request URLs using the standard `URLSearchParams` API. Parameters are properly encoded and merged with any existing query string in the URL.

**Input handling:**
- **String inputs** → Returns modified string (preserves relative/absolute format)
- **URL objects** → Returns new URL object with appended parameters
- **Request objects** → Returns new Request with modified URL (preserves method, headers, body)

**Array value formats:**
- **Repeated keys** (default): `{ tags: ["a", "b"] }` → `?tags=a&tags=b`
- **Bracket notation**: `{ tags: ["a", "b"] }` → `?tags[]=a&tags[]=b`

This middleware strictly follows the [URL Standard](https://url.spec.whatwg.org/) for encoding via `URLSearchParams`.

Intended for use with the composable middleware system provided by [`@qfetch/core`](https://github.com/qfetch/qfetch/tree/main/packages/core#readme).

## Installation

```bash
npm install @qfetch/middleware-query-params
```

## API

### `withQueryParam(name, value)`

Creates a middleware that adds a single query parameter to outgoing requests.

#### Parameters

- `name` (`string`) **(required)** - The query parameter name
- `value` (`string`) **(required)** - The query parameter value (encoded via URLSearchParams)

### `withQueryParams(params, options?)`

Creates a middleware that adds multiple query parameters to outgoing requests.

#### Parameters

- `params` (`QueryParamEntries`) **(required)** - Object with parameter name-value pairs
  - Values can be strings or arrays of strings
  - Empty arrays are skipped entirely
  - Empty objects pass requests through unchanged
- `options` (`QueryParamsOptions`, optional) - Configuration options
  - `arrayFormat?: 'repeat' | 'brackets'` - How to serialize array values (default: `'repeat'`)

### Types

```typescript
type QueryParamValue = string | string[];
type QueryParamEntries = Record<string, QueryParamValue>;
type QueryParamsOptions = {
  arrayFormat?: 'repeat' | 'brackets';
};
```

#### Behavior

- **URL encoding** - Values are encoded using the standard `URLSearchParams` API, which follows the `application/x-www-form-urlencoded` format
- **Merge behavior** - Parameters are appended to any existing query string; duplicate keys are allowed (both values are kept)
- **Type preservation** - Input types are preserved (string→string, URL→URL, Request→Request)
- **Relative URLs** - Handled correctly; `/api/users` stays relative after adding params

## Usage

```typescript
import { withQueryParam, withQueryParams } from '@qfetch/middleware-query-params';

// Single parameter
const qfetch = withQueryParam('api_key', 'secret123')(fetch);
await qfetch('https://api.example.com/users');
// → https://api.example.com/users?api_key=secret123

// Multiple parameters
const qfetch = withQueryParams({
  page: '1',
  limit: '10',
  sort: 'name'
})(fetch);
await qfetch('https://api.example.com/users');
// → https://api.example.com/users?page=1&limit=10&sort=name

// Array values (repeated keys - default)
const qfetch = withQueryParams({
  tags: ['typescript', 'javascript']
})(fetch);
await qfetch('https://api.example.com/posts');
// → https://api.example.com/posts?tags=typescript&tags=javascript

// Array values (bracket notation)
const qfetch = withQueryParams(
  { tags: ['typescript', 'javascript'] },
  { arrayFormat: 'brackets' }
)(fetch);
await qfetch('https://api.example.com/posts');
// → https://api.example.com/posts?tags[]=typescript&tags[]=javascript
```

### Composition with Other Middlewares

```typescript
import { withQueryParams } from '@qfetch/middleware-query-params';
import { withBaseUrl } from '@qfetch/middleware-base-url';
import { compose } from '@qfetch/core';

const qfetch = compose(
  withQueryParams({ api_key: 'secret123' }),
  withBaseUrl('https://api.example.com/v1/')
)(fetch);

await qfetch('users');
// → https://api.example.com/v1/users?api_key=secret123
```

## Notes

- Parameters are always **appended** to existing query strings, never replaced
- Duplicate parameter names are allowed (standard `URLSearchParams.append()` behavior)
- Empty params object `{}` passes requests through unchanged (fast path)
- Empty arrays `[]` are skipped entirely
- Special characters in values are automatically encoded

## Standards References

- [WHATWG URL Standard](https://url.spec.whatwg.org/) - Defines URL and URLSearchParams behavior
- [MDN: URLSearchParams](https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams) - Browser implementation documentation
- [Fetch Standard](https://fetch.spec.whatwg.org/) - Defines Request and fetch API semantics
