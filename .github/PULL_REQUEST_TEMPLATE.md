## Description

Brief description of the changes.

## Related Issues

Fixes #... <!-- Link to issue(s) this PR resolves -->

## Type of Change

- [ ] 🐛 Bug fix (non-breaking change which fixes an issue)
- [ ] ✨ New feature (non-breaking change which adds functionality)
- [ ] 💥 Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] 📚 Documentation update
- [ ] 🔧 Refactor / code quality

## Affected Module(s)

- [ ] CDP
- [ ] Playwright
- [ ] Stagehand
- [ ] Providers (Steel, Browserbase, Cloudflare Browser Run)

## Breaking Changes

If this is a breaking change, describe:

1. What breaks
2. Migration path for existing users
3. Whether migration can be automated

```typescript
// Before (old API)
// ...

// After (new API)
// ...
```

## How Has This Been Tested?

Describe testing performed:

- [ ] Unit tests added/updated
- [ ] Integration tests (manual run)
- [ ] Workerd tests (manual run)
- [ ] Tested in Cloudflare Workers deployment
- [ ] Manual testing steps: ...

**Test commands run:**

```bash
pnpm test:unit
pnpm test:integration  # if applicable
pnpm test:integration:workerd  # if applicable
```

## Checklist

Before submitting, ensure:

- [ ] I have run `pnpm ci` (check + build + unit + smoke)
- [ ] I have read [CONTRIBUTING.md](../CONTRIBUTING.md)
- [ ] I have updated documentation if needed
- [ ] I have added tests that prove my fix/feature works
- [ ] My changes generate no new warnings
- [ ] New and existing tests pass locally

## Screenshots

If applicable, add screenshots or output examples.
