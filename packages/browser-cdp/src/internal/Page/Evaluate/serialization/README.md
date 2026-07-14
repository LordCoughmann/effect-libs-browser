# CDP Serialization

This directory contains serialization code from [Playwright](https://github.com/microsoft/playwright) for handling JavaScript values through the browser evaluate boundary.

## License

The following files are derived from [Playwright](https://github.com/microsoft/playwright) and retain their original Apache 2.0 license with Microsoft copyright:

- `utilityScriptSerializers.ts` - Core serialization/deserialization logic

See [LICENSE-PLAYWRIGHT](./LICENSE-PLAYWRIGHT) for the full license text.

## Why copy instead of depending on playwright-core?

| Approach                | Size     | Dependencies          |
| ----------------------- | -------- | --------------------- |
| Copy serialization code | ~24 KB   | None                  |
| playwright-core package | ~12.5 MB | Bundled (includes ws) |

For CDP-only use cases (web scraping, browser automation without Playwright's higher-level APIs), copying the serialization code keeps the bundle tiny while benefiting from Playwright's battle-tested implementation.

## What this handles

JSON.stringify loses important type information. This serialization preserves:

- **Special values**: `undefined`, `null`, `NaN`, `Infinity`, `-Infinity`, `-0`
- **Special objects**: `Date`, `URL`, `RegExp`, `Error` (with stack trace)
- **Collections**: `Map`, `Set`, arrays, plain objects
- **Binary data**: `TypedArray` (Int8Array, Float64Array, etc.), `ArrayBuffer`
- **BigInt**: Serialized as string
- **Circular references**: Handled via ref/id system
- **Cross-realm**: Works across iframes (uses `Object.prototype.toString.call`)

## Files

| File                          | Source                                            | Description                            |
| ----------------------------- | ------------------------------------------------- | -------------------------------------- |
| `utilityScriptSerializers.ts` | `packages/isomorphic/utilityScriptSerializers.ts` | Core serialization types and functions |
| `index.ts`                    | Our code                                          | Adapter layer matching old API         |
