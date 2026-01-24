# Changelog

## 0.1.0 (2026-01-24)


### ⚠ BREAKING CHANGES

* **middlewares:** Renamed core types for clarity
    - FetchFunction → FetchFn
    - FetchExecutor → MiddlewareExecutor
    - Removed Middleware<T> type (no longer needed)

### Features

* **middleware-headers:** add initial implementation ([#56](https://github.com/qfetch/qfetch/issues/56)) ([7a4775b](https://github.com/qfetch/qfetch/commit/7a4775b9edccccf106a8199ef477f2abd959ab7d))


### Bug Fixes

* **middleware-headers:** update package description and keywords ([7f82ad5](https://github.com/qfetch/qfetch/commit/7f82ad5bf2075544017381e4c79d1f70f62ab6ae))


### Code Refactoring

* **middlewares:** slim READMEs and refactor core types for TypeDoc ([#73](https://github.com/qfetch/qfetch/issues/73)) ([03d95cb](https://github.com/qfetch/qfetch/commit/03d95cb206ceb4c1fd649890a02781dd039efa5d))
