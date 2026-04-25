# Agent Companies Plugin

[![CI](https://img.shields.io/github/actions/workflow/status/alvarosanchez/paperclip-agent-companies-plugin/ci.yml?branch=main&label=ci)](https://github.com/alvarosanchez/paperclip-agent-companies-plugin/actions/workflows/ci.yml)
[![Node >=20](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![pnpm 10](https://img.shields.io/badge/pnpm-10-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Discover Agent Company packages in git repositories, inspect their contents inside Paperclip, import all or part of them into Paperclip companies, and keep tracked imports in sync over time.

## What You Get

- Repository discovery from GitHub shorthand (`owner/repo`), full git URLs, or local checkouts
- Automatic detection of `COMPANY.md` manifests with `schema: agentcompanies/v1`
- A hosted Paperclip settings page with separate discovered-source and imported-company sections
- Separate import actions for creating a new Paperclip company or importing into an existing non-synced company
- Per-part and per-item import selection for agents, projects, tasks, and skills, with everything selected by default
- Agent-company `TASK.md` files and Paperclip `ISSUE.md` manifests are grouped together under **Tasks** in the hosted UI
- Required project and agent dependencies are auto-included whenever selected tasks depend on them
- Saved sync contracts per tracked imported company, plus a re-import flow for updating the selection later
- Saved adapter presets that can be applied as import defaults or per-agent overrides
- Manual sync plus background auto-sync for tracked imported companies
- Recurring `TASK.md` support: `recurring: true` tasks import as Paperclip routines, with `.paperclip.yaml` routine metadata preserved
- Company-scoped Board access connection for authenticated Paperclip deployments
- Optional `metadata.paperclip.agentIcon` support for agent icon hints
- A preloaded default catalog source: `https://github.com/paperclipai/companies`

## Requirements

- Node.js 20 or newer
- A Paperclip instance with plugin support, version `2026.427.0` or newer
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
4. Review discovered companies and open **View contents** to inspect agents, projects, tasks, recurring tasks/routines, Paperclip issue manifests, and skills.
5. Click **Import as new company** to create a fresh Paperclip company, or open **Import into...** to pick one of the other non-synced Paperclip companies already in the instance.
6. Leave the default full selection in place or toggle down to just the parts and items you want. If a selected task depends on a project or agent, the plugin auto-includes those required dependencies.
7. Optionally configure **Adapter Presets** in settings, then select a default preset and per-agent overrides during import.
8. Importing into an existing non-synced company adopts that company for future syncs, including the company whose settings page you are currently viewing.
9. Use **Re-import / Edit selection** from the tracked company card whenever you want to deliberately change the saved sync contract.
10. If your Paperclip deployment requires authentication, open this plugin inside the imported company once and complete **Board access connection** in settings.
11. Use the separate **Imported Companies** section for **Sync now**, per-company **Auto-sync** toggles, and the shared cadence control.

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
- `issues/` (grouped under **Tasks** in the hosted UI because these are Paperclip-provider issue manifests)
- `skills/`

Recurring task packages are detected from `TASK.md` frontmatter with `recurring: true`. When a company also includes a Paperclip extension sidecar such as `.paperclip.yaml`, the catalog surfaces linked routine status and trigger counts for those recurring tasks.

During import, the plugin packages the selected company contents as an inline Paperclip source with these guardrails:

- Maximum 250 files per imported company
- Maximum 1 MiB per file
- Maximum 8 MiB total encoded payload

## Adapter Presets

Adapter presets are named Paperclip adapter configurations stored in plugin state. Each preset contains an adapter type and optional adapter config. During import or re-import, operators can keep package defaults, apply one default preset to all selected agents, or override individual agents.

Example:

```json
[
  {
    "id": "codex-local",
    "name": "Codex / local",
    "adapterType": "codex_local",
    "adapterConfig": {}
  },
  {
    "id": "hermes-default",
    "name": "Hermes / Default",
    "adapterType": "hermes_local",
    "adapterConfig": {
      "env": {
        "HERMES_HOME": "/home/workspace/Hermes"
      },
      "extraArgs": [
        "--profile",
        "Default"
      ],
      "hermesCommand": "/home/workspace/Hermes-install/venv/bin/hermes"
    }
  },
  {
    "id": "hermes-ops",
    "name": "Hermes / Ops",
    "adapterType": "hermes_local",
    "adapterConfig": {
      "env": {
        "HERMES_HOME": "/home/workspace/Hermes"
      },
      "extraArgs": [
        "--profile",
        "ops"
      ],
      "hermesCommand": "/home/workspace/Hermes-install/venv/bin/hermes"
    }
  }
]
```

The selected preset mapping is saved with the tracked import, so later re-imports and syncs keep using the same adapter overrides.

## Sync Behavior

- The plugin records the imported source version from `COMPANY.md` per tracked imported company.
- Tracked imported company cards show the version each company was imported from, and surface a newer source version when one is available.
- Imported companies default to auto-sync every 24 hours, and that cadence is configurable in hours from the hosted settings page.
- The background auto-sync check runs hourly, rescans tracked source repositories before syncing, and then syncs any tracked import whose cadence is due.
- Manual sync is available whenever the source version changes or cannot be compared safely.
- Each tracked import saves the selected subset of the source package as its long-term sync contract.
- When selected tasks depend on specific projects or assignees, the saved sync contract automatically includes those required projects and agents.
- Sync uses the saved selection contract plus the current collision strategy, with overwrite mode selected by default so the imported Paperclip company stays aligned with the source package.
- During sync, one-time `TASK.md` and `ISSUE.md` entries whose Paperclip issue title already exists in the imported company are omitted from the issue import pass so repeated syncs do not create duplicate issues.
- For recurring-task syncs, overwrite mode first updates a uniquely matching active routine in place, including supported trigger changes, so routine changes do not create a fresh archived copy on every sync. If the existing routine cannot be matched safely or the update fails, sync falls back to the import-and-archive cleanup path.
- Discovered source packages expose separate **Import as new company** and **Import into...** actions.
- **Import into...** lists only existing Paperclip companies that are not already tracked synced imports.
- Already tracked imported companies must use **Re-import / Edit selection** to change that contract; the tracked company card itself does not expose inline selection toggles.
- Importing into an existing non-synced company, including the current company when applicable, adopts that company as a tracked synced import after the import completes.
- Initial imports and later syncs queue explicit Paperclip wake requests for newly assigned imported issues so those agents can pick up the work even if scheduled heartbeats are disabled. The plugin tries an explicit on-demand wake first and falls back to an assignment-style wake when Paperclip skips the first request.
- On Paperclip `2026.427.0` and newer, post-import wake detection reads the imported company's current issues through Paperclip's plugin issue API and requests actionable assignment wakeups through `ctx.issues.requestWakeup` / `ctx.issues.requestWakeups`; backlog imports keep the legacy agent-wake fallback for compatibility.
- Hosted imports that include assigned tasks stage agent creation before task import so newly imported assignees can be approved in time for Paperclip to preserve the task assignment and wake the agent.
- Recurring tasks are imported through Paperclip's company portability flow as routines rather than one-time starter issues, while keeping any `.paperclip.yaml` routine sidecar metadata in the portable package.
- On Paperclip `2026.428.0` and newer, newly created/imported companies do not require new-agent approval unless that company explicitly enables the policy. The plugin still stages agent import before task import and auto-approves matching `pending_approval` agents for older hosts or opt-in approval policies.
- Paperclip `2026.428.0` added per-company attachment limits. The plugin preserves `.paperclip.yaml` `company.attachmentMaxBytes` metadata during new-company imports; tracked existing-company syncs deliberately leave host-owned company settings such as name, approval policy, and attachment cap under Paperclip/operator control.
- The hosted settings page records the active Paperclip origin for worker-side imports and syncs, so background sync keeps targeting the same host even when the worker runs with a sanitized environment.
- Authenticated Paperclip deployments require a saved Board access connection in the imported company before worker-side sync can call the Paperclip import API.

## Security And Privacy

- Remote repositories are cloned with `git` into temporary checkouts.
- For private repositories, the worker reuses your existing local git credential helpers when available.
- Local checkout paths are read from the Paperclip host machine, so only trusted operators should add local paths.
- Board access connections are stored as company secrets and the plugin keeps only the secret reference plus display metadata in plugin state.
- After board access is approved, the plugin also seeds the worker's local Paperclip auth store as a compatibility cache for that board-access connection so current authenticated hosts can reuse the token during worker-side syncs, and clears that cached credential again if board access is removed.
- After upgrading to a build with auth-store seeding, previously connected authenticated instances may need one board-access reconnect so the worker auth store is populated for future syncs.
- Inline imports intentionally skip common secret-bearing files such as `.env*`, `.npmrc`, `.git-credentials`, `.netrc`, and files inside `.ssh/`, `.aws/`, or `.gnupg/`.
- The plugin stores catalog and sync metadata in Paperclip plugin state.

The manifest currently requests these Paperclip capabilities:

- `instance.settings.register`
- `plugin.state.read`
- `plugin.state.write`
- `jobs.schedule`
- `issues.read`
- `issues.wakeup`
- `http.outbound`
- `secrets.read-ref`
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

- `pnpm test:e2e` for the hosted Paperclip smoke flow, including assigned-task wakeups and recurring routine in-place sync against a disposable Paperclip `paperclipai@2026.428.0` instance
- `pnpm verify:manual` for an interactive local verification run against the same disposable Paperclip release target

Set `PAPERCLIP_E2E_PAPERCLIP_VERSION=<version>` to test a different `paperclipai` npm release in either disposable harness.

Manual verification highlights:

- In **Imported Companies**, confirm the auto-sync cadence input defaults to `24` hours and updates the next-run messaging when you save a different value.
- Toggle **Auto-sync** off and back on for a tracked import to verify the per-company setting still applies immediately.
- On Paperclip `2026.428.0`, confirm imported agents normally skip `pending_approval`; if you enable the target company's approval policy manually, confirm the plugin still approves matching pending imported agents before assigned tasks are imported.

## Release Versioning

GitHub release tags are the source of truth for published package versions. The release workflow strips a leading `v`, stamps `package.json` before verification and publish, and then syncs that checked-in version back to the release target branch so repository metadata stays aligned with the published package.

## License

[MIT](./LICENSE)
