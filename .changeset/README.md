# Releases

Run `pnpm changeset` for changes to `@tanstack/redact`, then commit the generated file with your pull request.

After merge, the Release workflow opens or updates `ci: Version Packages`. Merge that pull request to publish to npm with the `latest` tag and create a GitHub release. The workflow runs tests, type checks, the build, and size checks before versioning or publishing.

Publishing uses npm trusted publishing for `TanStack/redact`, workflow `release.yml`, with no GitHub environment.
