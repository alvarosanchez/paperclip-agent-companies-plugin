import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import { parse as parseYaml } from "yaml";
import manifest from "../src/manifest.js";
import {
  AGENT_COMPANIES_SCHEMA,
  DEFAULT_AUTO_SYNC_CADENCE_HOURS,
  DEFAULT_SYNC_COLLISION_STRATEGY,
  CATALOG_STATE_KEY,
  DEFAULT_REPOSITORY_URL,
  type CatalogCompanyContentDetail,
  type CatalogPreparedCompanyImport,
  type CatalogCompanySyncResult,
  buildStagedPaperclipImportSource,
  compareCatalogSourceVersions,
  createRepositorySource,
  createEmptyCompanyContents,
  getCompanyContentItemRequirementSources,
  getCompanyContentSectionItemCount,
  getVisibleCompanyContentSections,
  isCompanyContentItemRequiredBySelection,
  listCompanyContentSectionItems,
  normalizeCatalogState,
  normalizeRepositoryCloneRef,
  normalizeRepositoryReference,
  resolveCompanyImportSelection,
  type CatalogSnapshot
} from "../src/catalog.js";
import {
  buildGitProcessEnvironment,
  clearRepositoryCheckoutCacheEntry,
  createAgentCompaniesPlugin,
  resolvePaperclipApiConnection,
  resolveRepositoryContentRoot,
  scanRepositoryForAgentCompanies,
  shouldStartWorkerHost
} from "../src/worker.js";
import { requiresPaperclipBoardAccess } from "../src/paperclip-health.js";
import {
  extractPortableRecurringTaskDefinitions,
  findArchivableImportedRoutineIds
} from "../src/portable-routines.js";
import { getImportedCompanyVersionInfo } from "../src/ui/version-status.js";

const tempDirectories: string[] = [];
const CATALOG_SCOPE = {
  scopeKind: "instance" as const,
  stateKey: CATALOG_STATE_KEY
};

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0, tempDirectories.length).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

function runCommand(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stderr = "";

    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", rejectPromise);
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(new Error(`${command} ${args.join(" ")} failed: ${stderr}`));
    });
  });
}

async function createRepositoryFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "paperclip-agent-companies-plugin-test-"));
  tempDirectories.push(root);

  await mkdir(join(root, "alpha"), { recursive: true });
  await mkdir(join(root, "nested", "beta"), { recursive: true });
  await mkdir(join(root, "noise"), { recursive: true });

  await writeFile(
    join(root, "alpha", "COMPANY.md"),
    `---
name: Alpha Labs
description: Discovery fixture for Alpha Labs
slug: alpha-labs
schema: ${AGENT_COMPANIES_SCHEMA}
version: 1.0.0
---

Alpha Labs fixture company.
`
  );
  await mkdir(join(root, "alpha", "agents", "ceo"), { recursive: true });
  await mkdir(join(root, "alpha", "skills", "repo-audit", "assets"), { recursive: true });
  await mkdir(join(root, "alpha", "skills", "repo-audit"), { recursive: true });
  await mkdir(join(root, "alpha", "projects", "import-pipeline", "tasks", "seed-default"), {
    recursive: true
  });
  await mkdir(join(root, "alpha", "issues", "follow-up"), { recursive: true });
  await writeFile(
    join(root, "alpha", "agents", "ceo", "AGENTS.md"),
    `---
name: Alpha CEO
title: Chief Executive Officer
---

Lead Alpha Labs and coordinate the delivery pipeline.
`
  );
  await writeFile(
    join(root, "alpha", "skills", "repo-audit", "SKILL.md"),
    `---
name: Repo Audit
description: Review repository hygiene.
---

## Checklist

- Review the repository layout
- Confirm manifests are present
`
  );
  await writeFile(
    join(root, "alpha", "skills", "repo-audit", "assets", "icon.svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <circle cx="12" cy="12" r="10" fill="#3b82f6" />
</svg>
`
  );
  await writeFile(
    join(root, "alpha", "projects", "import-pipeline", "PROJECT.md"),
    `---
name: Import Pipeline
description: Build the import path.
---

Prepare the first import workflow for Alpha Labs.
`
  );
  await writeFile(
    join(root, "alpha", "projects", "import-pipeline", "tasks", "seed-default", "TASK.md"),
    `---
name: Seed Default Company
---

Create the initial seeded company so the pipeline has a safe default target.
`
  );
  await writeFile(
    join(root, "alpha", "issues", "follow-up", "ISSUE.md"),
    `---
name: Follow Up Review
---

Double-check the import pipeline after the first successful run.
`
  );
  await writeFile(
    join(root, "nested", "beta", "COMPANY.md"),
    `---
name: Beta Works
description: Discovery fixture for Beta Works
slug: beta-works
schema: ${AGENT_COMPANIES_SCHEMA}
version: 2.0.0
---

Beta Works fixture company.
`
  );
  await mkdir(join(root, "nested", "beta", "agents", "operator"), { recursive: true });
  await writeFile(
    join(root, "nested", "beta", "agents", "operator", "AGENTS.md"),
    `---
name: Beta Operator
---

Operate the Beta Works delivery workflow.
`
  );
  await writeFile(
    join(root, "noise", "COMPANY.md"),
    `---
name: Not A Match
description: This should not be detected.
slug: not-a-match
schema: something-else/v1
---

Ignored fixture company.
`
  );

  await runCommand("git", ["init"], root);
  await runCommand("git", ["config", "user.name", "Codex Test"], root);
  await runCommand("git", ["config", "user.email", "codex@example.com"], root);
  await runCommand("git", ["add", "."], root);
  await runCommand("git", ["commit", "-m", "Initial fixture"], root);

  return root;
}

async function createIsolatedPaperclipAuthStore(): Promise<string> {
  const authRoot = await mkdtemp(join(tmpdir(), "paperclip-agent-companies-plugin-auth-"));
  const authStorePath = join(authRoot, "auth.json");
  tempDirectories.push(authRoot);
  await writeFile(authStorePath, JSON.stringify({}));
  return authStorePath;
}

async function setFixtureRepositoryVersion(
  repositoryRoot: string,
  version: string,
  companyName = "Alpha Labs"
): Promise<void> {
  await writeFile(
    join(repositoryRoot, "alpha", "COMPANY.md"),
    `---
name: ${companyName}
description: Discovery fixture for ${companyName}
slug: alpha-labs
schema: ${AGENT_COMPANIES_SCHEMA}
version: ${version}
---

${companyName} fixture company.
`
  );
}

async function addPaperclipAgentIconFixture(repositoryRoot: string): Promise<void> {
  await writeFile(
    join(repositoryRoot, "alpha", ".paperclip.yaml"),
    `schema: paperclip/v1
agents:
  ceo:
    adapter:
      type: codex_local
      config:
        model: gpt-5.4
  reviewer:
    icon: bot
    adapter:
      type: codex_local
`
  );

  await writeFile(
    join(repositoryRoot, "alpha", "agents", "ceo", "AGENTS.md"),
    `---
name: Alpha CEO
title: Chief Executive Officer
metadata:
  paperclip:
    agentIcon: crown
---

Lead Alpha Labs and coordinate the delivery pipeline.
`
  );

  await mkdir(join(repositoryRoot, "alpha", "agents", "reviewer"), { recursive: true });
  await writeFile(
    join(repositoryRoot, "alpha", "agents", "reviewer", "AGENTS.md"),
    `---
name: Alpha Reviewer
metadata:
  paperclip:
    agentIcon: crown
---

Review the work before it ships.
`
  );

  await mkdir(join(repositoryRoot, "alpha", "agents", "architect"), { recursive: true });
  await writeFile(
    join(repositoryRoot, "alpha", "agents", "architect", "AGENTS.md"),
    `---
name: Alpha Architect
metadata:
  paperclip:
    agentIcon: search-check
---

Design the next iteration of the platform.
`
  );
}

async function addRecurringTaskFixture(repositoryRoot: string): Promise<void> {
  await mkdir(join(repositoryRoot, "alpha", "tasks", "monday-review"), { recursive: true });
  await writeFile(
    join(repositoryRoot, "alpha", "tasks", "monday-review", "TASK.md"),
    `---
name: Monday Review
assignee: ceo
project: import-pipeline
recurring: true
---

Review pipeline health.
`
  );
  await writeFile(
    join(repositoryRoot, "alpha", ".paperclip.yaml"),
    `schema: paperclip/v1
routines:
  monday-review:
    status: paused
    triggers:
      - kind: schedule
        cronExpression: "0 9 * * 1"
        timezone: America/Chicago
      - kind: webhook
        enabled: false
        signingMode: hmac_sha256
`
  );
  await runCommand("git", ["add", "."], repositoryRoot);
  await runCommand("git", ["commit", "-m", "Add recurring task fixture"], repositoryRoot);
}

async function addProjectIssueFixture(repositoryRoot: string): Promise<void> {
  await mkdir(
    join(repositoryRoot, "alpha", "projects", "import-pipeline", "issues", "launch-readiness"),
    { recursive: true }
  );
  await writeFile(
    join(
      repositoryRoot,
      "alpha",
      "projects",
      "import-pipeline",
      "issues",
      "launch-readiness",
      "ISSUE.md"
    ),
    `---
name: Launch Readiness
assignee: ceo
---

Confirm the project is ready to launch.
`
  );
  await runCommand("git", ["add", "."], repositoryRoot);
  await runCommand("git", ["commit", "-m", "Add project issue fixture"], repositoryRoot);
}

describe("agent companies plugin", () => {
  it("declares the custom settings surface and required capabilities", () => {
    expect(manifest.description).toContain("Discover Agent Companies packages");
    expect(manifest.capabilities).toEqual([
      "instance.settings.register",
      "plugin.state.read",
      "plugin.state.write",
      "secrets.read-ref",
      "jobs.schedule",
      "http.outbound",
      "ui.page.register"
    ]);
    expect(manifest.instanceConfigSchema).toEqual({
      type: "object",
      properties: {
        boardAccessSecretRefs: {
          type: "object",
          description: "Internal allowlist of Paperclip board access secret references by company ID.",
          additionalProperties: {
            type: "string"
          }
        }
      }
    });
    expect(manifest.jobs).toEqual([
      {
        jobKey: "catalog-auto-sync",
        displayName: "Agent Company Auto-Sync",
        description:
          `Checks tracked agent companies every hour and syncs any source due for its configured auto-sync cadence (${DEFAULT_AUTO_SYNC_CADENCE_HOURS} hours by default).`,
        schedule: "0 * * * *"
      }
    ]);
    expect(manifest.entrypoints.ui).toBe("./dist/ui");
    expect(manifest.ui?.slots).toEqual([
      {
        type: "settingsPage",
        id: "agent-companies-settings",
        displayName: "Repository Catalog",
        exportName: "AgentCompaniesSettingsPage"
      }
    ]);
  });

  it("detects authenticated Paperclip deployments as requiring board access", () => {
    expect(
      requiresPaperclipBoardAccess({
        deploymentMode: "authenticated"
      })
    ).toBe(true);
    expect(
      requiresPaperclipBoardAccess({
        deploymentMode: "local"
      })
    ).toBe(false);
  });

  it("matches symlinked worker entrypoints to the real worker file", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "paperclip-agent-companies-plugin-worker-path-"));
    const realWorkerPath = join(tempDir, "worker.js");
    const symlinkWorkerPath = join(tempDir, "worker-symlink.js");

    try {
      await writeFile(realWorkerPath, "// test worker entrypoint\n");
      await symlink(realWorkerPath, symlinkWorkerPath);

      expect(shouldStartWorkerHost(pathToFileURL(realWorkerPath).href, symlinkWorkerPath)).toBe(true);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("rejects unrelated worker entrypoints", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "paperclip-agent-companies-plugin-worker-path-"));
    const realWorkerPath = join(tempDir, "worker.js");
    const unrelatedWorkerPath = join(tempDir, "other-worker.js");

    try {
      await writeFile(realWorkerPath, "// test worker entrypoint\n");
      await writeFile(unrelatedWorkerPath, "// different worker entrypoint\n");

      expect(shouldStartWorkerHost(pathToFileURL(realWorkerPath).href, unrelatedWorkerPath)).toBe(false);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("seeds and auto-scans the predefined repository on catalog.read", async () => {
    const plugin = createAgentCompaniesPlugin({
      scanRepository: async (repository) => [
        {
          id: `${repository.id}:agency-agents/COMPANY.md`,
          name: "Agency Agents",
          slug: "agency-agents",
          description: "Preloaded catalog fixture",
          schema: AGENT_COMPANIES_SCHEMA,
          version: "1.0.0",
          relativePath: "agency-agents",
          manifestPath: "agency-agents/COMPANY.md",
          contents: createEmptyCompanyContents()
        }
      ],
      now: () => "2026-04-14T08:00:00.000Z"
    });
    const harness = createTestHarness({
      manifest,
      capabilities: [...manifest.capabilities]
    });

    await expect(plugin.definition.setup(harness.ctx)).resolves.toBeUndefined();

    const data = await harness.getData<CatalogSnapshot>("catalog.read");

    expect(data.repositories).toHaveLength(1);
    expect(data.repositories[0]?.url).toBe(DEFAULT_REPOSITORY_URL);
    expect(data.repositories[0]?.status).toBe("ready");
    expect(data.companies).toHaveLength(1);
    expect(data.companies[0]?.name).toBe("Agency Agents");
    expect(data.companies[0]?.contents.skills).toEqual([]);
    expect(data.autoSyncCadenceHours).toBe(DEFAULT_AUTO_SYNC_CADENCE_HOURS);
    expect(data.summary.companyCount).toBe(1);
  });

  it("lets users remove the predefined source and add their own repositories", async () => {
    const repositoryPath = "/tmp/local-agent-company-repo";
    const plugin = createAgentCompaniesPlugin({
      scanRepository: async (repository) => [
        {
          id: `${repository.id}:local-company/COMPANY.md`,
          name: `${repository.label} Company`,
          slug: "local-company",
          description: "Local repository fixture",
          schema: AGENT_COMPANIES_SCHEMA,
          version: "0.2.0",
          relativePath: "local-company",
          manifestPath: "local-company/COMPANY.md",
          contents: createEmptyCompanyContents()
        }
      ],
      now: () => "2026-04-14T09:15:00.000Z"
    });
    const harness = createTestHarness({
      manifest,
      capabilities: [...manifest.capabilities]
    });

    await plugin.definition.setup(harness.ctx);

    const initialCatalog = await harness.getData<CatalogSnapshot>("catalog.read");
    expect(initialCatalog.repositories).toHaveLength(1);

    await harness.performAction("catalog.remove-repository", {
      repositoryId: initialCatalog.repositories[0]?.id
    });

    const afterRemove = await harness.getData<CatalogSnapshot>("catalog.read");
    expect(afterRemove.repositories).toHaveLength(0);
    expect(afterRemove.summary.repositoryCount).toBe(0);

    await harness.performAction("catalog.add-repository", {
      url: repositoryPath
    });

    const afterAdd = await harness.getData<CatalogSnapshot>("catalog.read");
    expect(afterAdd.repositories).toHaveLength(1);
    expect(afterAdd.repositories[0]?.url).toBe(repositoryPath);
    expect(afterAdd.repositories[0]?.label).toBe(basename(repositoryPath));
    expect(afterAdd.repositories[0]?.status).toBe("ready");
    expect(afterAdd.companies[0]?.slug).toBe("local-company");
  });

  it("normalizes GitHub owner/repo shorthand without breaking local relative paths", () => {
    const shorthandRepository = createRepositorySource("alvarosanchez/micronaut-agent-company");

    expect(shorthandRepository.url).toBe("https://github.com/alvarosanchez/micronaut-agent-company");
    expect(shorthandRepository.normalizedUrl).toBe(
      "https://github.com/alvarosanchez/micronaut-agent-company"
    );
    expect(shorthandRepository.label).toBe("alvarosanchez/micronaut-agent-company");

    expect(normalizeRepositoryReference("./fixtures/agent-company")).toBe("./fixtures/agent-company");
    expect(normalizeRepositoryCloneRef("../fixtures/agent-company")).toBe("../fixtures/agent-company");
  });

  it("drops unsafe persisted company content paths during catalog normalization", () => {
    const repository = createRepositorySource("/tmp/agent-company-repo");
    const state = normalizeCatalogState({
      repositories: [
        {
          ...repository,
          companies: [
            {
              id: `${repository.id}:alpha/COMPANY.md`,
              name: "Alpha Labs",
              slug: "alpha-labs",
              description: "Fixture company",
              schema: AGENT_COMPANIES_SCHEMA,
              version: "1.0.0",
              relativePath: "alpha",
              manifestPath: "alpha/COMPANY.md",
              contents: {
                agents: [
                  {
                    name: "Alpha CEO",
                    path: "agents/ceo/AGENTS.md",
                    paperclipAgentIcon: "crown"
                  },
                  {
                    name: "Unsafe parent traversal",
                    path: "../outside/AGENTS.md"
                  },
                  {
                    name: "Unsafe absolute path",
                    path: "/tmp/AGENTS.md"
                  }
                ],
                projects: [],
                tasks: [],
                issues: [],
                skills: []
              }
            }
          ]
        }
      ]
    });

    expect(state.repositories[0]?.companies[0]?.contents.agents).toEqual([
      {
        name: "Alpha CEO",
        path: "agents/ceo/AGENTS.md",
        paperclipAgentIcon: "crown"
      }
    ]);
  });

  it("surfaces metadata.paperclip.agentIcon in discovered agent contents", async () => {
    const repositoryPath = await createRepositoryFixture();
    await addPaperclipAgentIconFixture(repositoryPath);

    const plugin = createAgentCompaniesPlugin({
      now: () => "2026-04-14T09:20:00.000Z"
    });
    const harness = createTestHarness({
      manifest,
      capabilities: [...manifest.capabilities]
    });

    await harness.ctx.state.set(CATALOG_SCOPE, {
      repositories: [],
      updatedAt: "2026-04-14T09:00:00.000Z"
    });

    await plugin.definition.setup(harness.ctx);
    await harness.performAction("catalog.add-repository", {
      url: repositoryPath
    });

    const catalog = await harness.getData<CatalogSnapshot>("catalog.read");
    const company = catalog.companies.find((candidate) => candidate.slug === "alpha-labs");

    expect(
      company?.contents.agents.map((item) => ({
        name: item.name,
        path: item.path,
        paperclipAgentIcon: item.paperclipAgentIcon ?? null
      }))
    ).toEqual([
      {
        name: "Alpha Architect",
        path: "agents/architect/AGENTS.md",
        paperclipAgentIcon: "search-check"
      },
      {
        name: "Alpha CEO",
        path: "agents/ceo/AGENTS.md",
        paperclipAgentIcon: "crown"
      },
      {
        name: "Alpha Reviewer",
        path: "agents/reviewer/AGENTS.md",
        paperclipAgentIcon: "crown"
      }
    ]);
  });

  it("loads selected company markdown details on demand", async () => {
    const repositoryPath = await createRepositoryFixture();
    const plugin = createAgentCompaniesPlugin({
      now: () => "2026-04-14T09:20:00.000Z"
    });
    const harness = createTestHarness({
      manifest,
      capabilities: [...manifest.capabilities]
    });

    await harness.ctx.state.set(CATALOG_SCOPE, {
      repositories: [],
      updatedAt: "2026-04-14T09:00:00.000Z"
    });

    await plugin.definition.setup(harness.ctx);
    await harness.performAction("catalog.add-repository", {
      url: repositoryPath
    });

    const catalog = await harness.getData<CatalogSnapshot>("catalog.read");
    const company = catalog.companies.find((candidate) => candidate.slug === "alpha-labs");

    expect(company?.id).toBeTruthy();

    const detail = await harness.getData<CatalogCompanyContentDetail | null>(
      "catalog.company-content.read",
      {
        companyId: company?.id,
        itemPath: "skills/repo-audit/SKILL.md"
      }
    );

    expect(detail?.item.kind).toBe("skills");
    expect(detail?.item.fullPath).toBe("alpha/skills/repo-audit/SKILL.md");
    expect(detail?.item.frontmatter).toContain("name: Repo Audit");
    expect(detail?.item.markdown).toContain("## Checklist");
    expect(detail?.item.markdown).toContain("Review the repository layout");
  });

  it("surfaces recurring task metadata from Paperclip routine sidecars", async () => {
    const repositoryPath = await createRepositoryFixture();
    await addRecurringTaskFixture(repositoryPath);
    const plugin = createAgentCompaniesPlugin({
      now: () => "2026-04-14T09:20:00.000Z"
    });
    const harness = createTestHarness({
      manifest,
      capabilities: [...manifest.capabilities]
    });

    await harness.ctx.state.set(CATALOG_SCOPE, {
      repositories: [],
      updatedAt: "2026-04-14T09:00:00.000Z"
    });

    await plugin.definition.setup(harness.ctx);
    await harness.performAction("catalog.add-repository", {
      url: repositoryPath
    });

    const catalog = await harness.getData<CatalogSnapshot>("catalog.read");
    const company = catalog.companies.find((candidate) => candidate.slug === "alpha-labs");
    const recurringTask = company?.contents.tasks.find((item) => item.path === "tasks/monday-review/TASK.md");

    expect(recurringTask).toMatchObject({
      name: "Monday Review",
      path: "tasks/monday-review/TASK.md"
    });
    expect(recurringTask?.recurring).toBe(true);
    expect(recurringTask?.paperclipRoutineStatus).toBe("paused");
    expect(recurringTask?.paperclipRoutineTriggerCount).toBe(2);

    const detail = await harness.getData<CatalogCompanyContentDetail | null>(
      "catalog.company-content.read",
      {
        companyId: company?.id,
        itemPath: "tasks/monday-review/TASK.md"
      }
    );

    expect(detail?.item.kind).toBe("tasks");
    expect(detail?.item.fullPath).toBe("alpha/tasks/monday-review/TASK.md");
    expect(detail?.item.recurring).toBe(true);
    expect(detail?.item.paperclipRoutineStatus).toBe("paused");
    expect(detail?.item.paperclipRoutineTriggerCount).toBe(2);
    expect(detail?.item.frontmatter).toContain("recurring: true");
    expect(detail?.item.markdown).toContain("Review pipeline health.");
  });

  it("stages Paperclip extension metadata so routines only ship during the issue pass", () => {
    const source: CatalogPreparedCompanyImport["source"] = {
      type: "inline",
      files: {
        "COMPANY.md": `---
name: Alpha Labs
schema: ${AGENT_COMPANIES_SCHEMA}
---
`,
        ".paperclip.yaml": `schema: paperclip/v1
agents:
  ceo:
    icon: crown
routines:
  monday-review:
    status: paused
`
      }
    };

    const preIssueSource = buildStagedPaperclipImportSource(source, "pre_issues");
    const issueSource = buildStagedPaperclipImportSource(source, "issues");

    expect(parseYaml(source.files[".paperclip.yaml"] as string)).toEqual({
      schema: "paperclip/v1",
      agents: {
        ceo: {
          icon: "crown"
        }
      },
      routines: {
        "monday-review": {
          status: "paused"
        }
      }
    });
    expect(parseYaml(preIssueSource.files[".paperclip.yaml"] as string)).toEqual({
      schema: "paperclip/v1",
      agents: {
        ceo: {
          icon: "crown"
        }
      }
    });
    expect(parseYaml(issueSource.files[".paperclip.yaml"] as string)).toEqual({
      schema: "paperclip/v1",
      routines: {
        "monday-review": {
          status: "paused"
        }
      }
    });
  });

  it("builds imported company version labels for up-to-date imports", () => {
    expect(getImportedCompanyVersionInfo("1.0.0", "1.0.0")).toEqual({
      importedBadgeText: "Imported v1.0.0",
      latestBadgeText: null,
      summaryText: "Imported from v1.0.0"
    });
  });

  it("builds imported company version labels when a newer source version is available", () => {
    expect(getImportedCompanyVersionInfo("1.0.0", "1.1.0")).toEqual({
      importedBadgeText: "Imported v1.0.0",
      latestBadgeText: "Latest v1.1.0",
      summaryText: "Imported from v1.0.0; source now at v1.1.0"
    });
  });

  it("treats non-comparable source versions as unknown rather than newer", () => {
    expect(compareCatalogSourceVersions("release-2026-04", "release-2026-05")).toBe("different_unknown");
    expect(getImportedCompanyVersionInfo("release-2026-04", "release-2026-05")).toEqual({
      importedBadgeText: "Imported vrelease-2026-04",
      latestBadgeText: "Source vrelease-2026-05",
      summaryText: "Imported from vrelease-2026-04; source currently reports vrelease-2026-05"
    });
  });

  it("extracts recurring task definitions from a portable import source", () => {
    expect(
      extractPortableRecurringTaskDefinitions({
        "tasks/daily-review/TASK.md": `---
name: Daily Review
recurring: true
---

Check the queue.
`,
        "tasks/one-off/TASK.md": `---
name: One Off
---

Only do this once.
`,
        ".paperclip.yaml": `schema: paperclip/v1
routines:
  daily-review:
    status: active
`
      })
    ).toEqual([
      {
        slug: "daily-review",
        title: "Daily Review",
        description: "Check the queue."
      }
    ]);
  });

  it("selects older matching routines for archival after a replace import", () => {
    expect(
      findArchivableImportedRoutineIds(
        [
          {
            slug: "daily-review",
            title: "Daily Review",
            description: "Check the queue."
          }
        ],
        [
          {
            id: "routine-new",
            title: "Daily Review",
            description: "Check the queue.",
            status: "active",
            createdAt: "2026-04-22T05:16:44.000Z",
            updatedAt: "2026-04-22T05:16:44.000Z"
          },
          {
            id: "routine-old",
            title: "Daily Review",
            description: "Check the queue.",
            status: "active",
            createdAt: "2026-04-22T05:16:26.000Z",
            updatedAt: "2026-04-22T05:16:26.000Z"
          },
          {
            id: "routine-other",
            title: "Weekly Review",
            description: "Check something else.",
            status: "active",
            createdAt: "2026-04-22T05:16:26.000Z",
            updatedAt: "2026-04-22T05:16:26.000Z"
          }
        ]
      )
    ).toEqual(["routine-old"]);
  });

  it("packages a discovered company as an inline import source", async () => {
    const repositoryPath = await createRepositoryFixture();
    const plugin = createAgentCompaniesPlugin({
      now: () => "2026-04-14T09:22:00.000Z"
    });
    const harness = createTestHarness({
      manifest,
      capabilities: [...manifest.capabilities]
    });

    await harness.ctx.state.set(CATALOG_SCOPE, {
      repositories: [],
      updatedAt: "2026-04-14T09:00:00.000Z"
    });

    await plugin.definition.setup(harness.ctx);
    await harness.performAction("catalog.add-repository", {
      url: repositoryPath
    });

    const catalog = await harness.getData<CatalogSnapshot>("catalog.read");
    const company = catalog.companies.find((candidate) => candidate.slug === "alpha-labs");

    expect(company?.id).toBeTruthy();

    const prepared = await harness.performAction<CatalogPreparedCompanyImport>(
      "catalog.prepare-company-import",
      {
        companyId: company?.id
      }
    );

    expect(prepared.companyId).toBe(company?.id);
    expect(prepared.companyName).toBe("Alpha Labs");
    expect(prepared.selection).toEqual({
      agents: { mode: "all" },
      projects: { mode: "all" },
      tasks: { mode: "all" },
      issues: { mode: "all" },
      skills: { mode: "all" }
    });
    expect(prepared.source.type).toBe("inline");
    expect(prepared.stats.fileCount).toBeGreaterThanOrEqual(6);
    expect(prepared.stats.textFileCount).toBe(prepared.stats.fileCount);
    expect(Object.keys(prepared.source.files).sort()).toEqual([
      "COMPANY.md",
      "agents/ceo/AGENTS.md",
      "issues/follow-up/ISSUE.md",
      "projects/import-pipeline/PROJECT.md",
      "projects/import-pipeline/tasks/seed-default/TASK.md",
      "skills/repo-audit/SKILL.md",
      "skills/repo-audit/assets/icon.svg"
    ]);
    expect(typeof prepared.source.files["COMPANY.md"]).toBe("string");
    expect(typeof prepared.source.files["skills/repo-audit/assets/icon.svg"]).toBe("string");
  });

  it("packages selected company parts and items as an inline import source", async () => {
    const repositoryPath = await createRepositoryFixture();
    const plugin = createAgentCompaniesPlugin({
      now: () => "2026-04-14T09:22:05.000Z"
    });
    const harness = createTestHarness({
      manifest,
      capabilities: [...manifest.capabilities]
    });

    await harness.ctx.state.set(CATALOG_SCOPE, {
      repositories: [],
      updatedAt: "2026-04-14T09:00:00.000Z"
    });

    await plugin.definition.setup(harness.ctx);
    await harness.performAction("catalog.add-repository", {
      url: repositoryPath
    });

    const catalog = await harness.getData<CatalogSnapshot>("catalog.read");
    const company = catalog.companies.find((candidate) => candidate.slug === "alpha-labs");

    const prepared = await harness.performAction<CatalogPreparedCompanyImport>(
      "catalog.prepare-company-import",
      {
        companyId: company?.id,
        selection: {
          agents: { mode: "selected", itemPaths: ["agents/ceo/AGENTS.md"] },
          projects: { mode: "none" },
          tasks: { mode: "none" },
          issues: { mode: "none" },
          skills: { mode: "selected", itemPaths: ["skills/repo-audit/SKILL.md"] }
        }
      }
    );

    expect(prepared.selection).toEqual({
      agents: { mode: "selected", itemPaths: ["agents/ceo/AGENTS.md"] },
      projects: { mode: "none" },
      tasks: { mode: "none" },
      issues: { mode: "none" },
      skills: { mode: "selected", itemPaths: ["skills/repo-audit/SKILL.md"] }
    });
    expect(Object.keys(prepared.source.files).sort()).toEqual([
      "COMPANY.md",
      "agents/ceo/AGENTS.md",
      "skills/repo-audit/SKILL.md",
      "skills/repo-audit/assets/icon.svg"
    ]);
  });

  it("auto-includes required agents and projects when selected tasks depend on them", async () => {
    const repositoryPath = await createRepositoryFixture();
    await addRecurringTaskFixture(repositoryPath);
    const plugin = createAgentCompaniesPlugin({
      now: () => "2026-04-14T09:22:07.000Z"
    });
    const harness = createTestHarness({
      manifest,
      capabilities: [...manifest.capabilities]
    });

    await harness.ctx.state.set(CATALOG_SCOPE, {
      repositories: [],
      updatedAt: "2026-04-14T09:00:00.000Z"
    });

    await plugin.definition.setup(harness.ctx);
    await harness.performAction("catalog.add-repository", {
      url: repositoryPath
    });

    const catalog = await harness.getData<CatalogSnapshot>("catalog.read");
    const company = catalog.companies.find((candidate) => candidate.slug === "alpha-labs");

    const prepared = await harness.performAction<CatalogPreparedCompanyImport>(
      "catalog.prepare-company-import",
      {
        companyId: company?.id,
        selection: {
          agents: { mode: "none" },
          projects: { mode: "none" },
          tasks: { mode: "selected", itemPaths: ["tasks/monday-review/TASK.md"] },
          issues: { mode: "none" },
          skills: { mode: "none" }
        }
      }
    );

    expect(prepared.selection).toEqual({
      agents: { mode: "selected", itemPaths: ["agents/ceo/AGENTS.md"] },
      projects: { mode: "selected", itemPaths: ["projects/import-pipeline/PROJECT.md"] },
      tasks: { mode: "selected", itemPaths: ["tasks/monday-review/TASK.md"] },
      issues: { mode: "none" },
      skills: { mode: "none" }
    });
    expect(Object.keys(prepared.source.files).sort()).toEqual([
      ".paperclip.yaml",
      "COMPANY.md",
      "agents/ceo/AGENTS.md",
      "projects/import-pipeline/PROJECT.md",
      "tasks/monday-review/TASK.md"
    ]);
  });

  it("auto-includes required projects and agents for selected Paperclip issue manifests", async () => {
    const repositoryPath = await createRepositoryFixture();
    await addProjectIssueFixture(repositoryPath);
    const plugin = createAgentCompaniesPlugin({
      now: () => "2026-04-14T09:22:08.000Z"
    });
    const harness = createTestHarness({
      manifest,
      capabilities: [...manifest.capabilities]
    });

    await harness.ctx.state.set(CATALOG_SCOPE, {
      repositories: [],
      updatedAt: "2026-04-14T09:00:00.000Z"
    });

    await plugin.definition.setup(harness.ctx);
    await harness.performAction("catalog.add-repository", {
      url: repositoryPath
    });

    const catalog = await harness.getData<CatalogSnapshot>("catalog.read");
    const company = catalog.companies.find((candidate) => candidate.slug === "alpha-labs");

    const prepared = await harness.performAction<CatalogPreparedCompanyImport>(
      "catalog.prepare-company-import",
      {
        companyId: company?.id,
        selection: {
          agents: { mode: "none" },
          projects: { mode: "none" },
          tasks: { mode: "none" },
          issues: {
            mode: "selected",
            itemPaths: ["projects/import-pipeline/issues/launch-readiness/ISSUE.md"]
          },
          skills: { mode: "none" }
        }
      }
    );

    expect(prepared.selection).toEqual({
      agents: { mode: "selected", itemPaths: ["agents/ceo/AGENTS.md"] },
      projects: { mode: "selected", itemPaths: ["projects/import-pipeline/PROJECT.md"] },
      tasks: { mode: "none" },
      issues: {
        mode: "selected",
        itemPaths: ["projects/import-pipeline/issues/launch-readiness/ISSUE.md"]
      },
      skills: { mode: "none" }
    });
    expect(Object.keys(prepared.source.files).sort()).toEqual([
      "COMPANY.md",
      "agents/ceo/AGENTS.md",
      "projects/import-pipeline/PROJECT.md",
      "projects/import-pipeline/issues/launch-readiness/ISSUE.md"
    ]);
  });

  it("omits common secret-bearing files from inline import sources", async () => {
    const repositoryPath = await createRepositoryFixture();
    await mkdir(join(repositoryPath, "alpha", "docs"), { recursive: true });
    await mkdir(join(repositoryPath, "alpha", ".ssh"), { recursive: true });
    await writeFile(join(repositoryPath, "alpha", "docs", "overview.md"), "# Overview\n");
    await writeFile(join(repositoryPath, "alpha", ".env.production"), "TOKEN=top-secret\n");
    await writeFile(
      join(repositoryPath, "alpha", ".git-credentials"),
      "https://token:x-oauth-basic@github.com\n"
    );
    await writeFile(
      join(repositoryPath, "alpha", ".npmrc"),
      "//registry.npmjs.org/:_authToken=top-secret\n"
    );
    await writeFile(join(repositoryPath, "alpha", ".ssh", "id_ed25519"), "PRIVATE KEY\n");

    const plugin = createAgentCompaniesPlugin({
      now: () => "2026-04-14T09:22:10.000Z"
    });
    const harness = createTestHarness({
      manifest,
      capabilities: [...manifest.capabilities]
    });

    await harness.ctx.state.set(CATALOG_SCOPE, {
      repositories: [],
      updatedAt: "2026-04-14T09:00:00.000Z"
    });

    await plugin.definition.setup(harness.ctx);
    await harness.performAction("catalog.add-repository", {
      url: repositoryPath
    });

    const catalog = await harness.getData<CatalogSnapshot>("catalog.read");
    const company = catalog.companies.find((candidate) => candidate.slug === "alpha-labs");
    const companyId = company?.id;
    expect(companyId).toBeTruthy();
    const prepared = await harness.performAction<CatalogPreparedCompanyImport>(
      "catalog.prepare-company-import",
      {
        companyId: companyId!
      }
    );
    const filePaths = Object.keys(prepared.source.files).sort();

    expect(filePaths).toContain("docs/overview.md");
    expect(filePaths).not.toContain(".env.production");
    expect(filePaths).not.toContain(".git-credentials");
    expect(filePaths).not.toContain(".npmrc");
    expect(filePaths).not.toContain(".ssh/id_ed25519");
  });

  it("keeps non-item files when the default selection covers every available item", async () => {
    const repositoryPath = await createRepositoryFixture();
    await mkdir(join(repositoryPath, "nested", "beta", "docs"), { recursive: true });
    await writeFile(join(repositoryPath, "nested", "beta", "docs", "overview.md"), "# Beta Overview\n");

    const plugin = createAgentCompaniesPlugin({
      now: () => "2026-04-14T09:22:12.000Z"
    });
    const harness = createTestHarness({
      manifest,
      capabilities: [...manifest.capabilities]
    });

    await harness.ctx.state.set(CATALOG_SCOPE, {
      repositories: [],
      updatedAt: "2026-04-14T09:00:00.000Z"
    });

    await plugin.definition.setup(harness.ctx);
    await harness.performAction("catalog.add-repository", {
      url: repositoryPath
    });

    const catalog = await harness.getData<CatalogSnapshot>("catalog.read");
    const company = catalog.companies.find((candidate) => candidate.slug === "beta-works");
    const prepared = await harness.performAction<CatalogPreparedCompanyImport>(
      "catalog.prepare-company-import",
      {
        companyId: company?.id
      }
    );

    expect(prepared.selection).toEqual({
      agents: { mode: "all" },
      projects: { mode: "none" },
      tasks: { mode: "none" },
      issues: { mode: "none" },
      skills: { mode: "none" }
    });
    expect(Object.keys(prepared.source.files).sort()).toEqual([
      "COMPANY.md",
      "agents/operator/AGENTS.md",
      "docs/overview.md"
    ]);
  });

  it("merges metadata.paperclip.agentIcon into the inline Paperclip extension", async () => {
    const repositoryPath = await createRepositoryFixture();
    await addPaperclipAgentIconFixture(repositoryPath);

    const plugin = createAgentCompaniesPlugin({
      now: () => "2026-04-14T09:22:15.000Z"
    });
    const harness = createTestHarness({
      manifest,
      capabilities: [...manifest.capabilities]
    });

    await harness.ctx.state.set(CATALOG_SCOPE, {
      repositories: [],
      updatedAt: "2026-04-14T09:00:00.000Z"
    });

    await plugin.definition.setup(harness.ctx);
    await harness.performAction("catalog.add-repository", {
      url: repositoryPath
    });

    const catalog = await harness.getData<CatalogSnapshot>("catalog.read");
    const company = catalog.companies.find((candidate) => candidate.slug === "alpha-labs");
    const prepared = await harness.performAction<CatalogPreparedCompanyImport>(
      "catalog.prepare-company-import",
      {
        companyId: company?.id
      }
    );
    const extensionYaml = prepared.source.files[".paperclip.yaml"];
    const extension = parseYaml(typeof extensionYaml === "string" ? extensionYaml : "") as {
      schema?: string;
      agents?: Record<string, { icon?: string; adapter?: { type?: string } }>;
    };

    expect(extension.schema).toBe("paperclip/v1");
    expect(extension.agents?.ceo?.icon).toBe("crown");
    expect(extension.agents?.ceo?.adapter?.type).toBe("codex_local");
    expect(extension.agents?.reviewer?.icon).toBe("bot");
    expect(extension.agents?.architect?.icon).toBeUndefined();
  });

  it("does not retarget authenticated Paperclip requests from action payload api bases", async () => {
    const repositoryPath = await createRepositoryFixture();
    await addPaperclipAgentIconFixture(repositoryPath);

    const previousApiUrl = process.env.PAPERCLIP_API_URL;
    const previousApiKey = process.env.PAPERCLIP_API_KEY;
    const originalFetch = globalThis.fetch;
    const fetchRequests: Array<{ url: string; authorization: string | null; body: unknown }> = [];

    process.env.PAPERCLIP_API_URL = "http://127.0.0.1:3210";
    process.env.PAPERCLIP_API_KEY = "paperclip-secret";
    globalThis.fetch = async (input, init) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const headers = new Headers(init?.headers);
      const bodyText = typeof init?.body === "string" ? init.body : null;
      fetchRequests.push({
        url,
        authorization: headers.get("authorization"),
        body: bodyText ? JSON.parse(bodyText) : null
      });

      return new Response("- crown\n- bot\n", {
        status: 200,
        headers: {
          "content-type": "text/plain"
        }
      });
    };

    try {
      const plugin = createAgentCompaniesPlugin({
        now: () => "2026-04-14T09:22:20.000Z"
      });
      const harness = createTestHarness({
        manifest,
        capabilities: [...manifest.capabilities]
      });

      await harness.ctx.state.set(CATALOG_SCOPE, {
        repositories: [],
        updatedAt: "2026-04-14T09:00:00.000Z"
      });

      await plugin.definition.setup(harness.ctx);
      await harness.performAction("catalog.add-repository", {
        url: repositoryPath
      });

      const catalog = await harness.getData<CatalogSnapshot>("catalog.read");
      const company = catalog.companies.find((candidate) => candidate.slug === "alpha-labs");
      const companyId = company?.id;

      expect(companyId).toBeTruthy();

      await harness.performAction<CatalogPreparedCompanyImport>("catalog.prepare-company-import", {
        companyId: companyId!,
        paperclipApiBase: "https://evil.example"
      });

      expect(fetchRequests).toHaveLength(1);
      expect(fetchRequests[0]?.url).toBe("http://127.0.0.1:3210/llms/agent-icons.txt");
      expect(fetchRequests[0]?.authorization).toBe("Bearer paperclip-secret");
    } finally {
      globalThis.fetch = originalFetch;
      if (previousApiUrl === undefined) {
        delete process.env.PAPERCLIP_API_URL;
      } else {
        process.env.PAPERCLIP_API_URL = previousApiUrl;
      }

      if (previousApiKey === undefined) {
        delete process.env.PAPERCLIP_API_KEY;
      } else {
        process.env.PAPERCLIP_API_KEY = previousApiKey;
      }
    }
  });

  it("reports company-scoped board access registration without resolving the saved secret", async () => {
    const plugin = createAgentCompaniesPlugin({
      now: () => "2026-04-14T09:22:25.000Z"
    });
    const harness = createTestHarness({
      manifest,
      capabilities: [...manifest.capabilities]
    });

    await plugin.definition.setup(harness.ctx);

    const initial = await harness.getData<{
      companyId: string | null;
      configured: boolean;
      identity: string | null;
      updatedAt: string | null;
    }>("board-access.read", {
      companyId: "paperclip-company-123"
    });

    expect(initial).toEqual({
      companyId: "paperclip-company-123",
      configured: false,
      identity: null,
      updatedAt: null
    });

    await harness.performAction("board-access.update", {
      companyId: "paperclip-company-123",
      paperclipBoardApiTokenRef: "secret-board-token-ref",
      identity: "Agent Operator"
    });

    const updated = await harness.getData<{
      companyId: string | null;
      configured: boolean;
      identity: string | null;
      updatedAt: string | null;
    }>("board-access.read", {
      companyId: "paperclip-company-123"
    });

    expect(updated).toEqual({
      companyId: "paperclip-company-123",
      configured: true,
      identity: "Agent Operator",
      updatedAt: "2026-04-14T09:22:25.000Z"
    });
  });

  it("uses saved company board access secrets for authenticated sync imports", async () => {
    const repositoryPath = await createRepositoryFixture();
    const previousApiUrl = process.env.PAPERCLIP_API_URL;
    const previousApiKey = process.env.PAPERCLIP_API_KEY;
    const originalFetch = globalThis.fetch;
    const fetchRequests: Array<{ url: string; authorization: string | null; body: unknown }> = [];

    process.env.PAPERCLIP_API_URL = "http://127.0.0.1:3210";
    delete process.env.PAPERCLIP_API_KEY;
    globalThis.fetch = async (input, init) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const headers = new Headers(init?.headers);
      const bodyText = typeof init?.body === "string" ? init.body : null;
      fetchRequests.push({
        url,
        authorization: headers.get("authorization"),
        body: bodyText ? JSON.parse(bodyText) : null
      });

      if (url === "http://127.0.0.1:3210/api/companies/paperclip-company-123/issues") {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        });
      }

      if (url === "http://127.0.0.1:3210/api/companies/paperclip-company-123/agents") {
        return new Response(
          JSON.stringify([
            {
              id: "agent-123",
              name: "Alpha CEO",
              urlKey: "ceo",
              status: "pending_approval",
              role: "ceo",
              title: "Chief Executive Officer"
            }
          ]),
          {
            status: 200,
            headers: {
              "content-type": "application/json"
            }
          }
        );
      }

      if (url === "http://127.0.0.1:3210/api/companies/paperclip-company-123/approvals") {
        return new Response(JSON.stringify({ id: "approval-123" }), {
          status: 201,
          headers: {
            "content-type": "application/json"
          }
        });
      }

      if (url === "http://127.0.0.1:3210/api/approvals/approval-123/approve") {
        return new Response(JSON.stringify({ id: "approval-123", status: "approved" }), {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        });
      }

      if (url === "http://127.0.0.1:3210/api/companies/import") {
        const parsedBody = bodyText ? JSON.parse(bodyText) : null;
        const issuesIncluded = parsedBody?.include?.issues === true;

        return new Response(
          JSON.stringify({
            company: {
              id: "paperclip-company-123",
              name: "Alpha Labs Imported",
              action: "updated"
            },
            agents: issuesIncluded ? [] : [{ action: "updated" }],
            projects: issuesIncluded ? [] : [{ action: "updated" }],
            issues: issuesIncluded ? [{ action: "updated" }] : [],
            skills: issuesIncluded ? [] : [{ action: "updated" }],
            warnings: []
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json"
            }
          }
        );
      }

      throw new Error(`Unexpected fetch to ${url}`);
    };

    try {
      const plugin = createAgentCompaniesPlugin({
        now: () => "2026-04-14T09:23:00.000Z",
        startupAutoSyncDelayMs: null
      });
      const harness = createTestHarness({
        manifest,
        capabilities: [...manifest.capabilities]
      });

      await harness.ctx.state.set(CATALOG_SCOPE, {
        repositories: [],
        updatedAt: "2026-04-14T09:00:00.000Z"
      });

      await plugin.definition.setup(harness.ctx);
      await harness.performAction("catalog.add-repository", {
        url: repositoryPath
      });

      const catalog = await harness.getData<CatalogSnapshot>("catalog.read");
      const company = catalog.companies.find((candidate) => candidate.slug === "alpha-labs");

      expect(company?.id).toBeTruthy();

      await harness.performAction("catalog.record-company-import", {
        sourceCompanyId: company?.id,
        importedCompanyId: "paperclip-company-123",
        importedCompanyName: "Alpha Labs Imported",
        importedCompanyIssuePrefix: "ALP"
      });
      await setFixtureRepositoryVersion(repositoryPath, "1.1.0");
      await harness.performAction("board-access.update", {
        companyId: "paperclip-company-123",
        paperclipBoardApiTokenRef: "secret-board-token-ref",
        identity: "Agent Operator"
      });

      (harness.ctx.secrets as { resolve(secretRef: string): Promise<string> }).resolve = async (secretRef: string) => {
        expect(secretRef).toBe("secret-board-token-ref");
        return "paperclip-board-token";
      };

      await harness.performAction<CatalogCompanySyncResult>("catalog.sync-company", {
        sourceCompanyId: company?.id,
        importedCompanyId: "paperclip-company-123"
      });

      expect(fetchRequests).toEqual([
        {
          url: "http://127.0.0.1:3210/api/companies/paperclip-company-123/issues",
          authorization: "Bearer paperclip-board-token",
          body: null
        },
        expect.objectContaining({
          url: "http://127.0.0.1:3210/api/companies/import",
          authorization: "Bearer paperclip-board-token",
          body: expect.objectContaining({
            include: {
              company: false,
              agents: true,
              projects: true,
              issues: false,
              skills: true
            },
            target: {
              mode: "existing_company",
              companyId: "paperclip-company-123"
            },
            collisionStrategy: DEFAULT_SYNC_COLLISION_STRATEGY
          })
        }),
        {
          url: "http://127.0.0.1:3210/api/companies/paperclip-company-123/agents",
          authorization: "Bearer paperclip-board-token",
          body: null
        },
        {
          url: "http://127.0.0.1:3210/api/companies/paperclip-company-123/approvals",
          authorization: "Bearer paperclip-board-token",
          body: {
            type: "hire_agent",
            payload: {
              agentId: "agent-123",
              name: "Alpha CEO",
              role: "ceo",
              title: "Chief Executive Officer"
            }
          }
        },
        {
          url: "http://127.0.0.1:3210/api/approvals/approval-123/approve",
          authorization: "Bearer paperclip-board-token",
          body: {
            decisionNote: "Approved automatically during Agent Company sync so imported tasks can wake Alpha CEO immediately."
          }
        },
        expect.objectContaining({
          url: "http://127.0.0.1:3210/api/companies/import",
          authorization: "Bearer paperclip-board-token",
          body: expect.objectContaining({
            include: {
              company: false,
              agents: false,
              projects: false,
              issues: true,
              skills: false
            },
            target: {
              mode: "existing_company",
              companyId: "paperclip-company-123"
            },
            collisionStrategy: DEFAULT_SYNC_COLLISION_STRATEGY
          })
        }),
        {
          url: "http://127.0.0.1:3210/api/companies/paperclip-company-123/issues",
          authorization: "Bearer paperclip-board-token",
          body: null
        }
      ]);
    } finally {
      globalThis.fetch = originalFetch;
      if (previousApiUrl === undefined) {
        delete process.env.PAPERCLIP_API_URL;
      } else {
        process.env.PAPERCLIP_API_URL = previousApiUrl;
      }

      if (previousApiKey === undefined) {
        delete process.env.PAPERCLIP_API_KEY;
      } else {
        process.env.PAPERCLIP_API_KEY = previousApiKey;
      }
    }
  });

  it("blocks sync with a clear message when authenticated deployments need board access", async () => {
    const repositoryPath = await createRepositoryFixture();
    const previousApiUrl = process.env.PAPERCLIP_API_URL;
    const previousApiKey = process.env.PAPERCLIP_API_KEY;
    const previousPaperclipAuthStore = process.env.PAPERCLIP_AUTH_STORE;
    const originalFetch = globalThis.fetch;
    const fetchRequests: string[] = [];

    process.env.PAPERCLIP_API_URL = "http://127.0.0.1:3210";
    delete process.env.PAPERCLIP_API_KEY;
    process.env.PAPERCLIP_AUTH_STORE = await createIsolatedPaperclipAuthStore();
    globalThis.fetch = async (input) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      fetchRequests.push(url);

      if (url === "http://127.0.0.1:3210/api/companies/paperclip-company-123/issues") {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        });
      }

      if (url === "http://127.0.0.1:3210/api/health") {
        return new Response(
          JSON.stringify({
            deploymentMode: "authenticated"
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json"
            }
          }
        );
      }

      throw new Error(`Unexpected fetch to ${url}`);
    };

    try {
      const plugin = createAgentCompaniesPlugin({
        now: () => "2026-04-14T09:23:00.000Z",
        startupAutoSyncDelayMs: null
      });
      const harness = createTestHarness({
        manifest,
        capabilities: [...manifest.capabilities]
      });

      await harness.ctx.state.set(CATALOG_SCOPE, {
        repositories: [],
        updatedAt: "2026-04-14T09:00:00.000Z"
      });

      await plugin.definition.setup(harness.ctx);
      await harness.performAction("catalog.add-repository", {
        url: repositoryPath
      });

      const catalog = await harness.getData<CatalogSnapshot>("catalog.read");
      const company = catalog.companies.find((candidate) => candidate.slug === "alpha-labs");

      await harness.performAction("catalog.record-company-import", {
        sourceCompanyId: company?.id,
        importedCompanyId: "paperclip-company-123",
        importedCompanyName: "Alpha Labs Imported",
        importedCompanyIssuePrefix: "ALP"
      });
      await setFixtureRepositoryVersion(repositoryPath, "1.1.0");

      await expect(
        harness.performAction("catalog.sync-company", {
          sourceCompanyId: company?.id,
          importedCompanyId: "paperclip-company-123"
        })
      ).rejects.toThrow(
        /Board access required\. Open Agent Companies Plugin settings inside the imported company, connect board access, and retry sync\./u
      );

      expect(fetchRequests).toEqual([
        "http://127.0.0.1:3210/api/companies/paperclip-company-123/issues",
        "http://127.0.0.1:3210/api/health"
      ]);
    } finally {
      globalThis.fetch = originalFetch;
      if (previousApiUrl === undefined) {
        delete process.env.PAPERCLIP_API_URL;
      } else {
        process.env.PAPERCLIP_API_URL = previousApiUrl;
      }

      if (previousApiKey === undefined) {
        delete process.env.PAPERCLIP_API_KEY;
      } else {
        process.env.PAPERCLIP_API_KEY = previousApiKey;
      }

      if (previousPaperclipAuthStore === undefined) {
        delete process.env.PAPERCLIP_AUTH_STORE;
      } else {
        process.env.PAPERCLIP_AUTH_STORE = previousPaperclipAuthStore;
      }
    }
  });

  it.each([401, 403])(
    "falls back to board access guidance when the import api returns %i",
    async (statusCode) => {
      const repositoryPath = await createRepositoryFixture();
      const previousApiUrl = process.env.PAPERCLIP_API_URL;
      const previousApiKey = process.env.PAPERCLIP_API_KEY;
      const previousPaperclipAuthStore = process.env.PAPERCLIP_AUTH_STORE;
      const originalFetch = globalThis.fetch;
      const fetchRequests: string[] = [];

      process.env.PAPERCLIP_API_URL = "http://127.0.0.1:3210";
      delete process.env.PAPERCLIP_API_KEY;
      process.env.PAPERCLIP_AUTH_STORE = await createIsolatedPaperclipAuthStore();
      globalThis.fetch = async (input) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        fetchRequests.push(url);

        if (url === "http://127.0.0.1:3210/api/companies/paperclip-company-123/issues") {
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: {
              "content-type": "application/json"
            }
          });
        }

        if (url === "http://127.0.0.1:3210/api/health") {
          return new Response(
            JSON.stringify({
              deploymentMode: "local"
            }),
            {
              status: 200,
              headers: {
                "content-type": "application/json"
              }
            }
          );
        }

        if (url === "http://127.0.0.1:3210/api/companies/import") {
          return new Response(
            JSON.stringify({
              error: statusCode === 401 ? "Unauthorized" : "Forbidden"
            }),
            {
              status: statusCode,
              headers: {
                "content-type": "application/json"
              }
            }
          );
        }

        throw new Error(`Unexpected fetch to ${url}`);
      };

      try {
        const plugin = createAgentCompaniesPlugin({
          now: () => "2026-04-14T09:23:00.000Z",
          startupAutoSyncDelayMs: null
        });
        const harness = createTestHarness({
          manifest,
          capabilities: [...manifest.capabilities]
        });

        await harness.ctx.state.set(CATALOG_SCOPE, {
          repositories: [],
          updatedAt: "2026-04-14T09:00:00.000Z"
        });

        await plugin.definition.setup(harness.ctx);
        await harness.performAction("catalog.add-repository", {
          url: repositoryPath
        });

        const catalog = await harness.getData<CatalogSnapshot>("catalog.read");
        const company = catalog.companies.find((candidate) => candidate.slug === "alpha-labs");

        await harness.performAction("catalog.record-company-import", {
          sourceCompanyId: company?.id,
          importedCompanyId: "paperclip-company-123",
          importedCompanyName: "Alpha Labs Imported",
          importedCompanyIssuePrefix: "ALP"
        });
        await setFixtureRepositoryVersion(repositoryPath, "1.1.0");

        await expect(
          harness.performAction("catalog.sync-company", {
            sourceCompanyId: company?.id,
            importedCompanyId: "paperclip-company-123"
          })
        ).rejects.toThrow(
          /Board access required\. Open Agent Companies Plugin settings inside the imported company, connect board access, and retry sync\./u
        );

        expect(fetchRequests).toEqual([
          "http://127.0.0.1:3210/api/companies/paperclip-company-123/issues",
          "http://127.0.0.1:3210/api/health",
          "http://127.0.0.1:3210/api/companies/import"
        ]);
      } finally {
        globalThis.fetch = originalFetch;
        if (previousApiUrl === undefined) {
          delete process.env.PAPERCLIP_API_URL;
        } else {
          process.env.PAPERCLIP_API_URL = previousApiUrl;
        }

        if (previousApiKey === undefined) {
          delete process.env.PAPERCLIP_API_KEY;
        } else {
          process.env.PAPERCLIP_API_KEY = previousApiKey;
        }

        if (previousPaperclipAuthStore === undefined) {
          delete process.env.PAPERCLIP_AUTH_STORE;
        } else {
          process.env.PAPERCLIP_AUTH_STORE = previousPaperclipAuthStore;
        }
      }
    }
  );

  it("rejects inline import sources with oversized files", async () => {
    const repositoryPath = await createRepositoryFixture();
    await mkdir(join(repositoryPath, "alpha", "assets"), { recursive: true });
    await writeFile(
      join(repositoryPath, "alpha", "assets", "oversized.bin"),
      Buffer.alloc(1024 * 1024 + 1, 1)
    );

    const plugin = createAgentCompaniesPlugin({
      now: () => "2026-04-14T09:22:30.000Z"
    });
    const harness = createTestHarness({
      manifest,
      capabilities: [...manifest.capabilities]
    });

    await harness.ctx.state.set(CATALOG_SCOPE, {
      repositories: [],
      updatedAt: "2026-04-14T09:00:00.000Z"
    });

    await plugin.definition.setup(harness.ctx);
    await harness.performAction("catalog.add-repository", {
      url: repositoryPath
    });

    const catalog = await harness.getData<CatalogSnapshot>("catalog.read");
    const company = catalog.companies.find((candidate) => candidate.slug === "alpha-labs");

    await expect(
      harness.performAction("catalog.prepare-company-import", {
        companyId: company?.id
      })
    ).rejects.toThrow(
      /File "assets\/oversized\.bin" is .*per-file limit of 1\.0 MiB\./u
    );
  });

  it("tracks multiple imported companies for one discovered source and keeps import preparation available", async () => {
    const repositoryPath = await createRepositoryFixture();
    const plugin = createAgentCompaniesPlugin({
      now: () => "2026-04-14T09:23:00.000Z"
    });
    const harness = createTestHarness({
      manifest,
      capabilities: [...manifest.capabilities]
    });

    await harness.ctx.state.set(CATALOG_SCOPE, {
      repositories: [],
      updatedAt: "2026-04-14T09:00:00.000Z"
    });

    await plugin.definition.setup(harness.ctx);
    await harness.performAction("catalog.add-repository", {
      url: repositoryPath
    });

    const catalog = await harness.getData<CatalogSnapshot>("catalog.read");
    const company = catalog.companies.find((candidate) => candidate.slug === "alpha-labs");

    expect(company?.importedCompanies).toEqual([]);

    await harness.performAction("catalog.record-company-import", {
      sourceCompanyId: company?.id,
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
    await harness.performAction("catalog.record-company-import", {
      sourceCompanyId: company?.id,
      importedCompanyId: "paperclip-company-456",
      importedCompanyName: "Alpha Labs Sandbox",
      importedCompanyIssuePrefix: "ALPS"
    });

    const afterImportRecord = await harness.getData<CatalogSnapshot>("catalog.read");
    const discoveredCompany = afterImportRecord.companies.find(
      (candidate) => candidate.id === company?.id
    );

    expect(discoveredCompany?.importedCompanies).toHaveLength(2);
    expect(discoveredCompany?.importedCompanies.map((candidate) => candidate.id)).toEqual([
      "paperclip-company-123",
      "paperclip-company-456"
    ]);
    expect(afterImportRecord.importedCompanies).toHaveLength(2);
    expect(afterImportRecord.importedCompanies.map((candidate) => candidate.id)).toEqual([
      "paperclip-company-123",
      "paperclip-company-456"
    ]);
    for (const importedCompany of afterImportRecord.importedCompanies) {
      expect(importedCompany).not.toHaveProperty("importedCompanies");
    }
    expect(
      afterImportRecord.importedCompanies
        .filter((candidate) => candidate.sourceCompanyId === company?.id)
        .map((candidate) => ({
        id: candidate.importedCompany.id,
        name: candidate.importedCompany.name,
        issuePrefix: candidate.importedCompany.issuePrefix,
        importedSourceVersion: candidate.importedCompany.importedSourceVersion,
        selection: candidate.importedCompany.selection,
        syncCollisionStrategy: candidate.importedCompany.syncCollisionStrategy
      }))
    ).toEqual([
      {
        id: "paperclip-company-123",
        name: "Alpha Labs Imported",
        issuePrefix: "ALP",
        importedSourceVersion: "1.0.0",
        selection: {
          agents: { mode: "selected", itemPaths: ["agents/ceo/AGENTS.md"] },
          projects: { mode: "none" },
          tasks: { mode: "none" },
          issues: { mode: "none" },
          skills: { mode: "none" }
        },
        syncCollisionStrategy: "skip"
      },
      {
        id: "paperclip-company-456",
        name: "Alpha Labs Sandbox",
        issuePrefix: "ALPS",
        importedSourceVersion: "1.0.0",
        selection: {
          agents: { mode: "all" },
          projects: { mode: "all" },
          tasks: { mode: "all" },
          issues: { mode: "all" },
          skills: { mode: "all" }
        },
        syncCollisionStrategy: DEFAULT_SYNC_COLLISION_STRATEGY
      }
    ]);

    const preparedImport = await harness.performAction<CatalogPreparedCompanyImport>(
      "catalog.prepare-company-import",
      {
        companyId: company?.id
      }
    );
    expect(preparedImport.companyId).toBe(company?.id);
  });

  it("updates an existing tracked import contract when the same company is re-imported", async () => {
    const repositoryPath = await createRepositoryFixture();
    const plugin = createAgentCompaniesPlugin({
      now: () => "2026-04-14T09:23:05.000Z"
    });
    const harness = createTestHarness({
      manifest,
      capabilities: [...manifest.capabilities]
    });

    await harness.ctx.state.set(CATALOG_SCOPE, {
      repositories: [],
      updatedAt: "2026-04-14T09:00:00.000Z"
    });

    await plugin.definition.setup(harness.ctx);
    await harness.performAction("catalog.add-repository", {
      url: repositoryPath
    });

    const catalog = await harness.getData<CatalogSnapshot>("catalog.read");
    const company = catalog.companies.find((candidate) => candidate.slug === "alpha-labs");

    await harness.performAction("catalog.record-company-import", {
      sourceCompanyId: company?.id,
      importedCompanyId: "paperclip-company-123",
      importedCompanyName: "Alpha Labs Imported",
      importedCompanyIssuePrefix: "ALP"
    });

    const afterReimport = await harness.performAction<CatalogSnapshot>("catalog.record-company-import", {
      sourceCompanyId: company?.id,
      importedCompanyId: "paperclip-company-123",
      importedCompanyName: "Alpha Labs Imported",
      importedCompanyIssuePrefix: "ALP",
      selection: {
        agents: { mode: "none" },
        projects: { mode: "selected", itemPaths: ["projects/import-pipeline/PROJECT.md"] },
        tasks: { mode: "none" },
        issues: { mode: "selected", itemPaths: ["issues/follow-up/ISSUE.md"] },
        skills: { mode: "none" }
      },
      syncCollisionStrategy: "rename"
    });

    expect(
      afterReimport.importedCompanies.filter(
        (candidate) => candidate.importedCompany.id === "paperclip-company-123"
      )
    ).toHaveLength(1);
    expect(
      afterReimport.importedCompanies.find(
        (candidate) => candidate.importedCompany.id === "paperclip-company-123"
      )?.importedCompany
    ).toMatchObject({
      selection: {
        agents: { mode: "none" },
        projects: { mode: "selected", itemPaths: ["projects/import-pipeline/PROJECT.md"] },
        tasks: { mode: "none" },
        issues: { mode: "selected", itemPaths: ["issues/follow-up/ISSUE.md"] },
        skills: { mode: "none" }
      },
      syncCollisionStrategy: "rename"
    });
  });

  it("lets operators disable auto-sync for an imported company", async () => {
    const repositoryPath = await createRepositoryFixture();
    let currentTime = "2026-04-14T09:23:00.000Z";
    const plugin = createAgentCompaniesPlugin({
      now: () => currentTime,
      startupAutoSyncDelayMs: null
    });
    const harness = createTestHarness({
      manifest,
      capabilities: [...manifest.capabilities]
    });

    await harness.ctx.state.set(CATALOG_SCOPE, {
      repositories: [],
      updatedAt: "2026-04-14T09:00:00.000Z"
    });

    await plugin.definition.setup(harness.ctx);
    await harness.performAction("catalog.add-repository", {
      url: repositoryPath
    });

    const catalog = await harness.getData<CatalogSnapshot>("catalog.read");
    const company = catalog.companies.find((candidate) => candidate.slug === "alpha-labs");

    await harness.performAction("catalog.record-company-import", {
      sourceCompanyId: company?.id,
      importedCompanyId: "paperclip-company-123",
      importedCompanyName: "Alpha Labs Imported",
      importedCompanyIssuePrefix: "ALP"
    });
    await harness.performAction("catalog.record-company-import", {
      sourceCompanyId: company?.id,
      importedCompanyId: "paperclip-company-456",
      importedCompanyName: "Alpha Labs Sandbox",
      importedCompanyIssuePrefix: "ALPS"
    });

    const afterDisable = await harness.performAction<CatalogSnapshot>("catalog.set-company-auto-sync", {
      sourceCompanyId: company?.id,
      importedCompanyId: "paperclip-company-123",
      enabled: false
    });
    const disabledImport = afterDisable.importedCompanies.find(
      (candidate) => candidate.importedCompany.id === "paperclip-company-123"
    );
    const untouchedImport = afterDisable.importedCompanies.find(
      (candidate) => candidate.importedCompany.id === "paperclip-company-456"
    );

    expect(disabledImport?.importedCompany.autoSyncEnabled).toBe(false);
    expect(disabledImport?.importedCompany.isAutoSyncDue).toBe(false);
    expect(disabledImport?.importedCompany.nextAutoSyncAt).toBeNull();
    expect(untouchedImport?.importedCompany.autoSyncEnabled).toBe(true);
  });

  it("lets operators configure the auto-sync cadence in hours", async () => {
    const repositoryPath = await createRepositoryFixture();
    let currentTime = "2026-04-14T09:23:00.000Z";
    const plugin = createAgentCompaniesPlugin({
      now: () => currentTime,
      startupAutoSyncDelayMs: null
    });
    const harness = createTestHarness({
      manifest,
      capabilities: [...manifest.capabilities]
    });

    await harness.ctx.state.set(CATALOG_SCOPE, {
      repositories: [],
      updatedAt: "2026-04-14T09:00:00.000Z"
    });

    await plugin.definition.setup(harness.ctx);
    await harness.performAction("catalog.add-repository", {
      url: repositoryPath
    });

    const catalog = await harness.getData<CatalogSnapshot>("catalog.read");
    const company = catalog.companies.find((candidate) => candidate.slug === "alpha-labs");

    await harness.performAction("catalog.record-company-import", {
      sourceCompanyId: company?.id,
      importedCompanyId: "paperclip-company-123",
      importedCompanyName: "Alpha Labs Imported",
      importedCompanyIssuePrefix: "ALP"
    });

    await setFixtureRepositoryVersion(repositoryPath, "1.1.0");
    await harness.performAction("catalog.scan-repository", {
      repositoryId: catalog.repositories[0]?.id
    });

    currentTime = "2026-04-14T15:24:00.000Z";

    const beforeUpdate = await harness.getData<CatalogSnapshot>("catalog.read");
    const beforeUpdateImport = beforeUpdate.importedCompanies.find(
      (candidate) => candidate.importedCompany.id === "paperclip-company-123"
    );

    expect(beforeUpdate.autoSyncCadenceHours).toBe(DEFAULT_AUTO_SYNC_CADENCE_HOURS);
    expect(beforeUpdateImport?.importedCompany.isAutoSyncDue).toBe(false);
    expect(beforeUpdateImport?.importedCompany.nextAutoSyncAt).toBe("2026-04-15T09:23:00.000Z");

    const afterUpdate = await harness.performAction<CatalogSnapshot>(
      "catalog.set-auto-sync-cadence",
      {
        autoSyncCadenceHours: 6
      }
    );
    const afterUpdateImport = afterUpdate.importedCompanies.find(
      (candidate) => candidate.importedCompany.id === "paperclip-company-123"
    );

    expect(afterUpdate.autoSyncCadenceHours).toBe(6);
    expect(afterUpdateImport?.importedCompany.isAutoSyncDue).toBe(true);
    expect(afterUpdateImport?.importedCompany.nextAutoSyncAt).toBe("2026-04-14T15:23:00.000Z");
  });

  it("syncs imported companies with overwrite collisions", async () => {
    const repositoryPath = await createRepositoryFixture();
    let currentTime = "2026-04-14T09:23:00.000Z";
    const syncCalls: Array<{
      importedCompanyId: string;
      collisionStrategy: string;
      filePaths: string[];
    }> = [];
    const plugin = createAgentCompaniesPlugin({
      now: () => currentTime,
      startupAutoSyncDelayMs: null,
      syncImport: async (_ctx, input) => {
        syncCalls.push({
          importedCompanyId: input.importedCompanyId,
          collisionStrategy: input.collisionStrategy,
          filePaths: Object.keys(input.preparedImport.source.files).sort()
        });

        return {
          company: {
            id: input.importedCompanyId,
            name: "Alpha Labs Imported",
            action: "updated"
          },
          agents: [{ action: "updated" }],
          projects: [{ action: "updated" }],
          issues: [{ action: "updated" }],
          skills: [{ action: "skipped" }],
          warnings: []
        };
      }
    });
    const harness = createTestHarness({
      manifest,
      capabilities: [...manifest.capabilities]
    });

    await harness.ctx.state.set(CATALOG_SCOPE, {
      repositories: [],
      updatedAt: "2026-04-14T09:00:00.000Z"
    });

    await plugin.definition.setup(harness.ctx);
    await harness.performAction("catalog.add-repository", {
      url: repositoryPath
    });

    const catalog = await harness.getData<CatalogSnapshot>("catalog.read");
    const company = catalog.companies.find((candidate) => candidate.slug === "alpha-labs");

    await harness.performAction("catalog.record-company-import", {
      sourceCompanyId: company?.id,
      importedCompanyId: "paperclip-company-123",
      importedCompanyName: "Alpha Labs Imported",
      importedCompanyIssuePrefix: "ALP"
    });
    await harness.performAction("catalog.record-company-import", {
      sourceCompanyId: company?.id,
      importedCompanyId: "paperclip-company-456",
      importedCompanyName: "Alpha Labs Sandbox",
      importedCompanyIssuePrefix: "ALPS"
    });

    await setFixtureRepositoryVersion(repositoryPath, "1.1.0");

    currentTime = "2026-04-15T10:00:00.000Z";
    const syncResult = await harness.performAction<CatalogCompanySyncResult>("catalog.sync-company", {
      sourceCompanyId: company?.id,
      importedCompanyId: "paperclip-company-123"
    });

    expect(syncCalls).toEqual([
      {
        importedCompanyId: "paperclip-company-123",
        collisionStrategy: DEFAULT_SYNC_COLLISION_STRATEGY,
        filePaths: [
          "COMPANY.md",
          "agents/ceo/AGENTS.md",
          "issues/follow-up/ISSUE.md",
          "projects/import-pipeline/PROJECT.md",
          "projects/import-pipeline/tasks/seed-default/TASK.md",
          "skills/repo-audit/SKILL.md",
          "skills/repo-audit/assets/icon.svg"
        ]
      }
    ]);
    expect(syncResult.importedCompanyId).toBe("paperclip-company-123");
    expect(syncResult.importedCompanyName).toBe("Alpha Labs Imported");
    expect(syncResult.collisionStrategy).toBe(DEFAULT_SYNC_COLLISION_STRATEGY);
    expect(syncResult.importedSourceVersion).toBe("1.1.0");
    expect(syncResult.latestSourceVersion).toBe("1.1.0");
    expect(syncResult.syncedAt).toBe("2026-04-15T10:00:00.000Z");
    expect(syncResult.upToDate).toBe(false);
    expect(syncResult.company?.action).toBe("updated");

    const afterSync = await harness.getData<CatalogSnapshot>("catalog.read");
    const syncedImport = afterSync.importedCompanies.find(
      (candidate) => candidate.importedCompany.id === "paperclip-company-123"
    );
    const untouchedImport = afterSync.importedCompanies.find(
      (candidate) => candidate.importedCompany.id === "paperclip-company-456"
    );

    expect(syncedImport?.importedCompany.syncStatus).toBe("succeeded");
    expect(syncedImport?.importedCompany.lastSyncedAt).toBe("2026-04-15T10:00:00.000Z");
    expect(syncedImport?.importedCompany.lastSyncError).toBeNull();
    expect(syncedImport?.importedCompany.importedSourceVersion).toBe("1.1.0");
    expect(syncedImport?.importedCompany.latestSourceVersion).toBe("1.1.0");
    expect(syncedImport?.importedCompany.isSyncAvailable).toBe(false);
    expect(syncedImport?.importedCompany.isUpToDate).toBe(true);
    expect(untouchedImport?.importedCompany.importedSourceVersion).toBe("1.0.0");
    expect(untouchedImport?.importedCompany.latestSourceVersion).toBe("1.1.0");
    expect(untouchedImport?.importedCompany.isSyncAvailable).toBe(true);
  });

  it("syncs imported companies with their saved partial selection contract", async () => {
    const repositoryPath = await createRepositoryFixture();
    let currentTime = "2026-04-14T09:23:00.000Z";
    const syncCalls: Array<{
      importedCompanyId: string;
      collisionStrategy: string;
      filePaths: string[];
    }> = [];
    const plugin = createAgentCompaniesPlugin({
      now: () => currentTime,
      startupAutoSyncDelayMs: null,
      syncImport: async (_ctx, input) => {
        syncCalls.push({
          importedCompanyId: input.importedCompanyId,
          collisionStrategy: input.collisionStrategy,
          filePaths: Object.keys(input.preparedImport.source.files).sort()
        });

        return {
          company: {
            id: input.importedCompanyId,
            name: "Alpha Labs Imported",
            action: "updated"
          },
          warnings: []
        };
      }
    });
    const harness = createTestHarness({
      manifest,
      capabilities: [...manifest.capabilities]
    });

    await harness.ctx.state.set(CATALOG_SCOPE, {
      repositories: [],
      updatedAt: "2026-04-14T09:00:00.000Z"
    });

    await plugin.definition.setup(harness.ctx);
    await harness.performAction("catalog.add-repository", {
      url: repositoryPath
    });

    const catalog = await harness.getData<CatalogSnapshot>("catalog.read");
    const company = catalog.companies.find((candidate) => candidate.slug === "alpha-labs");

    await harness.performAction("catalog.record-company-import", {
      sourceCompanyId: company?.id,
      importedCompanyId: "paperclip-company-123",
      importedCompanyName: "Alpha Labs Imported",
      importedCompanyIssuePrefix: "ALP",
      selection: {
        agents: { mode: "selected", itemPaths: ["agents/ceo/AGENTS.md"] },
        projects: { mode: "none" },
        tasks: { mode: "none" },
        issues: { mode: "none" },
        skills: { mode: "selected", itemPaths: ["skills/repo-audit/SKILL.md"] }
      },
      syncCollisionStrategy: "skip"
    });

    await setFixtureRepositoryVersion(repositoryPath, "1.1.0");
    currentTime = "2026-04-15T10:00:00.000Z";

    await harness.performAction<CatalogCompanySyncResult>("catalog.sync-company", {
      sourceCompanyId: company?.id,
      importedCompanyId: "paperclip-company-123"
    });

    expect(syncCalls).toEqual([
      {
        importedCompanyId: "paperclip-company-123",
        collisionStrategy: "skip",
        filePaths: [
          "COMPANY.md",
          "agents/ceo/AGENTS.md",
          "skills/repo-audit/SKILL.md",
          "skills/repo-audit/assets/icon.svg"
        ]
      }
    ]);
  });

  it("rejects linking one existing Paperclip company to multiple discovered sources", async () => {
    const repositoryPath = await createRepositoryFixture();
    const plugin = createAgentCompaniesPlugin({
      now: () => "2026-04-14T09:23:10.000Z"
    });
    const harness = createTestHarness({
      manifest,
      capabilities: [...manifest.capabilities]
    });

    await harness.ctx.state.set(CATALOG_SCOPE, {
      repositories: [],
      updatedAt: "2026-04-14T09:00:00.000Z"
    });

    await plugin.definition.setup(harness.ctx);
    await harness.performAction("catalog.add-repository", {
      url: repositoryPath
    });

    const catalog = await harness.getData<CatalogSnapshot>("catalog.read");
    const alphaCompany = catalog.companies.find((candidate) => candidate.slug === "alpha-labs");
    const betaCompany = catalog.companies.find((candidate) => candidate.slug === "beta-works");

    await harness.performAction("catalog.record-company-import", {
      sourceCompanyId: alphaCompany?.id,
      importedCompanyId: "paperclip-company-123",
      importedCompanyName: "Existing Alpha",
      importedCompanyIssuePrefix: "ALP",
      selection: {
        agents: { mode: "selected", itemPaths: ["agents/ceo/AGENTS.md"] },
        projects: { mode: "none" },
        tasks: { mode: "none" },
        issues: { mode: "none" },
        skills: { mode: "none" }
      }
    });

    await expect(
      harness.performAction("catalog.record-company-import", {
        sourceCompanyId: betaCompany?.id,
        importedCompanyId: "paperclip-company-123",
        importedCompanyName: "Existing Alpha",
        importedCompanyIssuePrefix: "ALP"
      })
    ).rejects.toThrow(/already linked to a different discovered company source/u);
  });

  it("applies metadata.paperclip.agentIcon when preparing sync imports", async () => {
    const repositoryPath = await createRepositoryFixture();
    await addPaperclipAgentIconFixture(repositoryPath);

    let currentTime = "2026-04-14T09:23:00.000Z";
    let syncedExtension: {
      schema?: string;
      agents?: Record<string, { icon?: string }>;
    } | undefined;
    const plugin = createAgentCompaniesPlugin({
      now: () => currentTime,
      startupAutoSyncDelayMs: null,
      syncImport: async (_ctx, input) => {
        const extensionYaml = input.preparedImport.source.files[".paperclip.yaml"];
        syncedExtension = parseYaml(typeof extensionYaml === "string" ? extensionYaml : "") as {
          schema?: string;
          agents?: Record<string, { icon?: string }>;
        };

        return {
          company: {
            id: input.importedCompanyId,
            name: "Alpha Labs Imported",
            action: "updated"
          }
        };
      }
    });
    const harness = createTestHarness({
      manifest,
      capabilities: [...manifest.capabilities]
    });

    await harness.ctx.state.set(CATALOG_SCOPE, {
      repositories: [],
      updatedAt: "2026-04-14T09:00:00.000Z"
    });

    await plugin.definition.setup(harness.ctx);
    await harness.performAction("catalog.add-repository", {
      url: repositoryPath
    });

    const catalog = await harness.getData<CatalogSnapshot>("catalog.read");
    const company = catalog.companies.find((candidate) => candidate.slug === "alpha-labs");

    await harness.performAction("catalog.record-company-import", {
      sourceCompanyId: company?.id,
      importedCompanyId: "paperclip-company-123",
      importedCompanyName: "Alpha Labs Imported",
      importedCompanyIssuePrefix: "ALP"
    });

    await setFixtureRepositoryVersion(repositoryPath, "1.1.0");
    currentTime = "2026-04-15T10:00:00.000Z";

    await harness.performAction<CatalogCompanySyncResult>("catalog.sync-company", {
      sourceCompanyId: company?.id,
      importedCompanyId: "paperclip-company-123"
    });

    expect(syncedExtension?.schema).toBe("paperclip/v1");
    expect(syncedExtension?.agents?.ceo?.icon).toBe("crown");
    expect(syncedExtension?.agents?.reviewer?.icon).toBe("bot");
    expect(syncedExtension?.agents?.architect?.icon).toBeUndefined();
  });

  it("returns an up-to-date sync result without re-importing current companies", async () => {
    const repositoryPath = await createRepositoryFixture();
    let currentTime = "2026-04-14T09:23:00.000Z";
    let syncCount = 0;
    const plugin = createAgentCompaniesPlugin({
      now: () => currentTime,
      startupAutoSyncDelayMs: null,
      syncImport: async (_ctx, input) => {
        syncCount += 1;
        return {
          company: {
            id: input.importedCompanyId,
            name: "Alpha Labs Imported",
            action: "updated"
          },
          warnings: []
        };
      }
    });
    const harness = createTestHarness({
      manifest,
      capabilities: [...manifest.capabilities]
    });

    await harness.ctx.state.set(CATALOG_SCOPE, {
      repositories: [],
      updatedAt: "2026-04-14T09:00:00.000Z"
    });

    await plugin.definition.setup(harness.ctx);
    await harness.performAction("catalog.add-repository", {
      url: repositoryPath
    });

    const catalog = await harness.getData<CatalogSnapshot>("catalog.read");
    const company = catalog.companies.find((candidate) => candidate.slug === "alpha-labs");

    await harness.performAction("catalog.record-company-import", {
      sourceCompanyId: company?.id,
      importedCompanyId: "paperclip-company-123",
      importedCompanyName: "Alpha Labs Imported",
      importedCompanyIssuePrefix: "ALP"
    });

    currentTime = "2026-04-15T10:00:00.000Z";
    const syncResult = await harness.performAction<CatalogCompanySyncResult>("catalog.sync-company", {
      sourceCompanyId: company?.id,
      importedCompanyId: "paperclip-company-123"
    });

    expect(syncCount).toBe(0);
    expect(syncResult.company?.action).toBe("unchanged");
    expect(syncResult.importedSourceVersion).toBe("1.0.0");
    expect(syncResult.latestSourceVersion).toBe("1.0.0");
    expect(syncResult.upToDate).toBe(true);

    const afterSync = await harness.getData<CatalogSnapshot>("catalog.read");
    const importedCompany = afterSync.importedCompanies.find(
      (candidate) => candidate.importedCompany.id === "paperclip-company-123"
    );

    expect(importedCompany?.importedCompany.lastSyncedAt).toBe("2026-04-15T10:00:00.000Z");
    expect(importedCompany?.importedCompany.isSyncAvailable).toBe(false);
    expect(importedCompany?.importedCompany.isUpToDate).toBe(true);
  });

  it("queues wake requests for newly assigned issues created by sync", async () => {
    const repositoryPath = await createRepositoryFixture();
    const previousApiUrl = process.env.PAPERCLIP_API_URL;
    const previousApiKey = process.env.PAPERCLIP_API_KEY;
    const originalFetch = globalThis.fetch;
    const fetchRequests: Array<{ url: string; method: string; body: unknown }> = [];
    let issueReadCount = 0;
    let currentTime = "2026-04-14T09:23:00.000Z";

    process.env.PAPERCLIP_API_URL = "http://127.0.0.1:3210";
    delete process.env.PAPERCLIP_API_KEY;
    globalThis.fetch = async (input, init) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method ?? "GET";
      const bodyText = typeof init?.body === "string" ? init.body : null;
      fetchRequests.push({
        url,
        method,
        body: bodyText ? JSON.parse(bodyText) : null
      });

      if (url === "http://127.0.0.1:3210/api/companies/paperclip-company-123/issues") {
        issueReadCount += 1;
        return new Response(
          JSON.stringify(
            issueReadCount === 1
              ? [
                  {
                    id: "issue-1",
                    identifier: "ALP-1",
                    title: "Seed Default Company",
                    status: "backlog",
                    assigneeAgentId: null
                  }
                ]
              : [
                  {
                    id: "issue-1",
                    identifier: "ALP-1",
                    title: "Seed Default Company",
                    status: "backlog",
                    assigneeAgentId: "agent-123"
                  }
                ]
          ),
          {
            status: 200,
            headers: {
              "content-type": "application/json"
            }
          }
        );
      }

      if (url === "http://127.0.0.1:3210/api/agents/agent-123/wakeup") {
        return new Response(
          JSON.stringify({
            id: "run-123",
            status: "queued"
          }),
          {
            status: 202,
            headers: {
              "content-type": "application/json"
            }
          }
        );
      }

      throw new Error(`Unexpected fetch to ${url}`);
    };

    try {
      const plugin = createAgentCompaniesPlugin({
        now: () => currentTime,
        startupAutoSyncDelayMs: null,
        syncImport: async (_ctx, input) => ({
          company: {
            id: input.importedCompanyId,
            name: "Alpha Labs Imported",
            action: "updated"
          }
        })
      });
      const harness = createTestHarness({
        manifest,
        capabilities: [...manifest.capabilities]
      });

      await harness.ctx.state.set(CATALOG_SCOPE, {
        repositories: [],
        updatedAt: "2026-04-14T09:00:00.000Z"
      });

      await plugin.definition.setup(harness.ctx);
      await harness.performAction("catalog.add-repository", {
        url: repositoryPath
      });

      const catalog = await harness.getData<CatalogSnapshot>("catalog.read");
      const company = catalog.companies.find((candidate) => candidate.slug === "alpha-labs");

      await harness.performAction("catalog.record-company-import", {
        sourceCompanyId: company?.id,
        importedCompanyId: "paperclip-company-123",
        importedCompanyName: "Alpha Labs Imported",
        importedCompanyIssuePrefix: "ALP"
      });

      await setFixtureRepositoryVersion(repositoryPath, "1.1.0");
      currentTime = "2026-04-15T10:00:00.000Z";

      await harness.performAction<CatalogCompanySyncResult>("catalog.sync-company", {
        sourceCompanyId: company?.id,
        importedCompanyId: "paperclip-company-123"
      });

      expect(fetchRequests).toEqual([
        {
          url: "http://127.0.0.1:3210/api/companies/paperclip-company-123/issues",
          method: "GET",
          body: null
        },
        {
          url: "http://127.0.0.1:3210/api/companies/paperclip-company-123/issues",
          method: "GET",
          body: null
        },
        {
          url: "http://127.0.0.1:3210/api/agents/agent-123/wakeup",
          method: "POST",
          body: {
            source: "on_demand",
            triggerDetail: "manual",
            reason: "issue_assigned",
            payload: {
              issueId: "issue-1",
              taskId: "issue-1",
              mutation: "import"
            }
          }
        }
      ]);
    } finally {
      globalThis.fetch = originalFetch;
      if (previousApiUrl === undefined) {
        delete process.env.PAPERCLIP_API_URL;
      } else {
        process.env.PAPERCLIP_API_URL = previousApiUrl;
      }

      if (previousApiKey === undefined) {
        delete process.env.PAPERCLIP_API_KEY;
      } else {
        process.env.PAPERCLIP_API_KEY = previousApiKey;
      }
    }
  });

  it("queues wake requests for newly assigned issues when recording an import", async () => {
    const repositoryPath = await createRepositoryFixture();
    const previousApiUrl = process.env.PAPERCLIP_API_URL;
    const previousApiKey = process.env.PAPERCLIP_API_KEY;
    const originalFetch = globalThis.fetch;
    const fetchRequests: Array<{ url: string; method: string; body: unknown }> = [];

    process.env.PAPERCLIP_API_URL = "http://127.0.0.1:3210";
    delete process.env.PAPERCLIP_API_KEY;
    globalThis.fetch = async (input, init) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method ?? "GET";
      const bodyText = typeof init?.body === "string" ? init.body : null;
      fetchRequests.push({
        url,
        method,
        body: bodyText ? JSON.parse(bodyText) : null
      });

      if (url === "http://127.0.0.1:3210/api/companies/paperclip-company-123/issues") {
        return new Response(
          JSON.stringify([
            {
              id: "issue-1",
              identifier: "ALP-1",
              title: "Seed Default Company",
              status: "backlog",
              assigneeAgentId: "agent-123"
            }
          ]),
          {
            status: 200,
            headers: {
              "content-type": "application/json"
            }
          }
        );
      }

      if (url === "http://127.0.0.1:3210/api/agents/agent-123/wakeup") {
        return new Response(
          JSON.stringify({
            id: "run-123",
            status: "queued"
          }),
          {
            status: 202,
            headers: {
              "content-type": "application/json"
            }
          }
        );
      }

      throw new Error(`Unexpected fetch to ${url}`);
    };

    try {
      const plugin = createAgentCompaniesPlugin({
        now: () => "2026-04-14T09:23:00.000Z",
        startupAutoSyncDelayMs: null
      });
      const harness = createTestHarness({
        manifest,
        capabilities: [...manifest.capabilities]
      });

      await harness.ctx.state.set(CATALOG_SCOPE, {
        repositories: [],
        updatedAt: "2026-04-14T09:00:00.000Z"
      });

      await plugin.definition.setup(harness.ctx);
      await harness.performAction("catalog.add-repository", {
        url: repositoryPath
      });

      const catalog = await harness.getData<CatalogSnapshot>("catalog.read");
      const company = catalog.companies.find((candidate) => candidate.slug === "alpha-labs");
      const sourceCompanyId = company?.id;

      expect(sourceCompanyId).toBeTruthy();

      await harness.performAction("catalog.record-company-import", {
        sourceCompanyId: sourceCompanyId!,
        importedCompanyId: "paperclip-company-123",
        importedCompanyName: "Alpha Labs Imported",
        importedCompanyIssuePrefix: "ALP",
        issuesBeforeImport: []
      });

      expect(fetchRequests).toEqual([
        {
          url: "http://127.0.0.1:3210/api/companies/paperclip-company-123/issues",
          method: "GET",
          body: null
        },
        {
          url: "http://127.0.0.1:3210/api/agents/agent-123/wakeup",
          method: "POST",
          body: {
            source: "on_demand",
            triggerDetail: "manual",
            reason: "issue_assigned",
            payload: {
              issueId: "issue-1",
              taskId: "issue-1",
              mutation: "import"
            }
          }
        }
      ]);
    } finally {
      globalThis.fetch = originalFetch;
      if (previousApiUrl === undefined) {
        delete process.env.PAPERCLIP_API_URL;
      } else {
        process.env.PAPERCLIP_API_URL = previousApiUrl;
      }

      if (previousApiKey === undefined) {
        delete process.env.PAPERCLIP_API_KEY;
      } else {
        process.env.PAPERCLIP_API_KEY = previousApiKey;
      }
    }
  });

  it("falls back to an assignment-style wake when the explicit import wake is skipped", async () => {
    const repositoryPath = await createRepositoryFixture();
    const previousApiUrl = process.env.PAPERCLIP_API_URL;
    const previousApiKey = process.env.PAPERCLIP_API_KEY;
    const originalFetch = globalThis.fetch;
    const fetchRequests: Array<{ url: string; method: string; body: unknown }> = [];
    let wakeRequestCount = 0;

    process.env.PAPERCLIP_API_URL = "http://127.0.0.1:3210";
    delete process.env.PAPERCLIP_API_KEY;
    globalThis.fetch = async (input, init) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method ?? "GET";
      const bodyText = typeof init?.body === "string" ? init.body : null;
      fetchRequests.push({
        url,
        method,
        body: bodyText ? JSON.parse(bodyText) : null
      });

      if (url === "http://127.0.0.1:3210/api/companies/paperclip-company-123/issues") {
        return new Response(
          JSON.stringify([
            {
              id: "issue-1",
              identifier: "ALP-1",
              title: "Seed Default Company",
              status: "backlog",
              assigneeAgentId: "agent-123"
            }
          ]),
          {
            status: 200,
            headers: {
              "content-type": "application/json"
            }
          }
        );
      }

      if (url === "http://127.0.0.1:3210/api/agents/agent-123/wakeup") {
        wakeRequestCount += 1;

        return new Response(
          JSON.stringify(
            wakeRequestCount === 1
              ? {
                  status: "skipped",
                  reason: "wakeup_skipped",
                  message: "Wakeup was skipped.",
                  issueId: "issue-1",
                  executionRunId: null,
                  executionAgentId: null,
                  executionAgentName: null
                }
              : {
                  id: "run-123",
                  status: "queued"
                }
          ),
          {
            status: 202,
            headers: {
              "content-type": "application/json"
            }
          }
        );
      }

      throw new Error(`Unexpected fetch to ${url}`);
    };

    try {
      const plugin = createAgentCompaniesPlugin({
        now: () => "2026-04-14T09:23:00.000Z",
        startupAutoSyncDelayMs: null
      });
      const harness = createTestHarness({
        manifest,
        capabilities: [...manifest.capabilities]
      });

      await harness.ctx.state.set(CATALOG_SCOPE, {
        repositories: [],
        updatedAt: "2026-04-14T09:00:00.000Z"
      });

      await plugin.definition.setup(harness.ctx);
      await harness.performAction("catalog.add-repository", {
        url: repositoryPath
      });

      const catalog = await harness.getData<CatalogSnapshot>("catalog.read");
      const company = catalog.companies.find((candidate) => candidate.slug === "alpha-labs");

      await harness.performAction("catalog.record-company-import", {
        sourceCompanyId: company?.id,
        importedCompanyId: "paperclip-company-123",
        importedCompanyName: "Alpha Labs Imported",
        importedCompanyIssuePrefix: "ALP",
        issuesBeforeImport: []
      });

      expect(fetchRequests).toEqual([
        {
          url: "http://127.0.0.1:3210/api/companies/paperclip-company-123/issues",
          method: "GET",
          body: null
        },
        {
          url: "http://127.0.0.1:3210/api/agents/agent-123/wakeup",
          method: "POST",
          body: {
            source: "on_demand",
            triggerDetail: "manual",
            reason: "issue_assigned",
            payload: {
              issueId: "issue-1",
              taskId: "issue-1",
              mutation: "import"
            }
          }
        },
        {
          url: "http://127.0.0.1:3210/api/agents/agent-123/wakeup",
          method: "POST",
          body: {
            source: "assignment",
            triggerDetail: "system",
            reason: "issue_assigned",
            payload: {
              issueId: "issue-1",
              taskId: "issue-1",
              mutation: "import"
            }
          }
        }
      ]);
    } finally {
      globalThis.fetch = originalFetch;
      if (previousApiUrl === undefined) {
        delete process.env.PAPERCLIP_API_URL;
      } else {
        process.env.PAPERCLIP_API_URL = previousApiUrl;
      }

      if (previousApiKey === undefined) {
        delete process.env.PAPERCLIP_API_KEY;
      } else {
        process.env.PAPERCLIP_API_KEY = previousApiKey;
      }
    }
  });

  it("archives older duplicate routines after a replace-mode recurring task sync", async () => {
    const repositoryPath = await createRepositoryFixture();
    await addRecurringTaskFixture(repositoryPath);
    const previousApiUrl = process.env.PAPERCLIP_API_URL;
    const previousApiKey = process.env.PAPERCLIP_API_KEY;
    const originalFetch = globalThis.fetch;
    const fetchRequests: Array<{ url: string; authorization: string | null; body: unknown }> = [];

    process.env.PAPERCLIP_API_URL = "http://127.0.0.1:3210";
    delete process.env.PAPERCLIP_API_KEY;
    globalThis.fetch = async (input, init) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const headers = new Headers(init?.headers);
      const bodyText = typeof init?.body === "string" ? init.body : null;
      fetchRequests.push({
        url,
        authorization: headers.get("authorization"),
        body: bodyText ? JSON.parse(bodyText) : null
      });

      if (url === "http://127.0.0.1:3210/api/companies/paperclip-company-123/issues") {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        });
      }

      if (url === "http://127.0.0.1:3210/api/companies/paperclip-company-123/agents") {
        return new Response(
          JSON.stringify([
            {
              id: "agent-123",
              name: "Alpha CEO",
              urlKey: "ceo",
              status: "pending_approval",
              role: "ceo",
              title: "Chief Executive Officer"
            }
          ]),
          {
            status: 200,
            headers: {
              "content-type": "application/json"
            }
          }
        );
      }

      if (url === "http://127.0.0.1:3210/api/companies/paperclip-company-123/approvals") {
        return new Response(JSON.stringify({ id: "approval-123" }), {
          status: 201,
          headers: {
            "content-type": "application/json"
          }
        });
      }

      if (url === "http://127.0.0.1:3210/api/approvals/approval-123/approve") {
        return new Response(JSON.stringify({ id: "approval-123", status: "approved" }), {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        });
      }

      if (url === "http://127.0.0.1:3210/api/companies/import") {
        const parsedBody = bodyText ? JSON.parse(bodyText) : null;
        const issuesIncluded = parsedBody?.include?.issues === true;

        return new Response(
          JSON.stringify({
            company: {
              id: "paperclip-company-123",
              name: "Alpha Labs Imported",
              action: "updated"
            },
            agents: issuesIncluded ? [] : [{ action: "updated" }],
            projects: issuesIncluded ? [] : [{ action: "updated" }],
            issues: issuesIncluded ? [{ action: "updated" }] : [],
            skills: issuesIncluded ? [] : [{ action: "updated" }],
            warnings: []
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json"
            }
          }
        );
      }

      if (url === "http://127.0.0.1:3210/api/companies/paperclip-company-123/routines") {
        return new Response(
          JSON.stringify([
            {
              id: "routine-old",
              title: "Monday Review",
              description: "Review pipeline health.",
              status: "active",
              createdAt: "2026-04-22T05:16:26.000Z",
              updatedAt: "2026-04-22T05:16:26.000Z"
            },
            {
              id: "routine-new",
              title: "Monday Review",
              description: "Review pipeline health.",
              status: "active",
              createdAt: "2026-04-22T05:16:44.000Z",
              updatedAt: "2026-04-22T05:16:44.000Z"
            }
          ]),
          {
            status: 200,
            headers: {
              "content-type": "application/json"
            }
          }
        );
      }

      if (url === "http://127.0.0.1:3210/api/routines/routine-old") {
        return new Response(
          JSON.stringify({
            id: "routine-old",
            status: "archived"
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json"
            }
          }
        );
      }

      throw new Error(`Unexpected fetch to ${url}`);
    };

    try {
      const plugin = createAgentCompaniesPlugin({
        now: () => "2026-04-15T10:00:00.000Z",
        startupAutoSyncDelayMs: null
      });
      const harness = createTestHarness({
        manifest,
        capabilities: [...manifest.capabilities]
      });

      await harness.ctx.state.set(CATALOG_SCOPE, {
        repositories: [],
        updatedAt: "2026-04-14T09:00:00.000Z"
      });

      await plugin.definition.setup(harness.ctx);
      await harness.performAction("catalog.add-repository", {
        url: repositoryPath
      });

      const catalog = await harness.getData<CatalogSnapshot>("catalog.read");
      const company = catalog.companies.find((candidate) => candidate.slug === "alpha-labs");

      await harness.performAction("catalog.record-company-import", {
        sourceCompanyId: company?.id,
        importedCompanyId: "paperclip-company-123",
        importedCompanyName: "Alpha Labs Imported",
        importedCompanyIssuePrefix: "ALP"
      });
      await setFixtureRepositoryVersion(repositoryPath, "1.1.0");
      await harness.performAction("board-access.update", {
        companyId: "paperclip-company-123",
        paperclipBoardApiTokenRef: "secret-board-token-ref",
        identity: "Agent Operator"
      });

      (harness.ctx.secrets as { resolve(secretRef: string): Promise<string> }).resolve = async (secretRef: string) => {
        expect(secretRef).toBe("secret-board-token-ref");
        return "paperclip-board-token";
      };

      await harness.performAction<CatalogCompanySyncResult>("catalog.sync-company", {
        sourceCompanyId: company?.id,
        importedCompanyId: "paperclip-company-123"
      });

      expect(fetchRequests).toEqual([
        {
          url: "http://127.0.0.1:3210/api/companies/paperclip-company-123/issues",
          authorization: "Bearer paperclip-board-token",
          body: null
        },
        expect.objectContaining({
          url: "http://127.0.0.1:3210/api/companies/import",
          authorization: "Bearer paperclip-board-token",
          body: expect.objectContaining({
            include: {
              company: false,
              agents: true,
              projects: true,
              issues: false,
              skills: true
            }
          })
        }),
        {
          url: "http://127.0.0.1:3210/api/companies/paperclip-company-123/agents",
          authorization: "Bearer paperclip-board-token",
          body: null
        },
        {
          url: "http://127.0.0.1:3210/api/companies/paperclip-company-123/approvals",
          authorization: "Bearer paperclip-board-token",
          body: {
            type: "hire_agent",
            payload: {
              agentId: "agent-123",
              name: "Alpha CEO",
              role: "ceo",
              title: "Chief Executive Officer"
            }
          }
        },
        {
          url: "http://127.0.0.1:3210/api/approvals/approval-123/approve",
          authorization: "Bearer paperclip-board-token",
          body: {
            decisionNote: "Approved automatically during Agent Company sync so imported tasks can wake Alpha CEO immediately."
          }
        },
        expect.objectContaining({
          url: "http://127.0.0.1:3210/api/companies/import",
          authorization: "Bearer paperclip-board-token",
          body: expect.objectContaining({
            source: {
              type: "inline",
              files: expect.objectContaining({
                ".paperclip.yaml": expect.any(String),
                "COMPANY.md": expect.any(String),
                "tasks/monday-review/TASK.md": expect.any(String)
              })
            },
            include: {
              company: false,
              agents: false,
              projects: false,
              issues: true,
              skills: false
            },
            target: {
              mode: "existing_company",
              companyId: "paperclip-company-123"
            },
            collisionStrategy: DEFAULT_SYNC_COLLISION_STRATEGY
          })
        }),
        {
          url: "http://127.0.0.1:3210/api/companies/paperclip-company-123/routines",
          authorization: "Bearer paperclip-board-token",
          body: null
        },
        {
          url: "http://127.0.0.1:3210/api/routines/routine-old",
          authorization: "Bearer paperclip-board-token",
          body: {
            status: "archived"
          }
        },
        {
          url: "http://127.0.0.1:3210/api/companies/paperclip-company-123/issues",
          authorization: "Bearer paperclip-board-token",
          body: null
        }
      ]);
    } finally {
      globalThis.fetch = originalFetch;
      if (previousApiUrl === undefined) {
        delete process.env.PAPERCLIP_API_URL;
      } else {
        process.env.PAPERCLIP_API_URL = previousApiUrl;
      }

      if (previousApiKey === undefined) {
        delete process.env.PAPERCLIP_API_KEY;
      } else {
        process.env.PAPERCLIP_API_KEY = previousApiKey;
      }
    }
  });

  it("syncs selected Paperclip issues through the issue import stage", async () => {
    const repositoryPath = await createRepositoryFixture();
    const previousApiUrl = process.env.PAPERCLIP_API_URL;
    const previousApiKey = process.env.PAPERCLIP_API_KEY;
    const originalFetch = globalThis.fetch;
    const fetchRequests: Array<{ url: string; authorization: string | null; body: unknown }> = [];

    process.env.PAPERCLIP_API_URL = "http://127.0.0.1:3210";
    delete process.env.PAPERCLIP_API_KEY;
    globalThis.fetch = async (input, init) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const headers = new Headers(init?.headers);
      const bodyText = typeof init?.body === "string" ? init.body : null;
      fetchRequests.push({
        url,
        authorization: headers.get("authorization"),
        body: bodyText ? JSON.parse(bodyText) : null
      });

      if (url === "http://127.0.0.1:3210/api/companies/paperclip-company-123/issues") {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        });
      }

      if (url === "http://127.0.0.1:3210/api/companies/import") {
        return new Response(
          JSON.stringify({
            company: {
              id: "paperclip-company-123",
              name: "Alpha Labs Imported",
              action: "updated"
            },
            issues: [{ action: "updated" }],
            warnings: []
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json"
            }
          }
        );
      }

      throw new Error(`Unexpected fetch to ${url}`);
    };

    try {
      const plugin = createAgentCompaniesPlugin({
        now: () => "2026-04-15T10:00:00.000Z",
        startupAutoSyncDelayMs: null
      });
      const harness = createTestHarness({
        manifest,
        capabilities: [...manifest.capabilities]
      });

      await harness.ctx.state.set(CATALOG_SCOPE, {
        repositories: [],
        updatedAt: "2026-04-14T09:00:00.000Z"
      });

      await plugin.definition.setup(harness.ctx);
      await harness.performAction("catalog.add-repository", {
        url: repositoryPath
      });

      const catalog = await harness.getData<CatalogSnapshot>("catalog.read");
      const company = catalog.companies.find((candidate) => candidate.slug === "alpha-labs");
      const sourceCompanyId = company?.id;

      expect(sourceCompanyId).toBeTruthy();

      await harness.performAction("catalog.record-company-import", {
        sourceCompanyId: sourceCompanyId!,
        importedCompanyId: "paperclip-company-123",
        importedCompanyName: "Alpha Labs Imported",
        importedCompanyIssuePrefix: "ALP",
        selection: {
          agents: { mode: "none" },
          projects: { mode: "none" },
          tasks: { mode: "none" },
          issues: { mode: "selected", itemPaths: ["issues/follow-up/ISSUE.md"] },
          skills: { mode: "none" }
        }
      });
      await setFixtureRepositoryVersion(repositoryPath, "1.1.0");
      await harness.performAction("board-access.update", {
        companyId: "paperclip-company-123",
        paperclipBoardApiTokenRef: "secret-board-token-ref",
        identity: "Agent Operator"
      });

      (harness.ctx.secrets as { resolve(secretRef: string): Promise<string> }).resolve = async (secretRef: string) => {
        expect(secretRef).toBe("secret-board-token-ref");
        return "paperclip-board-token";
      };

      await harness.performAction<CatalogCompanySyncResult>("catalog.sync-company", {
        sourceCompanyId: sourceCompanyId!,
        importedCompanyId: "paperclip-company-123"
      });

      expect(fetchRequests).toEqual([
        {
          url: "http://127.0.0.1:3210/api/companies/paperclip-company-123/issues",
          authorization: "Bearer paperclip-board-token",
          body: null
        },
        {
          url: "http://127.0.0.1:3210/api/companies/import",
          authorization: "Bearer paperclip-board-token",
          body: {
            source: {
              type: "inline",
              files: {
                "COMPANY.md": expect.any(String),
                "issues/follow-up/ISSUE.md": expect.any(String)
              }
            },
            include: {
              company: false,
              agents: false,
              projects: false,
              issues: true,
              skills: false
            },
            target: {
              mode: "existing_company",
              companyId: "paperclip-company-123"
            },
            collisionStrategy: DEFAULT_SYNC_COLLISION_STRATEGY
          }
        },
        {
          url: "http://127.0.0.1:3210/api/companies/paperclip-company-123/issues",
          authorization: "Bearer paperclip-board-token",
          body: null
        }
      ]);
    } finally {
      globalThis.fetch = originalFetch;
      if (previousApiUrl === undefined) {
        delete process.env.PAPERCLIP_API_URL;
      } else {
        process.env.PAPERCLIP_API_URL = previousApiUrl;
      }

      if (previousApiKey === undefined) {
        delete process.env.PAPERCLIP_API_KEY;
      } else {
        process.env.PAPERCLIP_API_KEY = previousApiKey;
      }
    }
  });

  it("skips wake requests when sync returns a different imported company id", async () => {
    const repositoryPath = await createRepositoryFixture();
    const previousApiUrl = process.env.PAPERCLIP_API_URL;
    const previousApiKey = process.env.PAPERCLIP_API_KEY;
    const originalFetch = globalThis.fetch;
    const fetchRequests: Array<{ url: string; method: string }> = [];

    process.env.PAPERCLIP_API_URL = "http://127.0.0.1:3210";
    delete process.env.PAPERCLIP_API_KEY;
    globalThis.fetch = async (input, init) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method ?? "GET";
      fetchRequests.push({
        url,
        method
      });

      if (url === "http://127.0.0.1:3210/api/companies/paperclip-company-123/issues") {
        return new Response(
          JSON.stringify([
            {
              id: "issue-1",
              identifier: "ALP-1",
              title: "Seed Default Company",
              status: "backlog",
              assigneeAgentId: null
            }
          ]),
          {
            status: 200,
            headers: {
              "content-type": "application/json"
            }
          }
        );
      }

      throw new Error(`Unexpected fetch to ${url}`);
    };

    try {
      const plugin = createAgentCompaniesPlugin({
        now: () => "2026-04-15T10:00:00.000Z",
        startupAutoSyncDelayMs: null,
        syncImport: async () => ({
          company: {
            id: "paperclip-company-456",
            name: "Alpha Labs Imported",
            action: "updated"
          }
        })
      });
      const harness = createTestHarness({
        manifest,
        capabilities: [...manifest.capabilities]
      });

      await harness.ctx.state.set(CATALOG_SCOPE, {
        repositories: [],
        updatedAt: "2026-04-14T09:00:00.000Z"
      });

      await plugin.definition.setup(harness.ctx);
      await harness.performAction("catalog.add-repository", {
        url: repositoryPath
      });

      const catalog = await harness.getData<CatalogSnapshot>("catalog.read");
      const company = catalog.companies.find((candidate) => candidate.slug === "alpha-labs");

      await harness.performAction("catalog.record-company-import", {
        sourceCompanyId: company?.id,
        importedCompanyId: "paperclip-company-123",
        importedCompanyName: "Alpha Labs Imported",
        importedCompanyIssuePrefix: "ALP"
      });

      await setFixtureRepositoryVersion(repositoryPath, "1.1.0");

      await harness.performAction<CatalogCompanySyncResult>("catalog.sync-company", {
        sourceCompanyId: company?.id,
        importedCompanyId: "paperclip-company-123"
      });

      expect(fetchRequests).toEqual([
        {
          url: "http://127.0.0.1:3210/api/companies/paperclip-company-123/issues",
          method: "GET"
        }
      ]);

      const afterSync = await harness.getData<CatalogSnapshot>("catalog.read");
      const importedCompany = afterSync.importedCompanies.find(
        (candidate) => candidate.importedCompany.id === "paperclip-company-456"
      );

      expect(importedCompany?.importedCompany.id).toBe("paperclip-company-456");
    } finally {
      globalThis.fetch = originalFetch;
      if (previousApiUrl === undefined) {
        delete process.env.PAPERCLIP_API_URL;
      } else {
        process.env.PAPERCLIP_API_URL = previousApiUrl;
      }

      if (previousApiKey === undefined) {
        delete process.env.PAPERCLIP_API_KEY;
      } else {
        process.env.PAPERCLIP_API_KEY = previousApiKey;
      }
    }
  });

  it("carries saved board access forward when sync returns a different imported company id", async () => {
    const repositoryPath = await createRepositoryFixture();
    const previousApiUrl = process.env.PAPERCLIP_API_URL;
    const previousApiKey = process.env.PAPERCLIP_API_KEY;
    const previousPaperclipAuthStore = process.env.PAPERCLIP_AUTH_STORE;
    const originalFetch = globalThis.fetch;

    process.env.PAPERCLIP_API_URL = "http://127.0.0.1:3210";
    delete process.env.PAPERCLIP_API_KEY;
    process.env.PAPERCLIP_AUTH_STORE = await createIsolatedPaperclipAuthStore();
    globalThis.fetch = async (input) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (url === "http://127.0.0.1:3210/api/companies/paperclip-company-123/issues") {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        });
      }

      throw new Error(`Unexpected fetch to ${url}`);
    };

    try {
      const plugin = createAgentCompaniesPlugin({
        now: () => "2026-04-15T10:00:00.000Z",
        startupAutoSyncDelayMs: null,
        syncImport: async () => ({
          company: {
            id: "paperclip-company-456",
            name: "Alpha Labs Imported",
            action: "updated"
          }
        })
      });
      const harness = createTestHarness({
        manifest,
        capabilities: [...manifest.capabilities]
      });

      await harness.ctx.state.set(CATALOG_SCOPE, {
        repositories: [],
        updatedAt: "2026-04-14T09:00:00.000Z"
      });

      await plugin.definition.setup(harness.ctx);
      await harness.performAction("catalog.add-repository", {
        url: repositoryPath
      });

      const catalog = await harness.getData<CatalogSnapshot>("catalog.read");
      const company = catalog.companies.find((candidate) => candidate.slug === "alpha-labs");

      await harness.performAction("catalog.record-company-import", {
        sourceCompanyId: company?.id,
        importedCompanyId: "paperclip-company-123",
        importedCompanyName: "Alpha Labs Imported",
        importedCompanyIssuePrefix: "ALP"
      });
      await harness.performAction("board-access.update", {
        companyId: "paperclip-company-123",
        paperclipBoardApiTokenRef: "secret-board-token-ref",
        identity: "Agent Operator"
      });

      await setFixtureRepositoryVersion(repositoryPath, "1.1.0");

      await harness.performAction<CatalogCompanySyncResult>("catalog.sync-company", {
        sourceCompanyId: company?.id,
        importedCompanyId: "paperclip-company-123"
      });

      const migrated = await harness.getData<{
        companyId: string | null;
        configured: boolean;
        identity: string | null;
        updatedAt: string | null;
      }>("board-access.read", {
        companyId: "paperclip-company-456"
      });

      expect(migrated).toMatchObject({
        companyId: "paperclip-company-456",
        configured: true,
        identity: "Agent Operator"
      });
      expect(migrated.updatedAt).toBeTruthy();
    } finally {
      globalThis.fetch = originalFetch;
      if (previousApiUrl === undefined) {
        delete process.env.PAPERCLIP_API_URL;
      } else {
        process.env.PAPERCLIP_API_URL = previousApiUrl;
      }

      if (previousApiKey === undefined) {
        delete process.env.PAPERCLIP_API_KEY;
      } else {
        process.env.PAPERCLIP_API_KEY = previousApiKey;
      }

      if (previousPaperclipAuthStore === undefined) {
        delete process.env.PAPERCLIP_AUTH_STORE;
      } else {
        process.env.PAPERCLIP_AUTH_STORE = previousPaperclipAuthStore;
      }
    }
  });

  it("marks sync as failed when board access carry-forward cannot be persisted", async () => {
    const repositoryPath = await createRepositoryFixture();
    const previousApiUrl = process.env.PAPERCLIP_API_URL;
    const previousApiKey = process.env.PAPERCLIP_API_KEY;
    const previousPaperclipAuthStore = process.env.PAPERCLIP_AUTH_STORE;
    const originalFetch = globalThis.fetch;

    process.env.PAPERCLIP_API_URL = "http://127.0.0.1:3210";
    delete process.env.PAPERCLIP_API_KEY;
    process.env.PAPERCLIP_AUTH_STORE = await createIsolatedPaperclipAuthStore();
    globalThis.fetch = async (input) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (url === "http://127.0.0.1:3210/api/companies/paperclip-company-123/issues") {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        });
      }

      throw new Error(`Unexpected fetch to ${url}`);
    };

    try {
      const plugin = createAgentCompaniesPlugin({
        now: () => "2026-04-15T10:00:00.000Z",
        startupAutoSyncDelayMs: null,
        syncImport: async () => ({
          company: {
            id: "paperclip-company-456",
            name: "Alpha Labs Imported",
            action: "updated"
          }
        })
      });
      const harness = createTestHarness({
        manifest,
        capabilities: [...manifest.capabilities]
      });

      await harness.ctx.state.set(CATALOG_SCOPE, {
        repositories: [],
        updatedAt: "2026-04-14T09:00:00.000Z"
      });

      await plugin.definition.setup(harness.ctx);
      await harness.performAction("catalog.add-repository", {
        url: repositoryPath
      });

      const catalog = await harness.getData<CatalogSnapshot>("catalog.read");
      const company = catalog.companies.find((candidate) => candidate.slug === "alpha-labs");

      await harness.performAction("catalog.record-company-import", {
        sourceCompanyId: company?.id,
        importedCompanyId: "paperclip-company-123",
        importedCompanyName: "Alpha Labs Imported",
        importedCompanyIssuePrefix: "ALP"
      });
      await harness.performAction("board-access.update", {
        companyId: "paperclip-company-123",
        paperclipBoardApiTokenRef: "secret-board-token-ref",
        identity: "Agent Operator"
      });
      await setFixtureRepositoryVersion(repositoryPath, "1.1.0");

      const originalStateSet = harness.ctx.state.set.bind(harness.ctx.state);
      harness.ctx.state.set = async (scope, value) => {
        if (
          scope?.scopeKind === "instance"
          && scope.stateKey === "agent-companies.board-access.v1"
        ) {
          throw new Error("Board access state write failed.");
        }

        return originalStateSet(scope, value);
      };

      await expect(
        harness.performAction("catalog.sync-company", {
          sourceCompanyId: company?.id,
          importedCompanyId: "paperclip-company-123"
        })
      ).rejects.toThrow("Board access state write failed.");

      const afterFailure = await harness.getData<CatalogSnapshot>("catalog.read");
      const importedCompany = afterFailure.importedCompanies.find(
        (candidate) => candidate.importedCompany.id === "paperclip-company-123"
      );

      expect(importedCompany?.importedCompany.syncStatus).toBe("failed");
      expect(importedCompany?.importedCompany.lastSyncError).toContain("Board access state write failed.");
      expect(
        afterFailure.importedCompanies.some(
          (candidate) => candidate.importedCompany.id === "paperclip-company-456"
        )
      ).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
      if (previousApiUrl === undefined) {
        delete process.env.PAPERCLIP_API_URL;
      } else {
        process.env.PAPERCLIP_API_URL = previousApiUrl;
      }

      if (previousApiKey === undefined) {
        delete process.env.PAPERCLIP_API_KEY;
      } else {
        process.env.PAPERCLIP_API_KEY = previousApiKey;
      }

      if (previousPaperclipAuthStore === undefined) {
        delete process.env.PAPERCLIP_AUTH_STORE;
      } else {
        process.env.PAPERCLIP_AUTH_STORE = previousPaperclipAuthStore;
      }
    }
  });

  it("runs the auto-sync job for due imported companies after rescanning the source repository", async () => {
    const repositoryPath = await createRepositoryFixture();
    let currentTime = "2026-04-14T09:23:00.000Z";
    let syncCount = 0;
    const plugin = createAgentCompaniesPlugin({
      now: () => currentTime,
      startupAutoSyncDelayMs: null,
      syncImport: async (_ctx, input) => {
        syncCount += 1;
        return {
          company: {
            id: input.importedCompanyId,
            name: "Alpha Labs Imported",
            action: "updated"
          },
          agents: [],
          projects: [],
          warnings: []
        };
      }
    });
    const harness = createTestHarness({
      manifest,
      capabilities: [...manifest.capabilities]
    });

    await harness.ctx.state.set(CATALOG_SCOPE, {
      repositories: [],
      updatedAt: "2026-04-14T09:00:00.000Z"
    });

    await plugin.definition.setup(harness.ctx);
    await harness.performAction("catalog.add-repository", {
      url: repositoryPath
    });

    const catalog = await harness.getData<CatalogSnapshot>("catalog.read");
    const company = catalog.companies.find((candidate) => candidate.slug === "alpha-labs");

    await harness.performAction("catalog.record-company-import", {
      sourceCompanyId: company?.id,
      importedCompanyId: "paperclip-company-123",
      importedCompanyName: "Alpha Labs Imported",
      importedCompanyIssuePrefix: "ALP"
    });

    await setFixtureRepositoryVersion(repositoryPath, "1.1.0");

    currentTime = "2026-04-15T09:24:00.000Z";
    await harness.runJob("catalog-auto-sync");

    expect(syncCount).toBe(1);

    const afterJob = await harness.getData<CatalogSnapshot>("catalog.read");
    const importedCompany = afterJob.importedCompanies.find(
      (candidate) => candidate.importedCompany.id === "paperclip-company-123"
    );

    expect(afterJob.repositories[0]?.lastScannedAt).toBe("2026-04-15T09:24:00.000Z");
    expect(importedCompany?.importedCompany.lastSyncedAt).toBe("2026-04-15T09:24:00.000Z");
    expect(importedCompany?.importedCompany.syncStatus).toBe("succeeded");
    expect(importedCompany?.importedCompany.importedSourceVersion).toBe("1.1.0");
    expect(importedCompany?.importedCompany.isSyncAvailable).toBe(false);
  });

  it("runs overdue auto-sync shortly after startup so restarts do not miss the configured cadence", async () => {
    const repositoryPath = await createRepositoryFixture();
    const repository = createRepositorySource(repositoryPath);
    const discoveredCompanies = await scanRepositoryForAgentCompanies(repositoryPath, repository.id);
    const alphaCompany = discoveredCompanies.find((candidate) => candidate.slug === "alpha-labs");

    expect(alphaCompany).toBeTruthy();

    let currentTime = "2026-04-15T09:24:00.000Z";
    let syncCount = 0;
    const plugin = createAgentCompaniesPlugin({
      now: () => currentTime,
      startupAutoSyncDelayMs: 0,
      syncImport: async (_ctx, input) => {
        syncCount += 1;
        return {
          company: {
            id: input.importedCompanyId,
            name: "Alpha Labs Imported",
            action: "updated"
          },
          agents: [],
          projects: [],
          warnings: []
        };
      }
    });
    const harness = createTestHarness({
      manifest,
      capabilities: [...manifest.capabilities]
    });

    await harness.ctx.state.set(CATALOG_SCOPE, {
      repositories: [
        {
          ...repository,
          status: "ready",
          companies: discoveredCompanies,
          lastScannedAt: "2026-04-13T09:23:00.000Z",
          lastScanError: null
        }
      ],
      importedCompanies: [
        {
          sourceCompanyId: alphaCompany?.id ?? "missing-company",
          importedCompanyId: "paperclip-company-123",
          importedCompanyName: "Alpha Labs Imported",
          importedCompanyIssuePrefix: "ALP",
          importedSourceVersion: "0.9.0",
          importedAt: "2026-04-13T09:23:00.000Z",
          autoSyncEnabled: true,
          syncCollisionStrategy: DEFAULT_SYNC_COLLISION_STRATEGY,
          lastSyncStatus: "succeeded",
          lastSyncAttemptAt: "2026-04-13T09:23:00.000Z",
          lastSyncedAt: "2026-04-13T09:23:00.000Z",
          lastSyncError: null,
          syncRunningSince: null
        }
      ],
      updatedAt: "2026-04-13T09:23:00.000Z"
    });

    await plugin.definition.setup(harness.ctx);

    const waitDeadline = Date.now() + 1000;
    while (syncCount === 0 && Date.now() < waitDeadline) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
    }

    expect(syncCount).toBe(1);

    const afterStartupSync = await harness.getData<CatalogSnapshot>("catalog.read");
    const importedCompany = afterStartupSync.importedCompanies.find(
      (candidate) => candidate.importedCompany.id === "paperclip-company-123"
    );

    expect(importedCompany?.importedCompany.lastSyncedAt).toBe("2026-04-15T09:24:00.000Z");
    expect(importedCompany?.importedCompany.syncStatus).toBe("succeeded");
    expect(importedCompany?.importedCompany.importedSourceVersion).toBe("1.0.0");
    expect(importedCompany?.importedCompany.isSyncAvailable).toBe(false);
  });

  it("rescans each due repository once before attempting syncs from it", async () => {
    const repositoryPath = await createRepositoryFixture();
    let currentTime = "2026-04-14T09:23:00.000Z";
    let scanCount = 0;
    const plugin = createAgentCompaniesPlugin({
      now: () => currentTime,
      startupAutoSyncDelayMs: null,
      scanRepository: async (repository) => {
        scanCount += 1;
        return scanRepositoryForAgentCompanies(repository.url, repository.id);
      },
      syncImport: async (_ctx, input) => {
        return {
          company: {
            id: input.importedCompanyId,
            name: input.importedCompanyId,
            action: "updated"
          },
          agents: [],
          projects: [],
          warnings: []
        };
      }
    });
    const harness = createTestHarness({
      manifest,
      capabilities: [...manifest.capabilities]
    });

    await harness.ctx.state.set(CATALOG_SCOPE, {
      repositories: [],
      updatedAt: "2026-04-14T09:00:00.000Z"
    });

    await plugin.definition.setup(harness.ctx);
    await harness.performAction("catalog.add-repository", {
      url: repositoryPath
    });

    const catalog = await harness.getData<CatalogSnapshot>("catalog.read");
    const company = catalog.companies.find((candidate) => candidate.slug === "alpha-labs");

    await harness.performAction("catalog.record-company-import", {
      sourceCompanyId: company?.id,
      importedCompanyId: "paperclip-company-123",
      importedCompanyName: "Alpha Labs Imported",
      importedCompanyIssuePrefix: "ALP"
    });
    await harness.performAction("catalog.record-company-import", {
      sourceCompanyId: company?.id,
      importedCompanyId: "paperclip-company-456",
      importedCompanyName: "Alpha Labs Sandbox",
      importedCompanyIssuePrefix: "ALPS"
    });

    await setFixtureRepositoryVersion(repositoryPath, "1.1.0");

    currentTime = "2026-04-15T09:24:00.000Z";
    await harness.runJob("catalog-auto-sync");

    expect(scanCount).toBe(2);

    const afterJob = await harness.getData<CatalogSnapshot>("catalog.read");
    expect(afterJob.repositories[0]?.lastScannedAt).toBe("2026-04-15T09:24:00.000Z");
  });

  it("returns null when tampered company content paths resolve outside the repository root", async () => {
    const repositoryPath = await createRepositoryFixture();
    const repository = createRepositorySource(repositoryPath);
    const plugin = createAgentCompaniesPlugin({
      now: () => "2026-04-14T09:25:00.000Z"
    });
    const harness = createTestHarness({
      manifest,
      capabilities: [...manifest.capabilities]
    });

    await harness.ctx.state.set(CATALOG_SCOPE, {
      repositories: [
        {
          ...repository,
          status: "ready",
          companies: [
            {
              id: `${repository.id}:alpha/COMPANY.md`,
              name: "Alpha Labs",
              slug: "alpha-labs",
              description: "Fixture company",
              schema: AGENT_COMPANIES_SCHEMA,
              version: "1.0.0",
              relativePath: "alpha",
              manifestPath: "../outside/COMPANY.md",
              contents: {
                agents: [],
                projects: [],
                tasks: [],
                issues: [],
                skills: [
                  {
                    name: "Repo Audit",
                    path: "skills/repo-audit/SKILL.md"
                  }
                ]
              }
            }
          ],
          lastScannedAt: "2026-04-14T09:20:00.000Z",
          lastScanError: null
        }
      ],
      updatedAt: "2026-04-14T09:20:00.000Z"
    });

    await plugin.definition.setup(harness.ctx);

    const detail = await harness.getData<CatalogCompanyContentDetail | null>(
      "catalog.company-content.read",
      {
        companyId: `${repository.id}:alpha/COMPANY.md`,
        itemPath: "skills/repo-audit/SKILL.md"
      }
    );

    expect(detail).toBeNull();
  });

  it("reuses one in-flight repository clone for concurrent content root resolution", async () => {
    const repository = createRepositorySource("https://github.com/alvarosanchez/micronaut-agent-company");
    let cloneCount = 0;

    const [firstRoot, secondRoot] = await Promise.all([
      resolveRepositoryContentRoot(repository, {
        cloneCheckout: async () => {
          cloneCount += 1;

          const tempDirectory = await mkdtemp(
            join(tmpdir(), "paperclip-agent-companies-plugin-content-root-test-")
          );
          tempDirectories.push(tempDirectory);

          const checkoutDirectory = join(tempDirectory, "checkout");
          await mkdir(checkoutDirectory, { recursive: true });
          await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));

          return {
            checkoutDirectory,
            tempDirectory
          };
        }
      }),
      resolveRepositoryContentRoot(repository, {
        cloneCheckout: async () => {
          cloneCount += 1;

          const tempDirectory = await mkdtemp(
            join(tmpdir(), "paperclip-agent-companies-plugin-content-root-test-")
          );
          tempDirectories.push(tempDirectory);

          const checkoutDirectory = join(tempDirectory, "checkout");
          await mkdir(checkoutDirectory, { recursive: true });
          await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));

          return {
            checkoutDirectory,
            tempDirectory
          };
        }
      })
    ]);

    expect(cloneCount).toBe(1);
    expect(firstRoot).toBe(secondRoot);

    await clearRepositoryCheckoutCacheEntry(repository.id);
  });

  it("only auto-scans seeded sources when catalog state is missing", async () => {
    let scanCount = 0;
    const plugin = createAgentCompaniesPlugin({
      scanRepository: async () => {
        scanCount += 1;
        return [
          {
            id: "repo-legacy:legacy-company/COMPANY.md",
            name: "Legacy Company",
            slug: "legacy-company",
            description: "Persisted catalog fixture",
            schema: AGENT_COMPANIES_SCHEMA,
            version: "1.0.0",
            relativePath: "legacy-company",
            manifestPath: "legacy-company/COMPANY.md",
            contents: createEmptyCompanyContents()
          }
        ];
      },
      now: () => "2026-04-14T09:30:00.000Z"
    });
    const harness = createTestHarness({
      manifest,
      capabilities: [...manifest.capabilities]
    });

    await harness.ctx.state.set(CATALOG_SCOPE, {
      repositories: [createRepositorySource(DEFAULT_REPOSITORY_URL)],
      updatedAt: "2026-04-14T09:00:00.000Z"
    });

    await plugin.definition.setup(harness.ctx);

    const data = await harness.getData<CatalogSnapshot>("catalog.read");

    expect(scanCount).toBe(0);
    expect(data.repositories).toHaveLength(1);
    expect(data.repositories[0]?.status).toBe("idle");
    expect(data.repositories[0]?.lastScannedAt).toBeNull();
    expect(data.summary.companyCount).toBe(0);
  });

  it("keeps an explicitly empty persisted catalog empty", async () => {
    let scanCount = 0;
    const plugin = createAgentCompaniesPlugin({
      scanRepository: async () => {
        scanCount += 1;
        return [];
      },
      now: () => "2026-04-14T10:00:00.000Z"
    });
    const harness = createTestHarness({
      manifest,
      capabilities: [...manifest.capabilities]
    });

    await harness.ctx.state.set(CATALOG_SCOPE, {
      repositories: [],
      updatedAt: "2026-04-14T09:45:00.000Z"
    });

    await plugin.definition.setup(harness.ctx);

    const data = await harness.getData<CatalogSnapshot>("catalog.read");

    expect(scanCount).toBe(0);
    expect(data.repositories).toHaveLength(0);
    expect(data.summary.repositoryCount).toBe(0);
    expect(data.summary.companyCount).toBe(0);
  });

  it("prefers the user's git home so credentialed repositories can reuse local git config", async () => {
    const workerHome = await mkdtemp(join(tmpdir(), "paperclip-agent-companies-plugin-worker-home-"));
    const userHome = await mkdtemp(join(tmpdir(), "paperclip-agent-companies-plugin-user-home-"));
    tempDirectories.push(workerHome, userHome);

    await writeFile(join(userHome, ".gitconfig"), "[credential]\n  helper = store\n");

    const environment = await buildGitProcessEnvironment({
      env: {
        HOME: workerHome
      },
      preferredHomeDirectory: userHome
    });

    expect(environment.HOME).toBe(userHome);
    expect(environment.GIT_CONFIG_GLOBAL).toBe(join(userHome, ".gitconfig"));
    expect(environment.GIT_TERMINAL_PROMPT).toBe("0");
  });

  it("prefers the hosted Paperclip api base saved in plugin state over inferred local config", async () => {
    const previousApiUrl = process.env.PAPERCLIP_API_URL;
    const previousPaperclipHome = process.env.PAPERCLIP_HOME;
    const previousPaperclipInstanceId = process.env.PAPERCLIP_INSTANCE_ID;
    const previousConfigPath = process.env.PAPERCLIP_CONFIG_PATH;
    const paperclipHome = await mkdtemp(join(tmpdir(), "paperclip-agent-companies-plugin-home-"));
    tempDirectories.push(paperclipHome);

    await mkdir(join(paperclipHome, "instances", "default"), { recursive: true });
    await writeFile(
      join(paperclipHome, "instances", "default", "config.json"),
      JSON.stringify({
        server: {
          port: 3100
        }
      })
    );

    delete process.env.PAPERCLIP_API_URL;
    delete process.env.PAPERCLIP_CONFIG_PATH;
    process.env.PAPERCLIP_HOME = paperclipHome;
    delete process.env.PAPERCLIP_INSTANCE_ID;

    try {
      const plugin = createAgentCompaniesPlugin({
        startupAutoSyncDelayMs: null
      });
      const harness = createTestHarness({
        manifest,
        capabilities: [...manifest.capabilities]
      });

      await plugin.definition.setup(harness.ctx);
      await harness.performAction("paperclip-runtime.set-api-base", {
        apiBase: "http://127.0.0.1:63323/"
      });

      const connection = await resolvePaperclipApiConnection(harness.ctx);

      expect(connection.apiBase).toBe("http://127.0.0.1:63323");
      expect(connection.apiKey).toBeNull();
    } finally {
      if (previousApiUrl === undefined) {
        delete process.env.PAPERCLIP_API_URL;
      } else {
        process.env.PAPERCLIP_API_URL = previousApiUrl;
      }

      if (previousPaperclipHome === undefined) {
        delete process.env.PAPERCLIP_HOME;
      } else {
        process.env.PAPERCLIP_HOME = previousPaperclipHome;
      }

      if (previousPaperclipInstanceId === undefined) {
        delete process.env.PAPERCLIP_INSTANCE_ID;
      } else {
        process.env.PAPERCLIP_INSTANCE_ID = previousPaperclipInstanceId;
      }

      if (previousConfigPath === undefined) {
        delete process.env.PAPERCLIP_CONFIG_PATH;
      } else {
        process.env.PAPERCLIP_CONFIG_PATH = previousConfigPath;
      }
    }
  });

  it("scans real git repositories for agent company manifests", async () => {
    const repositoryPath = await createRepositoryFixture();
    await addRecurringTaskFixture(repositoryPath);

    const companies = await scanRepositoryForAgentCompanies(repositoryPath, "fixture-repository");

    expect(companies).toHaveLength(2);
    expect(companies.map((company) => company.slug)).toEqual(["alpha-labs", "beta-works"]);
    expect(companies.map((company) => company.manifestPath)).toEqual([
      "alpha/COMPANY.md",
      "nested/beta/COMPANY.md"
    ]);
    expect(companies[0]?.contents.agents.map((item) => item.name)).toEqual(["Alpha CEO"]);
    expect(companies[0]?.contents.skills.map((item) => item.name)).toEqual(["Repo Audit"]);
    expect(companies[0]?.contents.projects.map((item) => item.name)).toEqual(["Import Pipeline"]);
    expect(companies[0]?.contents.tasks.map((item) => item.name)).toEqual([
      "Monday Review",
      "Seed Default Company"
    ]);
    const recurringTask = companies[0]?.contents.tasks.find((item) => item.path === "tasks/monday-review/TASK.md");
    expect(recurringTask?.recurring).toBe(true);
    expect(recurringTask?.paperclipRoutineStatus).toBe("paused");
    expect(recurringTask?.paperclipRoutineTriggerCount).toBe(2);
    expect(recurringTask?.dependencyPaths).toEqual([
      "agents/ceo/AGENTS.md",
      "projects/import-pipeline/PROJECT.md"
    ]);
    expect(companies[0]?.contents.issues.map((item) => item.name)).toEqual(["Follow Up Review"]);
    expect(companies[1]?.contents.agents.map((item) => item.name)).toEqual(["Beta Operator"]);
    expect(companies[1]?.contents.skills).toEqual([]);
  });

  it("groups tasks and Paperclip issue manifests into one visible Tasks section and hides empty sections", async () => {
    const repositoryPath = await createRepositoryFixture();
    await addRecurringTaskFixture(repositoryPath);

    const companies = await scanRepositoryForAgentCompanies(repositoryPath, "fixture-repository");
    const alphaSections = getVisibleCompanyContentSections(companies[0]?.contents ?? createEmptyCompanyContents());
    const alphaTasksSection = alphaSections.find((section) => section.id === "tasks");
    const betaSections = getVisibleCompanyContentSections(companies[1]?.contents ?? createEmptyCompanyContents());

    expect(alphaSections.map((section) => section.label)).toEqual([
      "Agents",
      "Projects",
      "Tasks",
      "Skills"
    ]);
    expect(alphaTasksSection).toBeTruthy();
    expect(
      alphaTasksSection
        ? getCompanyContentSectionItemCount(companies[0]?.contents ?? createEmptyCompanyContents(), alphaTasksSection)
        : null
    ).toBe(3);
    expect(
      alphaTasksSection
        ? listCompanyContentSectionItems(
            companies[0]?.contents ?? createEmptyCompanyContents(),
            alphaTasksSection
          ).map((entry) => `${entry.kind}:${entry.item.path}`)
        : []
    ).toEqual([
      "issues:issues/follow-up/ISSUE.md",
      "tasks:projects/import-pipeline/tasks/seed-default/TASK.md",
      "tasks:tasks/monday-review/TASK.md"
    ]);
    expect(betaSections.map((section) => section.label)).toEqual(["Agents"]);
  });

  it("identifies required dependency items and the selected work items that require them", async () => {
    const repositoryPath = await createRepositoryFixture();
    await addRecurringTaskFixture(repositoryPath);

    const companies = await scanRepositoryForAgentCompanies(repositoryPath, "fixture-repository");
    const alphaContents = companies[0]?.contents ?? createEmptyCompanyContents();
    const selection = resolveCompanyImportSelection(alphaContents, {
      agents: { mode: "none" },
      projects: { mode: "none" },
      tasks: { mode: "selected", itemPaths: ["tasks/monday-review/TASK.md"] },
      issues: { mode: "none" },
      skills: { mode: "none" }
    });

    expect(
      isCompanyContentItemRequiredBySelection(
        alphaContents,
        selection,
        "projects",
        "projects/import-pipeline/PROJECT.md"
      )
    ).toBe(true);
    expect(
      isCompanyContentItemRequiredBySelection(
        alphaContents,
        selection,
        "agents",
        "agents/ceo/AGENTS.md"
      )
    ).toBe(true);
    expect(
      isCompanyContentItemRequiredBySelection(
        alphaContents,
        selection,
        "tasks",
        "tasks/monday-review/TASK.md"
      )
    ).toBe(false);
    expect(
      getCompanyContentItemRequirementSources(
        alphaContents,
        selection,
        "projects/import-pipeline/PROJECT.md"
      ).map((entry) => `${entry.kind}:${entry.item.name}`)
    ).toEqual(["tasks:Monday Review"]);
    expect(
      getCompanyContentItemRequirementSources(
        alphaContents,
        selection,
        "agents/ceo/AGENTS.md"
      ).map((entry) => `${entry.kind}:${entry.item.name}`)
    ).toEqual(["tasks:Monday Review"]);
  });
});
