# Partial Company Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add selective company imports, support adoption into the current untracked company, and persist the chosen selection as the long-term sync contract for each tracked imported company.

**Architecture:** Extend the catalog data model with a normalized per-part selection contract, teach the worker to prepare filtered inline import sources and persist the contract on tracked imports, then update the hosted settings UI so first-time imports and tracked-company re-imports both drive that same worker contract. Preserve backward compatibility by treating legacy tracked imports as full-company links.

**Tech Stack:** TypeScript, React, Vitest, Paperclip plugin SDK, hosted same-origin REST calls, YAML portability packaging

---

### Task 1: Add Failing Worker Tests For Selection And Existing-Company Adoption

**Files:**
- Modify: `tests/plugin.spec.ts`
- Read: `src/catalog.ts`
- Read: `src/worker.ts`

- [ ] **Step 1: Write the failing tests**

```ts
it("prepares filtered imports from a saved company selection", async () => {
  const preparedImport = await harness.performAction<CatalogPreparedCompanyImport>(
    "catalog.prepare-company-import",
    {
      companyId: company!.id,
      selection: {
        agents: { mode: "selected", itemPaths: ["agents/ceo/AGENTS.md"] },
        projects: { mode: "none" },
        tasks: { mode: "none" },
        issues: { mode: "all" },
        skills: { mode: "selected", itemPaths: ["skills/repo-audit/SKILL.md"] }
      }
    }
  );

  expect(Object.keys(preparedImport.source.files).sort()).toEqual([
    "COMPANY.md",
    "agents/ceo/AGENTS.md",
    "issues/follow-up/ISSUE.md",
    "skills/repo-audit/SKILL.md",
    "skills/repo-audit/assets/icon.svg"
  ]);
  expect(preparedImport.selection.projects.mode).toBe("none");
});

it("syncs using the saved selection instead of the full company source", async () => {
  await harness.performAction("catalog.record-company-import", {
    sourceCompanyId: company!.id,
    importedCompanyId: "paperclip-company-123",
    importedCompanyName: "Alpha Labs Imported",
    importedCompanyIssuePrefix: "ALP",
    selection: {
      agents: { mode: "selected", itemPaths: ["agents/ceo/AGENTS.md"] },
      projects: { mode: "none" },
      tasks: { mode: "none" },
      issues: { mode: "none" },
      skills: { mode: "none" }
    },
    syncCollisionStrategy: "skip"
  });

  const syncResult = await harness.performAction<CatalogCompanySyncResult>("catalog.sync-company", {
    sourceCompanyId: company!.id,
    importedCompanyId: "paperclip-company-123"
  });

  expect(syncCalls[0]).toEqual({
    importedCompanyId: "paperclip-company-123",
    collisionStrategy: "skip",
    filePaths: ["COMPANY.md", "agents/ceo/AGENTS.md"]
  });
  expect(syncResult.selection.agents.mode).toBe("selected");
});

it("records imports into an existing untracked company and rejects already-linked companies", async () => {
  const importedCatalog = await harness.performAction<CatalogSnapshot>("catalog.record-company-import", {
    sourceCompanyId: company!.id,
    importedCompanyId: "paperclip-company-123",
    importedCompanyName: "Existing Alpha",
    importedCompanyIssuePrefix: "ALP",
    selection: {
      agents: { mode: "all" },
      projects: { mode: "selected", itemPaths: ["projects/import-pipeline/PROJECT.md"] },
      tasks: { mode: "none" },
      issues: { mode: "none" },
      skills: { mode: "none" }
    },
    syncCollisionStrategy: "replace"
  });

  expect(importedCatalog.importedCompanies[0]?.importedCompany.selection.projects.mode).toBe("selected");

  await expect(
    harness.performAction("catalog.record-company-import", {
      sourceCompanyId: otherCompany!.id,
      importedCompanyId: "paperclip-company-123",
      importedCompanyName: "Existing Alpha",
      importedCompanyIssuePrefix: "ALP"
    })
  ).rejects.toThrow(/already linked to a different discovered company source/u);
});
```

- [ ] **Step 2: Run the focused worker tests to verify they fail**

Run: `pnpm test -- --runInBand tests/plugin.spec.ts`

Expected: FAIL because `selection` is not part of the import/sync contract yet and the filtered file expectations do not match the current full-company implementation.

- [ ] **Step 3: Commit the failing test checkpoint only if the repo uses red-only commits**

```bash
git add tests/plugin.spec.ts
git commit -m "test: cover partial company import contract"
```

Skip this commit if the repo prefers keeping the red/green cycle inside one local commit.

### Task 2: Implement Catalog Selection Types And Worker Persistence

**Files:**
- Modify: `src/catalog.ts`
- Modify: `src/worker.ts`
- Test: `tests/plugin.spec.ts`

- [ ] **Step 1: Add the shared selection types and normalization helpers in `src/catalog.ts`**

```ts
export type CompanyImportSelectionMode = "all" | "selected" | "none";

export interface CompanyImportPartSelection {
  mode: CompanyImportSelectionMode;
  itemPaths?: string[];
}

export interface CompanyImportSelection {
  agents: CompanyImportPartSelection;
  projects: CompanyImportPartSelection;
  tasks: CompanyImportPartSelection;
  issues: CompanyImportPartSelection;
  skills: CompanyImportPartSelection;
}

export function createFullCompanyImportSelection(): CompanyImportSelection {
  return {
    agents: { mode: "all" },
    projects: { mode: "all" },
    tasks: { mode: "all" },
    issues: { mode: "all" },
    skills: { mode: "all" }
  };
}
```

- [ ] **Step 2: Extend the import record and prepared import result shapes**

```ts
export interface CatalogPreparedCompanyImport {
  companyId: string;
  companyName: string;
  selection: CompanyImportSelection;
  source: {
    type: "inline";
    files: Record<string, PortableCatalogFileEntry>;
  };
  stats: {
    fileCount: number;
    textFileCount: number;
    binaryFileCount: number;
  };
}

export interface ImportedCatalogCompanyRecord {
  // existing fields...
  selection: CompanyImportSelection;
}
```

- [ ] **Step 3: Normalize persisted selections with backward-compatible defaults**

```ts
function normalizeCompanyImportPartSelection(
  value: unknown
): CompanyImportPartSelection {
  const record = isRecord(value) ? value : {};
  const mode =
    record.mode === "selected" || record.mode === "none" ? record.mode : "all";
  const itemPaths = Array.isArray(record.itemPaths)
    ? record.itemPaths
        .map((entry) => (typeof entry === "string" ? normalizeCompanyContentPath(entry) : null))
        .filter((entry): entry is string => entry !== null)
    : undefined;

  if (mode !== "selected" || !itemPaths || itemPaths.length === 0) {
    return { mode: mode === "selected" ? "none" : mode };
  }

  return {
    mode,
    itemPaths: [...new Set(itemPaths)].sort((left, right) => left.localeCompare(right))
  };
}
```

- [ ] **Step 4: Teach the worker to normalize a requested selection against the live discovered company contents**

```ts
function normalizeSelectionForCompany(
  company: DiscoveredAgentCompany,
  selection: unknown
): CompanyImportSelection {
  const normalized = normalizeCompanyImportSelection(selection);

  return {
    agents: normalizeSelectionPartForItems(company.contents.agents, normalized.agents),
    projects: normalizeSelectionPartForItems(company.contents.projects, normalized.projects),
    tasks: normalizeSelectionPartForItems(company.contents.tasks, normalized.tasks),
    issues: normalizeSelectionPartForItems(company.contents.issues, normalized.issues),
    skills: normalizeSelectionPartForItems(company.contents.skills, normalized.skills)
  };
}
```

- [ ] **Step 5: Filter import file paths from the normalized selection**

```ts
function buildSelectedCompanyFilePaths(
  company: DiscoveredAgentCompany,
  selection: CompanyImportSelection,
  allFilePaths: string[]
): string[] {
  const selectedContentPaths = new Set<string>();

  for (const key of COMPANY_CONTENT_KEYS) {
    const part = selection[key];
    const items = company.contents[key];

    if (part.mode === "all") {
      for (const item of items) {
        selectedContentPaths.add(getRepositoryRelativeCompanyContentPath(company, item.path));
      }
      continue;
    }

    if (part.mode === "selected") {
      for (const itemPath of part.itemPaths ?? []) {
        selectedContentPaths.add(getRepositoryRelativeCompanyContentPath(company, itemPath));
      }
    }
  }

  return allFilePaths.filter((filePath) => {
    if (filePath === "COMPANY.md" || PAPERCLIP_EXTENSION_FILE_NAMES.includes(filePath as never)) {
      return true;
    }

    for (const selectedPath of selectedContentPaths) {
      if (filePath === selectedPath || filePath.startsWith(`${dirname(selectedPath)}/`)) {
        return true;
      }
    }

    return false;
  });
}
```

- [ ] **Step 6: Persist the saved selection and collision strategy when recording imports**

```ts
const selection = normalizeSelectionForCompany(match.company, params.selection);
const syncCollisionStrategy = normalizeCatalogSyncCollisionStrategy(
  params.syncCollisionStrategy
);

{
  sourceCompanyId,
  importedCompanyId,
  importedCompanyName,
  importedCompanyIssuePrefix,
  importedSourceVersion: match.company.version,
  importedAt: timestamp,
  selection,
  autoSyncEnabled: existingImport?.autoSyncEnabled ?? DEFAULT_AUTO_SYNC_ENABLED,
  syncCollisionStrategy,
  lastSyncStatus: "succeeded",
  lastSyncAttemptAt: existingImport?.lastSyncAttemptAt ?? timestamp,
  lastSyncedAt: timestamp,
  lastSyncError: null,
  syncRunningSince: null
}
```

- [ ] **Step 7: Update sync to build filtered imports from the saved selection**

```ts
const preparedImport = await buildCatalogCompanyImportSource(
  ctx,
  sourceCompanyId,
  importedCompany.selection
);

return {
  ...importResult,
  sourceCompanyId,
  sourceCompanyName: refreshedMatch.company.name,
  importedCompanyId: nextImportedCompanyId,
  importedCompanyName: nextImportedCompanyName,
  importedCompanyIssuePrefix: importedCompany.importedCompanyIssuePrefix,
  importedSourceVersion: latestSourceVersion,
  latestSourceVersion,
  collisionStrategy: importedCompany.syncCollisionStrategy,
  selection: importedCompany.selection,
  syncedAt,
  upToDate: false
};
```

- [ ] **Step 8: Run the focused worker tests to verify they pass**

Run: `pnpm test -- --runInBand tests/plugin.spec.ts`

Expected: PASS for the new selection and adoption coverage.

### Task 3: Add Hosted UI Tests And Implement The Import/Re-import Dialog

**Files:**
- Modify: `src/ui/index.tsx`
- Modify: `tests/plugin.spec.ts`

- [ ] **Step 1: Add failing UI-facing tests around dialog state and recorded selection**

```ts
it("returns imported company summaries with persisted selections", async () => {
  const afterImport = await harness.performAction<CatalogSnapshot>("catalog.record-company-import", {
    sourceCompanyId: company!.id,
    importedCompanyId: "paperclip-company-123",
    importedCompanyName: "Alpha Labs Imported",
    importedCompanyIssuePrefix: "ALP",
    selection: {
      agents: { mode: "selected", itemPaths: ["agents/ceo/AGENTS.md"] },
      projects: { mode: "none" },
      tasks: { mode: "none" },
      issues: { mode: "all" },
      skills: { mode: "none" }
    },
    syncCollisionStrategy: "replace"
  });

  expect(afterImport.importedCompanies[0]?.importedCompany.selection.agents).toEqual({
    mode: "selected",
    itemPaths: ["agents/ceo/AGENTS.md"]
  });
});
```

- [ ] **Step 2: Add UI state types for target mode, selection, and collision strategy**

```ts
type ImportTargetMode = "new_company" | "current_company" | "existing_import";

interface ImportDialogState {
  companyId: string;
  targetMode: ImportTargetMode;
  companyName: string;
  selection: CompanyImportSelection;
  collisionStrategy: CatalogSyncCollisionStrategy;
  importedCompanyId?: string;
}
```

- [ ] **Step 3: Replace the old one-field import modal with a target, contents, and collision flow**

```tsx
<fieldset>
  <legend className="agent-companies-settings__metric-label">Target</legend>
  <label>
    <input
      checked={dialog.targetMode === "new_company"}
      name="import-target"
      onChange={() => onTargetModeChange("new_company")}
      type="radio"
    />
    New company
  </label>
  <label>
    <input
      checked={dialog.targetMode === "current_company"}
      disabled={!canImportIntoCurrentCompany}
      name="import-target"
      onChange={() => onTargetModeChange("current_company")}
      type="radio"
    />
    This company
  </label>
</fieldset>
```

- [ ] **Step 4: Add per-part and per-item selection controls with full-by-default behavior**

```tsx
{COMPANY_CONTENT_SECTIONS.map((section) => {
  const partSelection = dialog.selection[section.key];
  return (
    <section key={section.key}>
      <label>
        <input
          checked={partSelection.mode !== "none"}
          onChange={(event) => onTogglePart(section.key, event.target.checked)}
          type="checkbox"
        />
        {section.label}
      </label>
      {partSelection.mode !== "none" ? (
        <div>
          {company.contents[section.key].map((item) => (
            <label key={item.path}>
              <input
                checked={isSelectionItemChecked(partSelection, item.path)}
                onChange={(event) => onToggleItem(section.key, item.path, event.target.checked)}
                type="checkbox"
              />
              {item.name}
            </label>
          ))}
        </div>
      ) : null}
    </section>
  );
})}
```

- [ ] **Step 5: Submit imports and re-imports through the same filtered worker contract**

```ts
const preparedImport = await prepareCompanyImport({
  companyId: dialog.companyId,
  selection: dialog.selection
}) as CatalogPreparedCompanyImport;

const target =
  dialog.targetMode === "new_company"
    ? { mode: "new_company", newCompanyName: dialog.companyName.trim() }
    : { mode: "existing_company", companyId: targetCompanyId };

const importedCompany = await fetchHostJson<PaperclipCompanyImportResult>("/api/companies/import", {
  method: "POST",
  body: JSON.stringify({
    source: preparedImport.source,
    include: {
      company: true,
      agents: true,
      projects: true,
      issues: true,
      skills: true
    },
    target,
    collisionStrategy: dialog.collisionStrategy
  })
});

await recordCompanyImport({
  sourceCompanyId: dialog.companyId,
  importedCompanyId,
  importedCompanyName,
  importedCompanyIssuePrefix,
  selection: preparedImport.selection,
  syncCollisionStrategy: dialog.collisionStrategy
});
```

- [ ] **Step 6: Add the tracked-company `Re-import / Edit selection` affordance**

```tsx
<button
  className="agent-companies-settings__button"
  onClick={() =>
    onOpenReimport(company.sourceCompanyId, company.importedCompany.id)
  }
  type="button"
>
  Re-import / Edit selection
</button>
```

- [ ] **Step 7: Run the focused test suite again**

Run: `pnpm test -- --runInBand tests/plugin.spec.ts`

Expected: PASS with the worker and UI contract assertions updated.

### Task 4: Update Docs And Final Verification

**Files:**
- Modify: `README.md`
- Modify: `scripts/e2e/manual-paperclip-verify.mjs` if labels or instructions changed materially
- Verify: `pnpm typecheck`
- Verify: `pnpm test`
- Verify: `pnpm build`

- [ ] **Step 1: Update README for partial imports and current-company adoption**

```md
- Selective imports by catalog part and individual item, with full import as the default
- Import into a new company or the current untracked company
- Saved import selections become the sync contract for future manual sync and auto-sync
- Tracked imported companies can be re-imported to edit the saved selection
```

- [ ] **Step 2: Refresh manual verification notes if the visible flow changed**

```js
log("Manual verification should cover partial import, current-company adoption, and tracked-company re-import/edit selection.");
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`

Expected: exit code 0.

- [ ] **Step 4: Run tests**

Run: `pnpm test`

Expected: exit code 0.

- [ ] **Step 5: Run build**

Run: `pnpm build`

Expected: exit code 0.

- [ ] **Step 6: Commit the implementation**

```bash
git add src/catalog.ts src/worker.ts src/ui/index.tsx tests/plugin.spec.ts README.md scripts/e2e/manual-paperclip-verify.mjs
git commit -m "feat: support selective company imports"
```
