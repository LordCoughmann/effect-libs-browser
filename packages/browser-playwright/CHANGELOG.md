# Changelog

## [0.1.1](https://github.com/LordCoughmann/effect-libs-browser/compare/@effect-libs/browser-playwright@v0.1.1...@effect-libs/browser-playwright@v0.1.1) (2026-07-24)


### ⚠ BREAKING CHANGES

* **errors:** `XxxError.module` is renamed to `XxxError.source`. Update `new XxxError({ module: ... })` → `new XxxError({ source: ... })` and `err.module` → `err.source`.

### Features

* **errors:** rename .module → .source on error classes ([6fb047c](https://github.com/LordCoughmann/effect-libs-browser/commit/6fb047c8e5f9053ffd2d3e6eabee96894525d6d4))
* first public release ([ab7d7cf](https://github.com/LordCoughmann/effect-libs-browser/commit/ab7d7cf546f3998f9a2946a7a05335510c552567))
