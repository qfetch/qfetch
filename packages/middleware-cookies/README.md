# @qfetch/middleware-cookies

Fetch middleware for setting cookies on outgoing requests.

## Overview

Sets cookies on the `Cookie` header of outgoing fetch requests. Supports both single cookie (`withCookie`) and multiple cookies (`withCookies`) with automatic merging of existing cookies.

**Server-side only:** In browsers, the `Cookie` header is a [forbidden header name](https://developer.mozilla.org/en-US/docs/Glossary/Forbidden_header_name) and cannot be set manually. This middleware is intended for server-side environments (Node.js, Deno, Bun, edge runtimes) where cookies need to be forwarded or set programmatically.

Intended for use with the composable middleware system provided by [`@qfetch/core`](https://github.com/qfetch/qfetch/tree/main/packages/core#readme).

## Installation

```bash
npm install @qfetch/middleware-cookies
```

## API

### `withCookie(name, value)`

Creates a middleware that sets a single cookie on outgoing requests.

#### Parameters

- `name` (`string`) **(required)** - The cookie name
- `value` (`string`) **(required)** - The cookie value (sent as-is, encode if needed)

### `withCookies(cookies)`

Creates a middleware that sets multiple cookies on outgoing requests.

#### Parameters

- `cookies` (`Record<string, string>`) **(required)** - Object with cookie name-value pairs

### Behavior

**Merge behavior:**
- If no `Cookie` header exists → sets the new cookie(s)
- If `Cookie` header exists → appends new cookies with `; ` separator

**Validation:**
- `withCookies` throws `TypeError` if passed an empty cookies object

**Input handling:**
- **String/URL inputs:** Cookies are added via `init.headers`
- **Request objects:** A new Request is created with merged headers

## Usage

### Single Cookie

```typescript
import { withCookie } from '@qfetch/middleware-cookies';

const qfetch = withCookie('session', 'abc123')(fetch);

await qfetch('https://api.example.com/data');
// → Cookie: session=abc123
```

### Multiple Cookies

```typescript
import { withCookies } from '@qfetch/middleware-cookies';

const qfetch = withCookies({
  session: 'abc123',
  theme: 'dark',
  lang: 'en-US'
})(fetch);

await qfetch('https://api.example.com/data');
// → Cookie: session=abc123; theme=dark; lang=en-US
```

### Composition with Other Middlewares

```typescript
import { withCookie, withCookies } from '@qfetch/middleware-cookies';
import { withBaseUrl } from '@qfetch/middleware-base-url';
import { compose } from '@qfetch/core';

// Using compose with multiple cookies
const qfetch = compose(
  withCookies({ session: 'abc123', theme: 'dark' }),
  withBaseUrl('https://api.example.com/v1/')
)(fetch);

await qfetch('users');
// → https://api.example.com/v1/users with Cookie: session=abc123; theme=dark
```

### Forwarding Cookies from Incoming Requests

```typescript
import { withCookies } from '@qfetch/middleware-cookies';

// In a server handler, forward cookies to an internal API
function handleRequest(req: Request) {
  const cookieHeader = req.headers.get('Cookie');
  const cookies = parseCookies(cookieHeader); // your parsing function

  const qfetch = withCookies(cookies)(fetch);
  return qfetch('https://api.internal.com/data');
}
```

### Merging with Existing Cookies

```typescript
import { withCookie } from '@qfetch/middleware-cookies';

const qfetch = withCookie('session', 'abc123')(fetch);

// Existing cookies are preserved
await qfetch('https://api.example.com/data', {
  headers: { Cookie: 'existing=value' }
});
// → Cookie: existing=value; session=abc123
```

## Notes

- **Server-side only** - Browser fetch ignores manually set `Cookie` headers
- Cookie values are sent as-is - encode special characters before passing to middleware
- Works with all input types: string URLs, `URL` objects, and `Request` objects
- For `Request` objects, creates a new Request with merged headers (immutable pattern)

## Standards References

- [MDN: Cookie header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cookie) - HTTP Cookie header documentation
- [MDN: Forbidden header name](https://developer.mozilla.org/en-US/docs/Glossary/Forbidden_header_name) - Browser restrictions on Cookie header
- [Fetch Standard](https://fetch.spec.whatwg.org/) - Defines Request and fetch API semantics
