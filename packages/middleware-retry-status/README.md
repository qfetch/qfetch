# @qfetch/middleware-retry-status

## Overview

[TODO: Add a clear, concise description of what this middleware does and its primary purpose.
Include references to relevant web standards (RFC, MDN, etc.) if applicable.]

Intended for use with the composable middleware system provided by [`@qfetch/core`](https://github.com/qfetch/qfetch/tree/main/packages/core#readme).

## Installation

```bash
npm install @qfetch/middleware-retry-status
```

## Usage

### Basic Usage

```typescript
import { withRetryStatus } from '@qfetch/middleware-retry-status';

// Basic usage with default configuration
const qfetch = withRetryStatus()(fetch);

const response = await qfetch('https://api.example.com/data');
```

### With Configuration

```typescript
import { withRetryStatus } from '@qfetch/middleware-retry-status';

// [TODO: Add realistic configuration example]
const qfetch = withRetryStatus({
  // TODO: Add option examples
})(fetch);

const response = await qfetch('https://api.example.com/data');
```

### Composition with Other Middlewares

```typescript
import { withRetryStatus } from '@qfetch/middleware-retry-status';
import { compose } from '@qfetch/core';

const qfetch = compose(
  withRetryStatus(),
  // other middlewares...
)(fetch);

const response = await qfetch('https://api.example.com/data');
```

## API

### `withRetryStatus(options?)`

[TODO: Brief description of the middleware function]

#### Parameters

- `options` (`RetryStatusOptions`, optional): Configuration options
  - [TODO: Document each option with type, description, and default value]

#### Returns

A middleware function compatible with `@qfetch/core`.

### `RetryStatusOptions`

[TODO: Document the options type structure]

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| [TODO] | [TODO] | [TODO] | [TODO: Description] |

## Behavior

[TODO: Document key behaviors, edge cases, and how the middleware handles various scenarios]

### Key Features

- [TODO: Feature 1]
- [TODO: Feature 2]
- [TODO: Feature 3]

### Edge Cases

- [TODO: Document how edge cases are handled]
- [TODO: Document any special error conditions]

## Examples

### Example 1: [TODO: Scenario Name]

```typescript
// [TODO: Add realistic example showing a specific use case]
```

### Example 2: [TODO: Scenario Name]

```typescript
// [TODO: Add another example demonstrating different configuration or usage]
```

## Limitations

[TODO: Document known limitations, browser compatibility issues, or constraints]

- [TODO: Limitation 1]
- [TODO: Limitation 2]

## Standards References

[TODO: If applicable, add links to relevant standards]

- [Example: RFC XXXX - Standard Name](https://example.com)
- [Example: MDN - API Name](https://developer.mozilla.org)
