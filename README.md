# Agent Companies Plugin

Paperclip plugin for discovering Agent Companies packages inside git repositories before a later import flow.

## MVP Scope

This first version focuses on repository discovery:

- preloads `https://github.com/paperclipai/companies`
- lets operators add more public repos with either `owner/repo` shorthand or full URLs, plus local git checkouts
- scans each repository for `COMPANY.md` manifests with `schema: agentcompanies/v1`
- inventories each discovered company's `agents`, `projects`, `tasks`, `issues`, and `skills`
- lists every discovered company with its source repository and relative manifest path
- opens a modal from each company row so operators can inspect the discovered contents without crowding the settings page, using a left-hand item navigator and a right-hand rendered markdown preview with its own scroll region
- persists the shared discovery catalog across Paperclip restarts until an operator rescans
- lets operators remove any source, including the preloaded default repository

The plugin does **not** import companies into Paperclip yet. It only manages the discovery catalog.

## Plugin Surface

- `src/manifest.ts`
  - registers a custom `settingsPage`
  - declares `instance.settings.register`, `plugin.state.read`, `plugin.state.write`, and `ui.page.register`
- `src/worker.ts`
  - stores the shared catalog in instance-scoped plugin state
  - auto-scans the preloaded repo only on the first read of a brand-new instance catalog
  - scans newly added repos immediately
  - inventories structured company manifests for `agents`, `projects`, `tasks`, `issues`, and `skills`
  - keeps persisted discoveries across restarts and only rescans when an operator triggers `Scan` or `Scan all`
  - reuses the local OS user's git config and credential helpers when the worker clones a repository
  - preserves per-repository scan errors inline instead of failing the whole catalog
- `src/ui/index.tsx`
  - renders the hosted settings page for source management and company listing
  - opens a company-details modal with per-section counts, a left-hand item navigator, and a rendered markdown preview for the selected file

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

Use these when the hosted flow changes:

- `pnpm test:e2e`
  - builds the plugin
  - boots a disposable Paperclip instance
  - installs the plugin
  - opens Installed Plugins, enters the plugin settings surface, checks the Add repository button contrast, adds a disposable local fixture repo, and verifies the company-details modal renders the item navigator, markdown preview, and independent preview scrolling
- `pnpm verify:manual`
  - builds the plugin
  - boots a disposable or persistent Paperclip instance
  - installs the plugin
  - opens Installed Plugins in your browser for visual inspection

The smoke test writes the latest screenshot and page snapshot metadata to `tests/e2e/results/`.

## Manual Verification Checklist

After `pnpm verify:manual`:

1. Open the installed plugin entry for `Agent Companies Plugin`.
2. Confirm the preloaded `paperclipai/companies` source is visible.
3. Confirm the settings page lists discovered companies from that source.
4. Add another repository with `owner/repo`, a full repository URL, or a local git checkout and verify it scans immediately.
   GitHub repositories that your local git setup can already access should scan without an auth prompt; inaccessible repos should keep the error inline on the source card.
   Confirm the `Add repository` button keeps readable contrast when focused or hovered.
5. Open `View contents` on a discovered company and confirm the modal shows the expected `agents`, `projects`, `tasks`, `issues`, and `skills` sections in the left column, then click an item and confirm the rendered markdown preview updates on the right while the preview pane scrolls independently from the dialog shell.
6. Restart the same Paperclip state directory and confirm the discovered catalog returns without a fresh scan.
7. Use `Scan`, `Rescan`, or `Scan all` to pull updates manually.
8. Remove a source and confirm it disappears without reappearing on reload.

Set `PAPERCLIP_E2E_PORT` or `PAPERCLIP_E2E_DB_PORT` if you need fixed ports for disposable runs.
Set `PAPERCLIP_E2E_STATE_DIR` before `pnpm verify:manual` if you want to preserve the Paperclip state directory between runs.
