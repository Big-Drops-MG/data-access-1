# Agent instructions

## Before starting any task

1. Check the remote is up to date: `git fetch origin`.
2. Confirm which base branch the task uses (normally `dev` for feature/fix/chore work; `main` only for hotfixes).
3. Update local base if needed: `git checkout <base>` then `git pull origin <base>` (merge/pull only — do not rebase shared branches).
4. Create or switch to the task branch from that up-to-date base: `<type>/T-###-short-kebab-name`.
5. Only then start implementing the task.

Do not begin coding on a stale local branch.

## Tooling notes

- Shared ESLint, Prettier, TypeScript, and commitlint live in `packages/config` (`@workspace/config`).
- Husky `pre-commit` runs lint-staged (ESLint, Prettier, and Vitest related tests on changed files). A lint error blocks the commit.
- Commit messages must match: `<type>(T-###): <summary>`.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
