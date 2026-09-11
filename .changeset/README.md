# Releases

Run `pnpm changeset` for changes to `@tanstack/redact`, then commit the generated file with your pull request. Use `pnpm changeset status` to inspect the pending release plan. No changeset is needed for documentation or workflow-only changes that do not affect the published package.

After merge into `main`, the [Release workflow](../.github/workflows/release.yml) opens or updates `ci: Version Packages`. Review its versions and changelog, wait for its checks to pass, then merge it to publish to npm with the `latest` tag and create a GitHub release. The workflow runs tests, type checks, the build, and size checks before versioning or publishing. Releases are serialized and an in-progress publication is not cancelled by a later push.

GitHub can require a maintainer to approve checks on a bot-created version PR. Use the PR's **Approve workflows to run** control when requested, then wait for the checks. This is GitHub's [normal behavior for PRs created with `GITHUB_TOKEN`](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow#triggering-a-workflow-from-a-workflow), not a reason to bypass checks.

Publishing uses npm trusted publishing for `TanStack/redact`, workflow `release.yml`, with no GitHub environment.

The default workflow publishes only from `main` to `latest`; `next` is not its release channel. Do not edit package versions by hand or publish from a laptop. Base release work on the current `main` so an outdated local version does not collide with an already-published version.
