import { afterEach, describe, expect, it } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import { findRemovedBoundRoutineIds } from "../src/portable-routines.js";
import { executeDefaultSyncImport } from "../src/worker.js";

const originalFetch = globalThis.fetch;
const originalApiUrl = process.env.PAPERCLIP_API_URL;
const originalApiKey = process.env.PAPERCLIP_API_KEY;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalApiUrl === undefined) delete process.env.PAPERCLIP_API_URL;
  else process.env.PAPERCLIP_API_URL = originalApiUrl;
  if (originalApiKey === undefined) delete process.env.PAPERCLIP_API_KEY;
  else process.env.PAPERCLIP_API_KEY = originalApiKey;
});

describe("source-removed routine reconciliation", () => {
  it("selects removed bound routines without touching current or renamed identities", () => {
    expect(findRemovedBoundRoutineIds(
      [{
        filePath: "tasks/monthly-review/TASK.md",
        rootPath: "tasks/monthly-review",
        slug: "monthly-review",
        title: "Monthly Review",
        description: "Review the queue.",
        routineStatus: "active",
        routineTriggers: []
      }],
      [
        {
          sourceKind: "routine",
          sourcePath: "tasks/monthly-review/TASK.md",
          targetId: "routine-current"
        },
        {
          sourceKind: "routine",
          sourcePath: "tasks/removed-containment/TASK.md",
          targetId: "routine-removed"
        },
        {
          sourceKind: "routine",
          sourcePath: "tasks/renamed-review/TASK.md",
          targetId: "routine-renamed"
        },
        {
          sourceKind: "agent",
          sourcePath: "agents/ceo/AGENTS.md",
          targetId: "agent-ceo"
        }
      ],
      new Set(["routine-renamed"])
    )).toEqual(["routine-removed"]);

    expect(findRemovedBoundRoutineIds(
      [],
      [
        {
          sourceKind: "routine",
          sourcePath: "tasks/removed-containment/TASK.md",
          targetId: "routine-removed"
        },
        {
          sourceKind: "routine",
          sourcePath: "tasks/unselected/TASK.md",
          targetId: "routine-unselected"
        }
      ],
      new Set(),
      ["tasks/removed-containment/TASK.md"]
    )).toEqual(["routine-removed"]);
  });

  it("archives a source-removed bound routine once and limits partial selection to explicit paths", async () => {
    let routineStatus = "active";
    let archiveRequests = 0;

    process.env.PAPERCLIP_API_URL = "http://127.0.0.1:3210";
    process.env.PAPERCLIP_API_KEY = "paperclip-board-token"; // pragma: allowlist secret
    globalThis.fetch = async (input, init) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
      if (url === "http://127.0.0.1:3210/api/companies/paperclip-company-123/routines") {
        return new Response(JSON.stringify([{
          id: "routine-removed",
          title: "Removed Containment",
          description: "Obsolete containment routine.",
          status: routineStatus,
          createdAt: "2026-04-20T05:16:44.000Z",
          updatedAt: "2026-04-20T05:16:44.000Z"
        }]), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url === "http://127.0.0.1:3210/api/routines/routine-removed") {
        expect(init?.method).toBe("PATCH");
        expect(JSON.parse(String(init?.body))).toEqual({ status: "archived" });
        archiveRequests += 1;
        routineStatus = "archived";
        return new Response(JSON.stringify({ id: "routine-removed", status: routineStatus }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      throw new Error(`Unexpected fetch to ${url}`);
    };

    const harness = createTestHarness({ manifest, capabilities: [...manifest.capabilities] });
    const input = {
      sourceCompanyId: "source-company",
      sourceCompanyName: "Alpha Labs",
      importedCompanyId: "paperclip-company-123",
      collisionStrategy: "replace" as const,
      preparedImport: {
        companyId: "source-company",
        companyName: "Alpha Labs",
        selection: {
          agents: { mode: "none" as const },
          projects: { mode: "none" as const },
          tasks: { mode: "all" as const },
          issues: { mode: "none" as const },
          skills: { mode: "none" as const }
        },
        source: {
          type: "inline" as const,
          files: {
            "COMPANY.md": "---\nname: Alpha Labs\nschema: agentcompanies/v1\n---\n"
          }
        },
        stats: { fileCount: 1, textFileCount: 1, binaryFileCount: 0 }
      },
      existingIssues: [],
      adapterPresetSelection: { defaultPresetId: null, agentPresetIds: {} },
      previousBindings: [{
        sourceKind: "routine" as const,
        sourceId: null,
        sourcePath: "tasks/removed-containment/TASK.md",
        sourceName: "Removed Containment",
        sourceSlug: "removed-containment",
        targetId: "routine-removed",
        importPath: "tasks/removed-containment/TASK.md",
        canonicalSkillKey: null
      }],
      renameBindings: []
    };

    await executeDefaultSyncImport(harness.ctx, input);
    await executeDefaultSyncImport(harness.ctx, input);
    expect(archiveRequests).toBe(1);

    routineStatus = "active";
    await executeDefaultSyncImport(harness.ctx, {
      ...input,
      preparedImport: {
        ...input.preparedImport,
        selection: {
          ...input.preparedImport.selection,
          tasks: { mode: "selected" as const, itemPaths: [] }
        }
      }
    });
    expect(archiveRequests).toBe(1);

    await executeDefaultSyncImport(harness.ctx, {
      ...input,
      authoritativeRoutineSourcePaths: ["tasks/removed-containment/TASK.md"],
      preparedImport: {
        ...input.preparedImport,
        selection: {
          ...input.preparedImport.selection,
          tasks: { mode: "selected" as const, itemPaths: [] }
        }
      }
    });
    expect(archiveRequests).toBe(2);
  });
});
