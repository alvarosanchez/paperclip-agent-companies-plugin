# Agent Companies Plugin

[![CI](https://img.shields.io/github/actions/workflow/status/alvarosanchez/paperclip-agent-companies-plugin/ci.yml?branch=main&label=ci)](https://github.com/alvarosanchez/paperclip-agent-companies-plugin/actions/workflows/ci.yml)
[![Node 24.11+ or 26+](https://img.shields.io/badge/node-24.11%2B%20%7C%7C%2026%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![pnpm 10](https://img.shields.io/badge/pnpm-10-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Discover Agent Company packages in git repositories, inspect their contents inside Paperclip, import all or part of them into Paperclip companies, and keep tracked imports in sync over time.

## What You Get

- Repository discovery from GitHub shorthand (`owner/repo`), full git URLs, or local checkouts
- Automatic detection of `COMPANY.md` manifests with `schema: agentcompanies/v1`
- Hosted Paperclip settings surfaces with separate discovered-source and imported-company sections, available from both Installed Plugins and Company Settings
- Separate import actions for creating a new Paperclip company or importing into an existing non-synced company
- Per-part and per-item import selection for agents, projects, tasks, and skills, with everything selected by default
- Agent-company `TASK.md` files and Paperclip `ISSUE.md` manifests are grouped together under **Tasks** in the hosted UI
- Required project and agent dependencies are auto-included whenever selected tasks depend on them
- Saved sync contracts per tracked imported company, plus a re-import flow for updating the selection later
- Saved adapter presets that can be applied as import defaults or per-agent overrides
- Optional automation pausing on import and on sync, so imported agents and routines stay parked until an operator verifies the company
- Manual sync plus background auto-sync for tracked imported companies
- Recurring `TASK.md` support: `recurring: true` tasks import as Paperclip routines, with `.paperclip.yaml` routine metadata preserved
- Company-scoped Board access connection for authenticated Paperclip deployments
- Optional `metadata.paperclip.agentIcon` support for agent icon hints
- A preloaded default catalog source: `https://github.com/paperclipai/companies`

## Requirements

- Node.js 24.11 or newer on the 24.x line, or Node.js 26 or newer (the `@paperclipai/plugin-sdk` 2026.831 baseline requires 24.11+; Vitest 5 does not support Node 25, so the test suite needs 24.x or 26+)
- A Paperclip instance with plugin support, version `2026.831.1` or newer
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
2. Open **Agent Companies Plugin**, or open **Company Settings** > **Agent Companies** when working inside a specific company.
3. Add a repository source with `owner/repo`, a full repository URL, or a local checkout path.
4. Review discovered companies and open **View contents** to inspect agents, projects, tasks, recurring tasks/routines, Paperclip issue manifests, and skills.
5. Click **Import as new company** to create a fresh Paperclip company, or open **Import into...** to pick one of the other non-synced Paperclip companies already in the instance.
6. Leave the default full selection in place or toggle down to just the parts and items you want. If a selected task depends on a project or agent, the plugin auto-includes those required dependencies.
7. Optionally configure **Adapter Presets** in settings, then select a default preset and per-agent overrides during import.
8. Importing into an existing non-synced company adopts that company for future syncs, including the company whose settings page you are currently viewing.
9. Use **Re-import / Edit selection** from the tracked company card whenever you want to deliberately change the saved sync contract.
10. If your Paperclip deployment requires authentication, open **Company Settings** > **Agent Companies** inside the imported company once and complete **Board access connection**.
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

The hosted settings page renders a preset builder instead of requiring operators to hand-write a JSON array. It reads the running Paperclip host's adapter registry from `/api/adapters`, then loads each selected adapter's config schema from `/api/adapters/:type/config-schema` when available. The builder follows Paperclip's native adapter form shape, including standard adapter display labels, adapter-specific command keys, model and thinking-effort dropdowns, environment rows, and a test-environment action when the page is opened inside a company. Preset IDs are derived from display names and kept out of the form.

If an adapter does not expose a config schema, or if an operator needs to set a config key that is not represented by the schema, the preset editor includes a collapsible advanced JSON section for those adapter-specific values.

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
- A replace-mode sync treats the verified routine UUID ledger as authoritative for its saved task contract: a previously bound recurring task that is no longer in the source is archived by UUID when the contract covers all tasks or explicitly selected that removed task path. Verified rename targets are protected, retries skip routines that are already archived, and partial task selections never infer deletion for paths outside the saved selection.
- Every completed tracked import immediately resolves and verifies a complete selected-item UUID ledger; if board access or an unambiguous live identity is unavailable, tracking fails instead of saving an empty ledger. Tracked syncs persist and verify that complete source-lineage-to-Paperclip-UUID ledger for every selected item, including source kind, stable id, path, name, slug, and the canonical skill key. Git revision evidence, or an explicit stable `metadata.agentCompanies.sourceId`/`metadata.agentCompanies.id`, lets agent, project, task/issue, routine, and skill identities change without replacing the host entity. Revision evidence is evaluated even when the package version is unchanged, and legacy ledgers are reconstructed from the saved Git revision before a changed source is applied. Because Paperclip has no cross-endpoint transaction, a verified old-revision UUID baseline is persisted as a recovery journal before the first mutation; UUID-addressed PATCH, trigger reconciliation, and portability import operations are idempotent so a failed run retries deterministically without advancing the saved source revision/version. Selected item paths and per-agent preset selections migrate with proven renames. If a saved selection expands before sync, an item with no live identity remains deliberately unbound until portability import creates it and post-import verification records its UUID; a unique pre-existing identity is recovered, while ambiguous matches fail closed. Missing, ambiguous, or colliding source/destination identities stop before any PATCH or portability import. Renamed agents, projects, issues, and routines are reconciled by their bound UUID; issue title, body, status, priority, project, and assignee references are updated in place; routine metadata and triggers must reconcile successfully before the issue import pass; and renamed issues/routines are excluded from creation. Renamed skills retain their host identity by injecting the ledger's canonical skill key into the staged `SKILL.md`; no source-path alias is used. The source revision/version advances only after UUID verification and a complete current ledger can be persisted.
- **Pausing imported automations.** Paperclip's `POST /api/companies/import` treats `pauseAutomations` as optional and falls back to `false`, so by default imported and updated agents wake immediately. The plugin now always sends the flag explicitly:
  - **Import as new company** checks **Pause agents after import until verified** by default. This is a one-time safety check for a brand new company, so it is not saved as the tracked import's sync setting.
  - **Import into...** and **Re-import / Edit selection** show the same checkbox, default off, and save the chosen value as the tracked import's sync setting.
  - Tracked imported company cards expose a **Pause agents on sync** toggle (`syncPauseAutomations`, default off) that is sent on every manual **Sync now** and every hourly auto-sync.
- Host semantics for `pauseAutomations: true`: Paperclip creates or updates the selected agents with `status: "paused"`, `pauseReason: "import"`, and `pausedAt` set to the import timestamp, and creates imported routines with `status: "paused"`. One-time tasks and issues are not affected. Resume an agent from its agent page (Paperclip's dashboard also offers a bulk resume banner for `pauseReason: "import"`), and reactivate a routine by setting it back to active. Pre-existing agents that the import does not touch are never paused.
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
- Paperclip `2026.512.0` added new plugin host surfaces for managed resources, local folders, scoped APIs, and plugin database namespaces. This plugin keeps its manifest on the existing catalog/import/sync capabilities until it owns one of those behaviors directly.
- Paperclip `2026.525.0` added company-scoped plugin settings pages. On the `2026.626.0` host, the company settings slot could remain stuck in the host-level `Loading...` state before mounting plugin UI, so this plugin exposes the same company-aware settings UI through a company-scoped plugin page at `/:companyPrefix/agent-companies` while keeping the installed-plugin settings slot available under instance settings.
- Paperclip `2026.529.0` made skills first-class in the host catalog and CLI. The plugin continues to inventory `skills/` packages and sends selected skills through Paperclip's portability import flow, so no extra manifest capability is needed unless the plugin later manages host-owned skills directly.
- Paperclip `2026.609.0` fixed host dispatch for plugin-provided agent tools. This plugin does not expose agent tools today, so the compatibility update is limited to the SDK/runtime baseline and disposable verification harnesses.
- Paperclip `2026.626.0` adds the Skills Store and per-company plugin tenant-isolation columns. This plugin imports package skills through the company portability flow and also installs selected agents' referenced first-party Skills Store catalog keys before agent import/sync, so packages can grant catalog skills without vendoring catalog skill bodies. The plugin keeps its persistent catalog in company-scoped plugin state.

- Paperclip `2026.626.0` adds built-in Hermes adapters, task watchdogs, ask work mode, routine date variables, Teams Catalog, workspace downloads, and external object references. This plugin's release-adoption scope is compatibility rather than new runtime ownership: imported company packages may continue to declare `acpx_local`/custom Hermes adapter presets or adopt built-in `hermes_local`/`hermes_gateway` adapter presets, routine schedules, Skills Store grants, and package-owned guidance; task watchdogs, ask-mode issue creation, Teams Catalog installation, and instance-scoped environment defaults remain live Paperclip/company-package decisions unless a future product PR gives this plugin an explicit import or sync contract for them.
- Paperclip `2026.831.1` re-enables company-scoped plugin config and plugin secret references, moves company import/export to bundle schemaVersion 7 (schemaVersion 6 introduced the stamped `.paperclip.yaml` `schemaVersion`; unstamped bundles are read as 5), adds chunked/resumable and async (`?async=1`) import transfers, requires an explicit merge mode for agent skill sync, and routes plugin-provided agent tools through the host tool gateway. This plugin's adoption boundary: connecting board access now also saves a company-scoped plugin config whose `boardAccessTokenRef` field is a `{ type: "secret_ref" }` binding, so the worker resolves the token through `ctx.secrets.resolve(binding, { companyId, configPath })` and the scheduled auto-sync job is admitted to that company's host scope (the worker declares `multiCompanyConfig: true` because every company binds its own secret; the catalog stays in instance-scoped plugin state). Imports keep using the synchronous inline `POST /api/companies/import` request rather than chunked transfers (the inline payload stays capped at 8 MiB) and do not stamp a bundle `schemaVersion`, so the host reads the staged package as schemaVersion 5 and may attach an informational warning about task metadata the package does not carry. Skill sync explicit merge mode: the explicit `mode` (`add`/`remove`/`replace`) that 2026.817.0 made mandatory belongs to `POST /api/agents/:id/skills/sync`, which this plugin does not call. Package skills still travel through the portability import, which resolves skill conflicts from the top-level `collisionStrategy` instead. That field is optional on the host schema and the portability service falls back to `rename`, so the plugin now sends it explicitly on every import request, including the issue-only pass: a tracked `replace` sync keeps replacing package-owned skill rows, while `skip`/`rename` leave operator-edited skills untouched and report `skipped`/`renamed` per skill. Note that a company import replaces an agent's desired-skill set with whatever the package declares regardless of `collisionStrategy`, so operator-added skill selections on a synced agent are not preserved; keep operator-owned skills on agents the plugin does not sync. Imported agents keep the adapter declared in the package `.paperclip.yaml` or the selected adapter preset override, and packages may now declare built-in `claude_local`/`codex_local` adapter presets (which default to the ACP engine on this release) as well as `hermes_local`/`hermes_gateway` ones. New host capabilities (tool gateway policies, issue interactions and attachments, approvals, human-attributed comments, sandbox execution) are not adopted.
- When a synced package or adapter preset updates an agent adapter but omits `adapterConfig.env`, the worker preserves the target agent's existing environment bindings. A package or preset must include an explicit `env` value to replace those bindings.
- The hosted settings page records the active Paperclip origin for worker-side imports and syncs, so background sync keeps targeting the same host even when the worker runs with a sanitized environment.
- Authenticated Paperclip deployments require a saved Board access connection in the imported company before worker-side sync can call the Paperclip import API.
- Not every Paperclip 403 means the board access token is wrong. Sync results now keep the host's machine-readable `code` and report these separately instead of prompting for a reconnect: `cloud_managed` (company import is disabled on a cloud-managed instance), `settings_operator_managed` (the hosting operator hid the company import page, which also blocks the import API), and the company skill policy denials `skill_policy_denied`, `skill_company_boundary_denied`, and `skill_actor_restricted` (reported with Paperclip's own `reason`/`remediation`). Any other 401/403 still resolves to the board access prompt.

## Security And Privacy

- Remote repositories are cloned with `git` into temporary checkouts.
- For private repositories, the worker reuses your existing local git credential helpers when available.
- Local checkout paths are read from the Paperclip host machine, so only trusted operators should add local paths.
- Board access connections are stored as company secrets and the plugin keeps only the secret reference plus display metadata in plugin state.
- On Paperclip `2026.831.1` and newer, connecting board access also saves a company-scoped plugin config (`boardAccessTokenRef`) that binds that secret to the plugin; the host only resolves plugin secret references through such bindings. Saving plugin config requires an instance admin, so a non-admin connect still succeeds and falls back to the cached worker credential. Board access connected on an older release must be reconnected once after upgrading so the binding exists.
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

- `pnpm test:e2e` for the hosted Paperclip smoke flow, including assigned-task wakeups, recurring routine in-place sync, and the company-scoped Agent Companies plugin page against a disposable Paperclip `paperclipai@2026.831.1` instance
- `pnpm verify:manual` for an interactive local verification run against the same disposable Paperclip 2026.831 release target

The disposable Paperclip harnesses run `paperclipai@2026.831.1` under `node@24`, matching the release's Docker baseline (the 2026.831 SDK requires Node 24.11+) and avoiding Node 20's missing `node:sqlite` runtime module.

Set `PAPERCLIP_E2E_PAPERCLIP_VERSION=<version>` to test a different `paperclipai` npm release in either disposable harness.

Manual verification highlights:

- In **Imported Companies**, confirm the auto-sync cadence input defaults to `24` hours and updates the next-run messaging when you save a different value.
- Toggle **Auto-sync** off and back on for a tracked import to verify the per-company setting still applies immediately.
- Open **Company Settings** > **Agent Companies** for a seeded or imported company and confirm the same repository catalog settings page mounts with the company-scoped Board access controls.
- On the target Paperclip release, confirm imported agents normally skip `pending_approval`; if you enable the target company's approval policy manually, confirm the plugin still approves matching pending imported agents before assigned tasks are imported.

## Release Versioning

GitHub release tags are the source of truth for published package versions. The release workflow strips a leading `v`, stamps `package.json` before verification and publish, and then syncs that checked-in version back to the release target branch so repository metadata stays aligned with the published package.

## License

[MIT](./LICENSE)
