# Agent Companies Plugin

Paperclip plugin for discovering Agent Companies packages inside git repositories before a later import flow.

## MVP Scope

This first version focuses on repository discovery:

- preloads `https://github.com/paperclipai/companies`
- lets operators add more public repos or local git checkouts
- scans each repository for `COMPANY.md` manifests with `schema: agentcompanies/v1`
- lists every discovered company with its source repository and relative manifest path
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
  - keeps persisted discoveries across restarts and only rescans when an operator triggers `Scan` or `Scan all`
  - reuses the local OS user's git config and credential helpers when the worker clones a repository
  - preserves per-repository scan errors inline instead of failing the whole catalog
- `src/ui/index.tsx`
  - renders the hosted settings page for source management and company listing

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
  - opens Installed Plugins, enters the plugin settings surface, and verifies repository/company discovery renders
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
4. Add another repository or a local git checkout and verify it scans immediately.
   GitHub repositories that your local git setup can already access should scan without an auth prompt; inaccessible repos should keep the error inline on the source card.
5. Restart the same Paperclip state directory and confirm the discovered catalog returns without a fresh scan.
6. Use `Scan`, `Rescan`, or `Scan all` to pull updates manually.
7. Remove a source and confirm it disappears without reappearing on reload.

Set `PAPERCLIP_E2E_PORT` or `PAPERCLIP_E2E_DB_PORT` if you need fixed ports for disposable runs.
Set `PAPERCLIP_E2E_STATE_DIR` before `pnpm verify:manual` if you want to preserve the Paperclip state directory between runs.
