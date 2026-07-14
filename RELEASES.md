# Releases

For maintainers only.

## Version Policy

This library follows [Semantic Versioning](https://semver.org/):

- **`0.x.x`** — Initial development. API may change between releases. Breaking changes increment minor version.
- **`1.x.x`** — Stable API. Breaking changes = major, features = minor, fixes = patch.

Once the API stabilizes, we'll release `1.0.0` and commit to strict semver.

## Process

Releases are automated via [release-please](https://github.com/googleapis/release-please):

1. Merge PRs with conventional commit messages — release-please automatically opens a release PR with the generated changelog
2. Review the changelog and merge the release PR — this creates a git tag and GitHub release

No manual version bumping or `CHANGELOG.md` editing needed.

## Version Bumps During `0.x`

| Commit Type | Version Bump |
| ----------- | ------------ |
| `feat:` | `0.minor.0` |
| `fix:` | `0.0.patch` |
| `feat!:` or `BREAKING CHANGE` | `0.minor.0` (breaking allowed in 0.x) |
