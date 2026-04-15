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
  DEFAULT_SYNC_COLLISION_STRATEGY,
  CATALOG_STATE_KEY,
  DEFAULT_REPOSITORY_URL,
  type CatalogCompanyContentDetail,
  type CatalogPreparedCompanyImport,
  type CatalogCompanySyncResult,
  createRepositorySource,
  createEmptyCompanyContents,
  normalizeCatalogState,
  normalizeRepositoryCloneRef,
  normalizeRepositoryReference,
  type CatalogSnapshot
} from "../src/catalog.js";
import {
  buildGitProcessEnvironment,
  clearRepositoryCheckoutCacheEntry,
  createAgentCompaniesPlugin,
  resolveRepositoryContentRoot,
  scanRepositoryForAgentCompanies,
  shouldStartWorkerHost
} from "../src/worker.js";

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

describe("agent companies plugin", () => {
  it("declares the custom settings surface and required capabilities", () => {
    expect(manifest.description).toContain("Discover Agent Companies packages");
    expect(manifest.capabilities).toEqual([
      "instance.settings.register",
      "plugin.state.read",
      "plugin.state.write",
      "jobs.schedule",
      "http.outbound",
      "ui.page.register"
    ]);
    expect(manifest.jobs).toEqual([
      {
        jobKey: "catalog-auto-sync",
        displayName: "Daily Agent Company Auto-Sync",
        description: "Checks imported agent companies and syncs any source that is due for its daily update.",
        schedule: "0 3 * * *"
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
    const fetchRequests: Array<{ url: string; authorization: string | null }> = [];

    process.env.PAPERCLIP_API_URL = "http://127.0.0.1:3210";
    process.env.PAPERCLIP_API_KEY = "paperclip-secret";
    globalThis.fetch = async (input, init) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const headers = new Headers(init?.headers);
      fetchRequests.push({
        url,
        authorization: headers.get("authorization")
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

  it("tracks imported companies and blocks repeat imports", async () => {
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

    expect(company?.importedCompany).toBeNull();

    await harness.performAction("catalog.record-company-import", {
      sourceCompanyId: company?.id,
      importedCompanyId: "paperclip-company-123",
      importedCompanyName: "Alpha Labs Imported",
      importedCompanyIssuePrefix: "ALP"
    });

    const afterImportRecord = await harness.getData<CatalogSnapshot>("catalog.read");
    const importedCompany = afterImportRecord.companies.find(
      (candidate) => candidate.id === company?.id
    );

    expect(importedCompany?.importedCompany).toEqual({
      id: "paperclip-company-123",
      name: "Alpha Labs Imported",
      issuePrefix: "ALP",
      importedSourceVersion: "1.0.0",
      latestSourceVersion: "1.0.0",
      importedAt: "2026-04-14T09:23:00.000Z",
      autoSyncEnabled: true,
      syncCollisionStrategy: DEFAULT_SYNC_COLLISION_STRATEGY,
      syncStatus: "succeeded",
      lastSyncAttemptAt: "2026-04-14T09:23:00.000Z",
      lastSyncedAt: "2026-04-14T09:23:00.000Z",
      lastSyncError: null,
      syncRunningSince: null,
      isSyncAvailable: false,
      isUpToDate: true,
      isAutoSyncDue: false,
      nextAutoSyncAt: "2026-04-15T09:23:00.000Z"
    });

    await expect(
      harness.performAction("catalog.prepare-company-import", {
        companyId: company?.id
      })
    ).rejects.toThrow(
      '"Alpha Labs" has already been imported as "ALP". Use sync to update the existing Paperclip company.'
    );
  });

  it("lets operators disable daily auto-sync for an imported company", async () => {
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

    const afterDisable = await harness.performAction<CatalogSnapshot>("catalog.set-company-auto-sync", {
      sourceCompanyId: company?.id,
      enabled: false
    });
    const importedCompany = afterDisable.companies.find((candidate) => candidate.id === company?.id);

    expect(importedCompany?.importedCompany?.autoSyncEnabled).toBe(false);
    expect(importedCompany?.importedCompany?.isAutoSyncDue).toBe(false);
    expect(importedCompany?.importedCompany?.nextAutoSyncAt).toBeNull();
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

    await setFixtureRepositoryVersion(repositoryPath, "1.1.0");

    currentTime = "2026-04-15T10:00:00.000Z";
    const syncResult = await harness.performAction<CatalogCompanySyncResult>("catalog.sync-company", {
      companyId: company?.id
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
    const importedCompany = afterSync.companies.find((candidate) => candidate.id === company?.id);

    expect(importedCompany?.importedCompany?.syncStatus).toBe("succeeded");
    expect(importedCompany?.importedCompany?.lastSyncedAt).toBe("2026-04-15T10:00:00.000Z");
    expect(importedCompany?.importedCompany?.lastSyncError).toBeNull();
    expect(importedCompany?.importedCompany?.importedSourceVersion).toBe("1.1.0");
    expect(importedCompany?.importedCompany?.latestSourceVersion).toBe("1.1.0");
    expect(importedCompany?.importedCompany?.isSyncAvailable).toBe(false);
    expect(importedCompany?.importedCompany?.isUpToDate).toBe(true);
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
      companyId: company?.id
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
      companyId: company?.id
    });

    expect(syncCount).toBe(0);
    expect(syncResult.company?.action).toBe("unchanged");
    expect(syncResult.importedSourceVersion).toBe("1.0.0");
    expect(syncResult.latestSourceVersion).toBe("1.0.0");
    expect(syncResult.upToDate).toBe(true);

    const afterSync = await harness.getData<CatalogSnapshot>("catalog.read");
    const importedCompany = afterSync.companies.find((candidate) => candidate.id === company?.id);

    expect(importedCompany?.importedCompany?.lastSyncedAt).toBe("2026-04-15T10:00:00.000Z");
    expect(importedCompany?.importedCompany?.isSyncAvailable).toBe(false);
    expect(importedCompany?.importedCompany?.isUpToDate).toBe(true);
  });

  it("runs the daily auto-sync job for due imported companies", async () => {
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
    const importedCompany = afterJob.companies.find((candidate) => candidate.id === company?.id);

    expect(importedCompany?.importedCompany?.lastSyncedAt).toBe("2026-04-15T09:24:00.000Z");
    expect(importedCompany?.importedCompany?.syncStatus).toBe("succeeded");
    expect(importedCompany?.importedCompany?.importedSourceVersion).toBe("1.1.0");
    expect(importedCompany?.importedCompany?.isSyncAvailable).toBe(false);
  });

  it("runs overdue auto-sync shortly after startup so restarts do not miss the daily cadence", async () => {
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
    const importedCompany = afterStartupSync.companies.find(
      (candidate) => candidate.id === alphaCompany?.id
    );

    expect(importedCompany?.importedCompany?.lastSyncedAt).toBe("2026-04-15T09:24:00.000Z");
    expect(importedCompany?.importedCompany?.syncStatus).toBe("succeeded");
    expect(importedCompany?.importedCompany?.importedSourceVersion).toBe("1.0.0");
    expect(importedCompany?.importedCompany?.isSyncAvailable).toBe(false);
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

  it("scans real git repositories for agent company manifests", async () => {
    const repositoryPath = await createRepositoryFixture();

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
    expect(companies[0]?.contents.tasks.map((item) => item.name)).toEqual(["Seed Default Company"]);
    expect(companies[0]?.contents.issues.map((item) => item.name)).toEqual(["Follow Up Review"]);
    expect(companies[1]?.contents.agents.map((item) => item.name)).toEqual(["Beta Operator"]);
    expect(companies[1]?.contents.skills).toEqual([]);
  });
});
