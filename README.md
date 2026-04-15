# Agent Companies Plugin

Paperclip plugin for discovering Agent Companies packages inside git repositories and importing selected companies into Paperclip.

## MVP Scope

This version focuses on repository discovery plus one-click import:

- preloads `https://github.com/paperclipai/companies`
- lets operators add more public repos with either `owner/repo` shorthand or full URLs, plus local git checkouts
- scans each repository for `COMPANY.md` manifests with `schema: agentcompanies/v1`
- inventories each discovered company's `agents`, `projects`, `tasks`, `issues`, and `skills`
- lists every discovered company with its source repository and relative manifest path
- opens a modal from each company row so operators can inspect the discovered contents without crowding the settings page, using a left-hand item navigator and a right-hand rendered markdown preview with its own scroll region
- lets operators import one discovered company at a time into a new Paperclip company after entering the target company name in a compact modal
- persists the shared discovery catalog across Paperclip restarts until an operator rescans
- lets operators remove any source, including the preloaded default repository

## Plugin Surface

- `src/manifest.ts`
  - registers a custom `settingsPage`
  - declares `instance.settings.register`, `plugin.state.read`, `plugin.state.write`, and `ui.page.register`
- `src/worker.ts`
  - stores the shared catalog in instance-scoped plugin state
  - auto-scans the preloaded repo only on the first read of a brand-new instance catalog
  - scans newly added repos immediately
  - inventories structured company manifests for `agents`, `projects`, `tasks`, `issues`, and `skills`
  - packages any discovered company into an inline Paperclip portability source so imports work for both GitHub repositories and local git checkouts
  - keeps persisted discoveries across restarts and only rescans when an operator triggers `Scan` or `Scan all`
  - reuses the local OS user's git config and credential helpers when the worker clones a repository
  - preserves per-repository scan errors inline instead of failing the whole catalog
- `src/ui/index.tsx`
  - renders the hosted settings page for source management and company listing
  - opens a company-details modal with per-section counts, a left-hand item navigator, and a rendered markdown preview for the selected file
  - opens an import modal from the company list or details view, collects the new company name, and submits the import through the Paperclip host API

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
  - opens Installed Plugins, enters the plugin settings surface, checks the Add repository button contrast, adds a disposable local fixture repo, imports the discovered company into a new Paperclip company, and verifies the company-details modal renders the item navigator, markdown preview, and independent preview scrolling
- `pnpm verify:manual`
  - builds the plugin
  - boots a disposable or persistent Paperclip instance
  - installs the plugin
  - preconfigures the manual catalog with `https://github.com/alvarosanchez/micronaut-agent-company` instead of the default `paperclipai/companies` source
  - opens Installed Plugins in your browser for visual inspection

The smoke test writes the latest screenshot and page snapshot metadata to `tests/e2e/results/`.

## Manual Verification Checklist

After `pnpm verify:manual`:

1. Open the installed plugin entry for `Agent Companies Plugin`.
2. Confirm the preloaded `https://github.com/alvarosanchez/micronaut-agent-company` source is visible.
3. Confirm the settings page lists discovered companies from that source.
4. Add another repository with `owner/repo`, a full repository URL, or a local git checkout and verify it scans immediately.
   GitHub repositories that your local git setup can already access should scan without an auth prompt; inaccessible repos should keep the error inline on the source card.
   Confirm the `Add repository` button keeps readable contrast when focused or hovered.
5. Click `Import` on a discovered company, enter a new Paperclip company name in the modal, submit it, and confirm the success message summarizes the import outcome, offers an `Open dashboard` link for the new company, and changes the source action to a disabled `Imported` state so the same package cannot be imported twice.
6. Confirm the imported company appears in Paperclip with the expected agents, skills, projects, and issues from the source package.
7. Open `View contents` on a discovered company and confirm the modal shows the expected `agents`, `projects`, `tasks`, `issues`, and `skills` sections in the left column, then click an item and confirm the rendered markdown preview updates on the right while the preview pane scrolls independently from the dialog shell.
8. Restart the same Paperclip state directory and confirm the discovered catalog returns without a fresh scan.
9. Use `Scan`, `Rescan`, or `Scan all` to pull updates manually.
10. Remove a source and confirm it disappears without reappearing on reload.

Set `PAPERCLIP_E2E_PORT` or `PAPERCLIP_E2E_DB_PORT` if you need fixed ports for disposable runs.
Set `PAPERCLIP_E2E_STATE_DIR` before `pnpm verify:manual` if you want to preserve the Paperclip state directory between runs.
