# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

qfetch is a TypeScript framework for building composable fetch middlewares using the standard Fetch API and well-known standards from MDN. The project follows composable architecture principles with Single Responsibility Principle (SRP) design, where each middleware has configurable behavior and can be combined with others. It's a monorepo managed with pnpm workspaces, Turbo, and release-please.

## Development Environment

### Runtime

NodeJS 22+
TypeScript 5.9+

### Using Nix (Recommended)
A local development shell with all required dependencies is available using Nix:

```bash
# Enter development shell with Node.js 22+ and all dependencies
nix develop
```

This provides an isolated environment with all necessary tools.

### Common Development Commands

```bash
# Generate a new middleware from template
pnpm generate

# Watch mode for development
pnpm dev

# Build all packages
pnpm build

# Type checking
pnpm check-types

# Run tests
pnpm test

# Run E2E tests only
pnpm test:e2e

# Run unit tests only
pnpm test:unit

# Lint and format code
pnpm style
pnpm repo:style
```

## Architecture

### Core Framework (`packages/core/`)
The core package provides the fundamental middleware composition system:
- `FetchExecutor`: Function that wraps a fetch function with middleware logic
- `Middleware<T>`: Factory that creates executors, with optional/required type-safe options
- `compose()`: Right-to-left middleware composition (last middleware processes request first)
- `pipeline()`: Left-to-right middleware composition (first middleware processes request first)

### Package Structure
Each package follows a consistent structure:
- Built with `tsdown` to multiple formats (CommonJS, ESM, IIFE) with ES2020 target
- Uses Node.js native test runner (`node --test`)
- Type checking with `tsc --noEmit`
- Linting with Biome

### Middleware Generation
Use `pnpm generate` to create new middleware packages from templates in `turbo/templates/middleware/`. Each middleware:
- Follows naming convention: `packages/middleware-<name>/`
- Exports from `src/index.ts`
- Has a `with{MiddlewareName}` function following the `Middleware<T>` type
- Includes comprehensive tests and JSR publishing configuration

### Middleware Design Principles
Each middleware should:
- Follow Single Responsibility Principle (SRP) - focus on one specific concern
- Use standard Fetch API and MDN-documented web standards
- Be composable with other middlewares without side effects
- Provide configurable behavior through type-safe options

## Code Standards

### Import Organization (Biome)
Imports are automatically organized into groups:
1. Built-ins (URL, Node, Bun)
2. External packages
3. Aliases
4. Relative paths

### Test Configuration
Tests use Node.js test runner with native TypeScript transpilation.

**BDD Approach**: Tests follow Behavior-Driven Development principles, focusing on observable behavior rather than implementation details. Test descriptions should express what the system does from a user/consumer perspective, avoiding references to internal implementation details like function names, variable names, or internal state management.

#### Test File Types
- **Unit tests** (`*.test.ts`):
  * Test individual middleware behavior in isolation
  * Use mocked fetch/responses
  * Focus on logic correctness, edge cases, status code handling
- **Integration tests** (`*.integration-test.ts`):
  * Test middleware with real HTTP servers and network calls
  * Focus on actual retry behavior and interaction between fetch and server
  * Cover typical workflows rather than every edge case

#### Test Conventions
1. **Context usage**: Always pass `TestContext` as parameter and use `ctx.assert` for assertions
2. **Test planning**: Use `ctx.plan(N)` to declare expected assertion count
3. **AAA pattern**: Clearly separate Arrange, Act, Assert sections with comments
4. **Descriptive names**:
   - `describe()` blocks describe observable behaviors and scenarios
   - `it()` descriptions start with "should" and describe expected behavior
   - Avoid implementation details in test names and descriptions
5. **Mocking with context**: Use `ctx.mock.fn()` for function mocks
6. **Timer mocking**: Use `ctx.mock.timers.enable()` for time-dependent tests
7. **Nested tests**: Use `ctx.test()` for sub-test cases within a test
8. **Async helpers**: Use helper functions like `flushMicrotasks()` for async control
9. **Integration setup**: Use `ctx.after()` for cleanup and `ctx.signal` for abort handling
10. **Coverage exclusion**: Add `/* node:coverage disable */` after imports for test files

## Build System

- **Turbo**: Orchestrates builds with dependency resolution
- **tsdown**: Handles TypeScript compilation and bundling
- **Biome**: Handles linting, formatting, and import organization
- **pnpm**: Workspace and dependency management
- **release-please**: Automated versioning and publishing

## Automation & Release Process

### Automated CI/CD Pipeline
The project uses a comprehensive automation setup:

**CI (Continuous Integration):**
- Triggered on PRs targeting `main` branch
- Centralized CI workflow (`packages.ci.yaml`) detects changed packages and runs CI for each
- Uses template workflow (`_template.package-ci.yaml`) for consistency across packages
- Turbo cache optimization for faster builds

**CD (Continuous Deployment):**
- Fully automated via `release-please` on merge to `main`
- Creates release PRs with conventional commit-based changelog
- Publishes to both NPM and JSR registries automatically
- Uploads build artifacts to GitHub releases

### Adding New Middleware Packages

**Automated Generation:**
```bash
pnpm generate  # Creates middleware from turbo templates
```

**Manual Configuration Required:**
1. **JSR Package Scope** (One-time setup by @qfetch org owner):
   - **IMPORTANT**: Before publishing, an owner of the `@qfetch` organization on JSR must create the package scope
   - Navigate to JSR and create the package: `@qfetch/middleware-<name>`
   - This step is required or the automated publishing will fail

2. **Release Configuration** (`release-please-config.json`):
   ```json
   "packages/middleware-<name>": {
     "extra-files": [
       {
         "type": "json",
         "path": "packages/middleware-<name>/jsr.json",
         "jsonpath": "$.version"
       }
     ]
   }
   ```

3. **CI Workflow** (`.github/workflows/packages.ci.yaml`):
   - Add package to the `detect-changes` job filters
   - Add job for the package following the `core` pattern

4. **CD Workflow** (`.github/workflows/packages.cd.yaml`):
   - Add package output mapping to `release-please` outputs
   - Add release job following the `core` pattern

### Commit Requirements
- **Squash-merge only** - all commits must be squashed when merging PRs
- **Conventional Commits** - required for release-please automation:
  - `feat:` - new features (minor version bump)
  - `fix:` - bug fixes (patch version bump)
  - `feat!:` or `fix!:` - breaking changes (major version bump)
  - `chore:`, `docs:`, `ci:`, `refactor:` - no version bump

### Template System
Templates in `turbo/templates/middleware/` generate (via `pnpm generate`):
- Package structure with proper naming conventions
- JSR and NPM publishing configuration
- Consistent build setup (tsdown, biome, node test runner)
- TypeScript configuration aligned with monorepo standards
