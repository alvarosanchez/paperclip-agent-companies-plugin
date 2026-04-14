import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { spawn } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import {
  AGENT_COMPANIES_SCHEMA,
  CATALOG_STATE_KEY,
  DEFAULT_REPOSITORY_URL,
  type CatalogCompanyContentDetail,
  createRepositorySource,
  createEmptyCompanyContents,
  normalizeRepositoryCloneRef,
  normalizeRepositoryReference,
  type CatalogSnapshot
} from "../src/catalog.js";
import {
  buildGitProcessEnvironment,
  createAgentCompaniesPlugin,
  scanRepositoryForAgentCompanies
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

describe("agent companies plugin", () => {
  it("declares the custom settings surface and required capabilities", () => {
    expect(manifest.description).toContain("Discover Agent Companies packages");
    expect(manifest.capabilities).toEqual([
      "instance.settings.register",
      "plugin.state.read",
      "plugin.state.write",
      "ui.page.register"
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
