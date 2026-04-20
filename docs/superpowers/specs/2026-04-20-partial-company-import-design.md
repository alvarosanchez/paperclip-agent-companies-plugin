# Partial Company Import And Existing-Company Adoption Design

Date: 2026-04-20
Status: Proposed
Scope: Agent Companies Plugin hosted settings page, worker import/sync contract, tests, and docs

## Summary

The plugin should support selective imports from a discovered company package.
Operators can choose:

- which catalog parts to include: `agents`, `projects`, `tasks`, `issues`, `skills`
- within each included part, which individual items to include

By default, every part and every item is included.

The plugin should also support importing a discovered company package into an existing Paperclip company.
That existing company must not already be one of the plugin's tracked synced companies at the time of the import.
After a successful import, the company becomes a tracked synced company and future manual sync plus daily auto-sync use the saved import selection.

The saved selection is the long-term sync contract for each tracked linked company.
If operators want to change that contract later, they do so through a deliberate re-import/edit-selection flow on the tracked imported company entry.

## Goals

- Support full or partial imports from a discovered company package.
- Make full import the default behavior for first-time users.
- Persist each linked company's import selection so future syncs remain predictable.
- Support importing into the current Paperclip company when the settings page is opened inside a company context and that company is not already tracked as synced.
- Keep existing full-import tracked companies working without migration breakage.
- Keep the UI and worker behavior aligned so operators can clearly understand what future sync will do.

## Non-Goals

- Add a global company picker for arbitrary Paperclip companies outside the current company context.
- Allow casual inline editing of the saved sync contract from the tracked company card.
- Add per-section collision strategies; collision handling remains one choice per import/re-import.
- Change the default daily auto-sync cadence or board-access flow.
- Introduce a second sync-profile concept separate from the tracked import link.

## User Experience

### Import Entry Points

The discovered company card action changes from a strictly new-company import affordance to a generic `Import...` affordance.

The dialog supports two initial import targets:

- `New company`
- `This company`

`This company` is only available when the settings page is opened inside a Paperclip company context.

`This company` is only valid when the current company is not already present in the plugin's tracked imported-company registry.
If the current company is already tracked, the dialog must not allow adopting it again through the initial import path.
Tracked companies instead expose a separate `Re-import / Edit selection` action.

### Initial Import Dialog

The import dialog contains three top-level sections:

1. Target
2. Contents
3. Collision handling

#### Target

For `New company`:

- show the editable new-company name field
- import target payload uses `mode: "new_company"`

For `This company`:

- hide the new-company name field
- display the current company label from host context
- import target payload uses `mode: "existing_company"` with the current `companyId`
- show a disabled state and explanation if the current company is already tracked

#### Contents

Each company part is shown as a row with:

- a part-level include toggle
- the discovered item count
- a compact selection summary
- an expand/collapse control for item-level toggles

Default state:

- every part is enabled
- every item inside every part is selected

Selection behavior:

- turning a part off excludes the entire part
- turning a part on restores item-level controls for that part
- operators can deselect individual items within an included part
- if a part is enabled but no items are selected, the normalized saved result is treated as excluding that part

#### Collision Handling

Operators choose one collision strategy per import:

- `replace` with label `Overwrite existing content`
- `skip`
- `rename`

`replace` is preselected.

The chosen collision strategy is persisted on the tracked link after a successful import and reused for future syncs until a deliberate re-import updates it.

### Tracked Imported Companies

Tracked imported company cards continue to show sync and auto-sync controls.
Each tracked imported company also gains a `Re-import / Edit selection` action.

That action opens a dialog that is similar to the initial import dialog but is prefilled from the saved link contract:

- target is fixed to the linked imported company
- selection is preloaded from the saved selection
- collision strategy is preloaded from the saved sync collision strategy

Submitting this flow:

- immediately performs an import into the already linked company
- updates the saved selection and collision strategy only if the import succeeds

If the re-import fails, the previous saved contract remains unchanged.
Re-import uses the same live host import API path as the initial import flow and relies on the current user session, while saved Board access remains a worker-side requirement for background sync.

## Data Model

### Existing Link Record

Today each tracked imported company is represented by an `ImportedCatalogCompanyRecord` keyed by:

- `sourceCompanyId`
- `importedCompanyId`

This record currently stores imported-company metadata, sync status, and collision strategy.

### New Saved Selection Contract

Extend the tracked link record with a persisted selection object.

Proposed shape:

```ts
type CompanyImportSelectionMode = "all" | "selected" | "none";

interface CompanyImportPartSelection {
  mode: CompanyImportSelectionMode;
  itemPaths?: string[];
}

interface CompanyImportSelection {
  agents: CompanyImportPartSelection;
  projects: CompanyImportPartSelection;
  tasks: CompanyImportPartSelection;
  issues: CompanyImportPartSelection;
  skills: CompanyImportPartSelection;
}
```

Semantics:

- `all`: include every current and future item in that part
- `selected`: include only the saved `itemPaths`
- `none`: exclude the part entirely

This model is intentionally not a flat list of file paths.
It preserves the difference between:

- a true full-part import, which should keep including new future items
- a curated subset, which should remain fixed to the chosen item paths

### Backward Compatibility

Persisted records that lack a saved selection must normalize to full import behavior:

- every part defaults to `mode: "all"`

That keeps existing tracked imports functioning exactly as they do today until an operator deliberately changes the contract through re-import/edit-selection.

## Worker Behavior

### Selection Normalization

The worker needs helpers that:

- build the default full selection from a discovered company summary
- normalize raw UI selection payloads against the currently discovered contents
- drop invalid or stale item paths
- reduce empty `selected` sets to `none`
- expose a stable public summary back to the UI

Normalization must be defensive because selections are persisted in plugin state and may outlive repository changes.
If stale saved item paths are encountered, the worker should prune them and continue as long as at least one selected part or item remains after normalization.

### Preparing Filtered Import Sources

`catalog.prepare-company-import` currently prepares a full inline import source for a discovered company.

It should be extended to accept an optional selection input:

```ts
{
  companyId: string;
  selection?: CompanyImportSelectionInput;
}
```

Behavior:

- when `selection` is omitted, prepare the full import source
- when `selection` is provided, include only the selected company parts and item paths
- still require `COMPANY.md` in all cases
- continue applying size and file-count guardrails to the filtered source
- continue merging Paperclip agent icon metadata when relevant to included agent files

The response should include both the filtered import source and the normalized selection used to produce it.

### Recording Initial Imports

`catalog.record-company-import` should be extended to persist:

- normalized saved selection
- sync collision strategy

The action remains the authoritative place to create or update the tracked link after a successful host import.

For initial imports:

- `New company` creates a new tracked link after the host import returns the imported company id
- `This company` creates a new tracked link for the current company after the host import succeeds

Conflict rule:

- if `importedCompanyId` is already linked to any source company, initial import into that company is rejected

This preserves the invariant that one Paperclip company maps to exactly one discovered source link.

### Sync

`catalog.sync-company` currently rebuilds a full inline import source and re-imports the entire discovered company package into the linked company.

New behavior:

- read the saved selection from the tracked link
- prepare a filtered inline source using that selection
- import into the linked existing Paperclip company using the saved collision strategy
- on success, update sync status, timestamps, and imported source version
- on failure, preserve the previous saved selection and previous collision strategy

Manual sync and daily auto-sync both use the saved selection contract.

### Re-import / Edit Selection

Add a worker action dedicated to updating the saved contract after a successful re-import.

Two acceptable shapes:

- extend `catalog.record-company-import` so it can update an existing tracked link after a successful re-import
- or add a new action such as `catalog.update-company-import-contract`

Recommendation:

- keep `catalog.record-company-import` as the single persistence path for both first imports and successful re-imports

This keeps the link-upsert logic centralized and avoids duplicated state-writing rules.

### Existing-Company Adoption

The worker does not need a host-side company picker.
The UI provides the current `companyId` through host context.

Rules:

- importing into an existing company is only allowed when the current company context exists
- importing into an existing company is only allowed when that current company is not already tracked
- after the import succeeds, the tracked link is created with that company id and saved selection

If the current company is already tracked, operators must use the tracked company's `Re-import / Edit selection` action instead.

## UI Behavior Details

### Dialog State

The settings page needs client state for:

- import target mode
- new company name for `new_company`
- per-part include toggles
- per-item selected state
- collision strategy
- whether the current company can be adopted

The dialog should derive defaults from the selected discovered company:

- full selection by default for first-time import
- saved selection plus saved collision strategy for tracked-company re-import

### Current Company Eligibility

When the page is opened inside a company context:

- determine whether `context.companyId` is already present in `catalog.importedCompanies`

Outcomes:

- untracked: `This company` is enabled
- tracked: `This company` is disabled for the initial import dialog, with explanatory copy

The explanatory copy should make the separate path clear:

- this company is already tracked
- use the tracked imported-company entry below to re-import or edit the saved selection

### Selection Summaries

The UI should show a concise summary before submission, for example:

- `Agents: all 12 selected`
- `Projects: 2 of 5 selected`
- `Tasks: excluded`

This same selection summary should be reused in success notices and tracked-company metadata so operators can see what future sync will include.

### Success Notices

Import and sync notices should describe the filtered import instead of always describing the entire company package.

Examples:

- `Selected contents: Agents (12), Projects (2), Tasks (excluded), Issues (all), Skills (1)`
- `Sync contract updated for future syncs.`

For first-time existing-company adoption, success messaging should explicitly say that the current company is now tracked for future sync.

## Error Handling

The design should preserve and extend current operator-facing error rules.

Required cases:

- discovered company no longer exists in current catalog snapshot
- current company is already tracked and cannot be adopted through the initial import flow
- attempted link would reuse an already tracked imported company id
- filtered selection becomes empty after normalization
- saved item paths disappear and normalization leaves nothing selected
- board access is required for authenticated deployments during worker-side sync
- host import succeeds but tracking metadata cannot be saved

Selection-specific rule:

- if the operator deselects everything, block submission with a clear validation message such as `Select at least one catalog part or item to import.`

## Testing

### Worker Tests

Add or update fast tests for:

- selection normalization defaults to full import
- partial selection filters prepared import file paths correctly
- deselected parts are excluded from prepared sources
- selected subsets preserve only chosen item paths
- legacy tracked imports without saved selection sync as full imports
- sync uses the saved selection instead of rebuilding the full source
- initial import into an existing untracked company records the tracked link and saved selection
- initial import into an already tracked company is rejected
- re-import only updates the saved selection and collision strategy after a successful import
- failed re-import leaves the previous contract unchanged

### UI Tests

Add or update hosted UI coverage for:

- import dialog target toggle behavior
- `This company` availability only in company context
- `This company` disabled state when the current company is already tracked
- part-level toggles and item-level toggles defaulting to full selection
- prefilled saved selection in the tracked-company re-import dialog
- success notices showing filtered import summaries

### End-To-End And Manual Verification

Update smoke/manual verification when UI affordances change enough to affect the hosted flow.

Manual verification should cover:

1. import all contents into a new company
2. import a subset into a new company
3. import a subset into the current untracked company
4. confirm the current company becomes tracked
5. re-import the tracked company with a changed selection
6. confirm later sync respects the updated saved selection

## Documentation Updates

Update `README.md` to reflect:

- partial import support
- `This company` import support
- saved selection as the sync contract
- tracked-company re-import/edit-selection flow

Update any manual verification guidance so it explicitly covers:

- untracked current-company adoption
- the restriction that already tracked companies use re-import/edit-selection instead of the initial existing-company path
- sync behavior for saved partial selections

## Implementation Notes

Recommended implementation order:

1. Add selection types and normalization helpers in `src/catalog.ts`
2. Extend worker import preparation to support filtered sources
3. Extend tracked import persistence to store saved selection and collision strategy
4. Update sync to use the saved selection
5. Update the hosted import dialog and tracked-company re-import flow
6. Update tests
7. Update docs and verification notes

## Acceptance Criteria

- Operators can import all or part of a discovered company package.
- Full import remains the default for first-time use.
- Operators can import into the current Paperclip company when it is not already tracked.
- After a successful existing-company import, that company becomes a tracked synced company.
- Future manual sync and auto-sync use the saved selection contract for that linked company.
- Operators can deliberately re-import a tracked company to change its saved selection contract.
- Already tracked companies cannot be re-adopted through the initial existing-company import path.
- Existing tracked imports without saved selections continue to behave as full-company syncs.
