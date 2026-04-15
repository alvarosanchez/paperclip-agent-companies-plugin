# Agent Companies Plugin

Paperclip plugin for discovering Agent Companies packages inside git repositories, importing selected companies into Paperclip, and keeping imported companies in sync.

## MVP Scope

This version focuses on repository discovery, import, and post-import sync:

- preloads `https://github.com/paperclipai/companies`
- lets operators add more public repos with either `owner/repo` shorthand or full URLs, plus local git checkouts
- scans each repository for `COMPANY.md` manifests with `schema: agentcompanies/v1`
- inventories each discovered company's `agents`, `projects`, `tasks`, `issues`, and `skills`
- lists every discovered company with its source repository and relative manifest path
- opens a modal from each company row so operators can inspect the discovered contents without crowding the settings page, using a left-hand item navigator and a right-hand rendered markdown preview with its own scroll region
- lets operators import one discovered company at a time into a new Paperclip company after entering the target company name in a compact modal
- tracks which discovered companies have already been imported so the same source package syncs back into the existing Paperclip company instead of creating duplicates
- enables daily auto-sync by default after import, persists the last sync timestamps in plugin state, and re-checks overdue imports after scheduled runs or instance restarts
- lets operators run `Sync now` manually and disable or re-enable daily auto-sync per imported company
- syncs imported companies back into Paperclip by overwriting existing content by default
- persists the shared discovery catalog across Paperclip restarts until an operator rescans
- lets operators remove any source, including the preloaded default repository

## Plugin Surface

- `src/manifest.ts`
  - registers a custom `settingsPage`
  - declares `instance.settings.register`, `plugin.state.read`, `plugin.state.write`, `jobs.schedule`, `http.outbound`, and `ui.page.register`
  - schedules a daily `catalog-auto-sync` job that checks imported companies for overdue sync runs
- `src/worker.ts`
  - stores the shared catalog in instance-scoped plugin state
  - auto-scans the preloaded repo only on the first read of a brand-new instance catalog
  - scans newly added repos immediately
  - inventories structured company manifests for `agents`, `projects`, `tasks`, `issues`, and `skills`
  - packages any discovered company into an inline Paperclip portability source so imports work for both GitHub repositories and local git checkouts
  - tracks imported companies, their last sync timestamps, current sync status, auto-sync preference, and default overwrite collision strategy in persisted plugin state
  - bounds inline import payloads by file count, per-file size, and encoded payload size so oversized packages fail with actionable errors instead of overwhelming the bridge
  - keeps persisted discoveries across restarts and only rescans when an operator triggers `Scan` or `Scan all`
  - reuses the local OS user's git config and credential helpers when the worker clones a repository
  - syncs imported companies back into their existing Paperclip company by rescanning the source package, rebuilding an inline import payload, and calling the full Paperclip company import route with overwrite collisions
  - runs due auto-syncs from the daily job and from a short delayed startup sweep so frequently restarted instances still respect the once-per-day cadence
  - preserves per-repository scan errors inline instead of failing the whole catalog
- `src/ui/index.tsx`
  - renders the hosted settings page for source management and company listing
  - opens a company-details modal with per-section counts, a left-hand item navigator, and a rendered markdown preview for the selected file
  - opens an import modal from the company list or details view, collects the new company name, and submits the import through the Paperclip host API
  - switches imported companies from `Import` to `Sync now`, shows per-company sync summaries and failures, and surfaces a daily auto-sync checkbox with overwrite-mode messaging

## Development

```bash
pnpm install
pnpm dev
pnpm dev:ui
pnpm test
pnpm test:e2e
```

## Install Into Paperclip

```bash
curl -X POST http://127.0.0.1:3100/api/plugins/install \
  -H "Content-Type: application/json" \
  -d '{"packageName":"/Users/alvaro/Dev/alvarosanchez/paperclip-agent-companies-plugin","isLocalPath":true}'
```

## Verification

Run the smallest relevant scope first:

```bash
pnpm typecheck
pnpm test
pnpm build
```

GitHub Actions runs the same verification sequence on pushes to `main` and on pull requests.
Publishing a GitHub release with a semver tag such as `v0.1.0` runs the npm release workflow and stamps the published package version from that tag.

Use these when the hosted flow changes:

- `pnpm test:e2e`
  - builds the plugin
  - boots a disposable Paperclip instance
  - installs the plugin
  - opens Installed Plugins, enters the plugin settings surface, checks the Add repository button contrast, adds a disposable local fixture repo, imports the discovered company into a new Paperclip company, verifies the imported row starts in an `Up to date` state with daily auto-sync enabled, bumps the source version and rescans until `Sync now` becomes available, runs a manual sync, and confirms the company-details modal renders the item navigator, markdown preview, and independent preview scrolling
- `pnpm verify:manual`
  - builds the plugin
  - boots a disposable or persistent Paperclip instance
  - installs the plugin
  - preconfigures the manual catalog with `https://github.com/alvarosanchez/micronaut-agent-company` instead of the default `paperclipai/companies` source
  - opens Installed Plugins in your browser for visual inspection of import plus sync controls

The smoke test writes the latest screenshot and page snapshot metadata to `tests/e2e/results/`.

## Manual Verification Checklist

After `pnpm verify:manual`:

1. Open the installed plugin entry for `Agent Companies Plugin`.
2. Confirm the preloaded `https://github.com/alvarosanchez/micronaut-agent-company` source is visible.
3. Confirm the settings page lists discovered companies from that source.
4. Add another repository with `owner/repo`, a full repository URL, or a local git checkout and verify it scans immediately.
   GitHub repositories that your local git setup can already access should scan without an auth prompt; inaccessible repos should keep the error inline on the source card.
   Confirm the `Add repository` button keeps readable contrast when focused or hovered.
5. Click `Import` on a discovered company, enter a new Paperclip company name in the modal, submit it, and confirm the success message summarizes the import outcome, offers an `Open dashboard` link for the new company, and notes that daily auto-sync is enabled with overwrite mode.
6. Confirm the imported company now shows a disabled `Up to date` action, a checked `Daily auto-sync` toggle, and an up-to-date summary instead of another import action.
7. Bump the source company version, use `Scan`, `Rescan`, or `Scan all`, and confirm the action switches to `Sync now`.
8. Click `Sync now` and confirm the success message summarizes the sync outcome for the existing Paperclip company without listing overwrite-mode warnings for replaced agents, skills, or projects.
9. Toggle `Daily auto-sync` off and back on again, confirming the checkbox state and status summary update immediately.
10. Confirm the imported company appears in Paperclip with the expected agents, skills, projects, and issues from the source package.
11. Open `View contents` on a discovered company and confirm the modal shows the expected `agents`, `projects`, `tasks`, `issues`, and `skills` sections in the left column, then click an item and confirm the rendered markdown preview updates on the right while the preview pane scrolls independently from the dialog shell.
12. Restart the same Paperclip state directory and confirm the discovered catalog and imported sync settings return without a fresh scan. If an imported company has gone more than a day without syncing, confirm a restart still allows the worker to pick up the overdue auto-sync sweep.
13. Use `Scan`, `Rescan`, or `Scan all` to pull source updates manually.
14. Remove a source and confirm it disappears without reappearing on reload.

Set `PAPERCLIP_E2E_PORT` or `PAPERCLIP_E2E_DB_PORT` if you need fixed ports for disposable runs.
Set `PAPERCLIP_E2E_STATE_DIR` before `pnpm verify:manual` if you want to preserve the Paperclip state directory between runs.
