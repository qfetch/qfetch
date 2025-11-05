# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

qfetch is a TypeScript framework for building composable fetch middlewares using the standard Fetch API and well-known standards from MDN. The project follows composable architecture principles with Single Responsibility Principle (SRP) design, where each middleware has configurable behavior and can be combined with others. It's a monorepo managed with pnpm workspaces, Turbo, and release-please.

## Common Development Commands

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
- Include Gherkin feature files that describe behavior using clear, descriptive language
- Leverage full Gherkin syntax (Background, Scenario Outline, Rule, etc.) for comprehensive specification

## Code Standards

### Import Organization (Biome)
Imports are automatically organized into groups:
1. Built-ins (URL, Node, Bun)
2. External packages
3. Aliases
4. Relative paths

### Test Configuration
Tests use Node.js native test runner with native TypeScript.

### Gherkin Specifications
Each middleware can include `.feature` files that:
1. Follow standard Gherkin syntax:
  - Use clear, descriptive language (avoid user-story style)
  - Use Feature, Scenario, Given, When, Then, and optionally Background, And, and But
  - Maintain clear, concise, and human-readable language
  - Favor Rule to describe business rules within a Feature and grouped Scenarios
  - Favor Scenario Outlines with Examples for repetitives Scenarios
  - Favor tables for structured data and docstrings for long textual inputs
2. Reflect domain language (Ubiquitous Language):
  - Describe the feature(s) of the middleware
  - Use terminology specific to the web standards, domain and context
3. Stay business-focused:
  - Focus on what the system should do, not how it will be implemented

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
- Per-package CI workflows (`core.ci.yaml`, etc.) run style, type-check, build, and test
- Uses template workflow (`_template-package.ci.yaml`) for consistency across packages
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
1. **Release Configuration** (`release-please-config.json`):
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

2. **CD Workflow** (`.github/workflows/-packages-cd.yaml`):
   - Add package output mapping
   - Add release job following the `release-core` pattern

3. **CI Workflow** (`.github/workflows/middleware-<name>.ci.yaml`):
   - Create new workflow file using `core.ci.yaml` as template
   - Update paths and package name

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
