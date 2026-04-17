# Agent Companies Plugin

[![CI](https://img.shields.io/github/actions/workflow/status/alvarosanchez/paperclip-agent-companies-plugin/ci.yml?branch=main&label=ci)](https://github.com/alvarosanchez/paperclip-agent-companies-plugin/actions/workflows/ci.yml)
[![Node >=20](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![pnpm 10](https://img.shields.io/badge/pnpm-10-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Discover Agent Company packages in git repositories, inspect their contents inside Paperclip, import them into new Paperclip companies, and keep imported companies in sync over time.

## What You Get

- Repository discovery from GitHub shorthand (`owner/repo`), full git URLs, or local checkouts
- Automatic detection of `COMPANY.md` manifests with `schema: agentcompanies/v1`
- A hosted Paperclip settings page with separate discovered-source and imported-company sections
- Inline company import into a new Paperclip company, including repeated imports from the same discovered source
- Manual sync plus daily background auto-sync for tracked imported companies
- Recurring `TASK.md` support: `recurring: true` tasks import as Paperclip routines, with `.paperclip.yaml` routine metadata preserved
- Company-scoped Board access connection for authenticated Paperclip deployments
- Optional `metadata.paperclip.agentIcon` support for agent icon hints
- A preloaded default catalog source: `https://github.com/paperclipai/companies`

## Requirements

- Node.js 20 or newer
- A Paperclip instance with plugin support
- `git` available in the plugin worker environment for remote repositories
- Access to any private repositories you want to scan

## Install

Install the published package into Paperclip:

```bash
paperclipai plugin install paperclip-agent-companies-plugin
```

Pin a specific npm version if needed:

```bash
paperclipai plugin install paperclip-agent-companies-plugin --version <version>
```

Install from a local checkout during development:

```bash
paperclipai plugin install --local .
```

## Quick Start

1. Open **Installed Plugins** in Paperclip.
2. Open **Agent Companies Plugin**.
3. Add a repository source with `owner/repo`, a full repository URL, or a local checkout path.
4. Review discovered companies and open **View contents** to inspect agents, projects, tasks, recurring tasks/routines, issues, and skills.
5. Click **Import as new company** to create a new Paperclip company from a discovered package. You can repeat this for the same discovered source when you need multiple Paperclip companies from one spec.
6. If your Paperclip deployment requires authentication, open this plugin inside the imported company once and complete **Board access connection** in settings.
7. Use the separate **Imported Companies** section for **Sync now** and **Daily auto-sync** controls.

## Package Expectations

A repository becomes discoverable when it contains a `COMPANY.md` manifest whose frontmatter includes:

```yaml
schema: agentcompanies/v1
name: Example Company
slug: example-company
version: 1.0.0
```

The plugin inventories structured content from these conventional locations when present:

- `agents/`
- `projects/`
- `tasks/`
- `issues/`
- `skills/`

Recurring task packages are detected from `TASK.md` frontmatter with `recurring: true`. When a company also includes a Paperclip extension sidecar such as `.paperclip.yaml`, the catalog surfaces linked routine status and trigger counts for those recurring tasks.

During import, the plugin packages the company directory as an inline Paperclip source with these guardrails:

- Maximum 250 files per imported company
- Maximum 1 MiB per file
- Maximum 8 MiB total encoded payload

## Sync Behavior

- The plugin records the imported source version from `COMPANY.md` per tracked imported company.
- Imported companies default to daily auto-sync.
- Manual sync is available whenever the source version changes or cannot be compared safely.
- Sync uses overwrite mode by default so the imported Paperclip company stays aligned with the source package.
- Recurring tasks are imported through Paperclip's company portability flow as routines rather than one-time starter issues, while keeping any `.paperclip.yaml` routine sidecar metadata in the portable package.
- The hosted settings page records the active Paperclip origin for worker-side imports and syncs, so background sync keeps targeting the same host even when the worker runs with a sanitized environment.
- Authenticated Paperclip deployments require a saved Board access connection in the imported company before worker-side sync can call the Paperclip import API.

## Security And Privacy

- Remote repositories are cloned with `git` into temporary checkouts.
- For private repositories, the worker reuses your existing local git credential helpers when available.
- Local checkout paths are read from the Paperclip host machine, so only trusted operators should add local paths.
- Board access connections are stored as company secrets and the plugin keeps only the secret reference plus display metadata in plugin state.
- Inline imports intentionally skip common secret-bearing files such as `.env*`, `.npmrc`, `.git-credentials`, `.netrc`, and files inside `.ssh/`, `.aws/`, or `.gnupg/`.
- The plugin stores catalog and sync metadata in Paperclip plugin state.

The manifest currently requests these Paperclip capabilities:

- `instance.settings.register`
- `plugin.state.read`
- `plugin.state.write`
- `jobs.schedule`
- `http.outbound`
- `ui.page.register`

## Development

From the repository root:

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

Additional verification commands:

- `pnpm test:e2e` for the hosted Paperclip smoke flow
- `pnpm verify:manual` for an interactive local verification run

## Release Versioning

GitHub release tags are the source of truth for published package versions. The release workflow strips a leading `v`, stamps `package.json` before verification and publish, and then syncs that checked-in version back to the release target branch so repository metadata stays aligned with the published package.

## License

[MIT](./LICENSE)
