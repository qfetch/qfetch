# Changelog

## 0.1.0 (2026-01-24)


### ⚠ BREAKING CHANGES

* **middlewares:** Renamed core types for clarity
    - FetchFunction → FetchFn
    - FetchExecutor → MiddlewareExecutor
    - Removed Middleware<T> type (no longer needed)

### Features

* **middleware-query-params:** add initial implementation ([#46](https://github.com/qfetch/qfetch/issues/46)) ([653daec](https://github.com/qfetch/qfetch/commit/653daec80bec150e7cdbee618395bdfa134945b3))


### Bug Fixes

* **middleware-query-params:** update package keywords ([19bc69c](https://github.com/qfetch/qfetch/commit/19bc69cce89ce6341ef18a9cb4deb48df3b9171f))


### Code Refactoring

* **middlewares:** slim READMEs and refactor core types for TypeDoc ([#73](https://github.com/qfetch/qfetch/issues/73)) ([03d95cb](https://github.com/qfetch/qfetch/commit/03d95cb206ceb4c1fd649890a02781dd039efa5d))
