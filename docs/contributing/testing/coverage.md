# Coverage Guide

## Test Paradigm

| Test Type               | Config                              | Purpose                              | Run When                          |
| ----------------------- | ----------------------------------- | ------------------------------------ | --------------------------------- |
| Unit                    | `vitest.unit.config.ts`             | Service interface with mocks         | Every commit (CI + `pre-push`)    |
| Integration             | `vitest.integration.node.config.ts` | Browser automation with local Chrome | `pnpm run verify:release`, manual |
| Integration (providers) | `vitest.providers.config.ts`        | Provider + real external API         | Manual, opt-in (costs money)      |

## Why Provider Coverage is Low

Provider unit tests use `<Provider>.layerTest` mock layers (constants like `SteelProviderLayerTest` in `tests/utils/mocks.ts`). The real implementation (`make()` function that calls external APIs) is only tested in integration tests with real APIs.

This is correct architecture:

- Unit tests: test service interface/contract with mocks
- Integration tests: test real implementation with real APIs

## When to Add Tests

**Add unit tests when:**

- New service methods added
- Error handling paths need coverage
- Service contract changes

**Add integration tests when:**

- Browser automation features added (CDP, Playwright, Stagehand)
- Need to test actual browser behavior

**Add provider integration tests when:**

- Provider implementation changes
- New provider added

## Running Coverage

```bash
# Unit coverage (default)
pnpm test:unit --coverage

# Integration coverage (requires Chrome)
pnpm test:integration --coverage

# Provider integration (requires API keys, costs money)
pnpm test:providers --coverage
```

## Notes

- Coverage numbers are informational, not enforced
- Focus on meaningful tests, not coverage percentage
- Low provider coverage is expected and correct
