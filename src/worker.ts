import { constants } from "node:fs";
import { access, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir, userInfo } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { spawn } from "node:child_process";
import { definePlugin, runWorker, type PluginContext, type ScopeKey } from "@paperclipai/plugin-sdk";
import {
  AGENT_COMPANIES_SCHEMA,
  buildCatalogSnapshot,
  CATALOG_STATE_KEY,
  createRepositorySource,
  hasPersistedCatalogRepositories,
  normalizeCatalogState,
  normalizeRepositoryCloneRef,
  type CatalogSnapshot,
  type DiscoveredAgentCompany,
  type RepositorySource,
  type CatalogState
} from "./catalog.js";

const CATALOG_SCOPE: ScopeKey = {
  scopeKind: "instance",
  stateKey: CATALOG_STATE_KEY
};

const IGNORED_DIRECTORY_NAMES = new Set([
  ".git",
  ".next",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules"
]);

const FRONTMATTER_PATTERN = /^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/u;

type RepositoryScanner = (repository: RepositorySource) => Promise<DiscoveredAgentCompany[]>;

interface AgentCompaniesPluginOptions {
  now?: () => string;
  scanRepository?: RepositoryScanner;
}

interface ProcessResult {
  stdout: string;
  stderr: string;
}

interface GitProcessEnvironmentOptions {
  env?: NodeJS.ProcessEnv;
  preferredHomeDirectory?: string;
  pathExists?: (path: string) => Promise<boolean>;
}

interface LoadedCatalogState {
  state: CatalogState;
  hasPersistedRepositories: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toPosixPath(value: string): string {
  return value.split(sep).join("/");
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function resolveUserHomeDirectory(): string {
  try {
    const homeDirectory = userInfo().homedir.trim();
    if (homeDirectory) {
      return homeDirectory;
    }
  } catch {
    // fall back to the worker environment when OS lookup is unavailable
  }

  return process.env.HOME?.trim() ?? "";
}

function getCredentialConfigPaths(homeDirectory: string): {
  gitConfigPath: string;
  gitCredentialsPath: string;
  xdgConfigHome: string;
  xdgGitConfigPath: string;
} {
  const xdgConfigHome = join(homeDirectory, ".config");

  return {
    gitConfigPath: join(homeDirectory, ".gitconfig"),
    gitCredentialsPath: join(homeDirectory, ".git-credentials"),
    xdgConfigHome,
    xdgGitConfigPath: join(xdgConfigHome, "git", "config")
  };
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "") || "agent-company";
}

function getTopLevelScalar(frontmatter: string, key: string): string | null {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, "mu"));
  if (!match) {
    return null;
  }

  const value = match[1].trim();
  if (!value || value === "|" || value === ">") {
    return null;
  }

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).replace(/\\"/gu, '"').replace(/''/gu, "'");
  }

  return value;
}

function summarizeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/gu, " ").trim().slice(0, 600);
}

function summarizeRepositoryCloneFailure(message: string): string {
  const normalizedMessage = message.replace(/\s+/gu, " ").trim();

  if (
    normalizedMessage.includes("could not read Username for 'https://github.com'") ||
    normalizedMessage.includes("terminal prompts disabled")
  ) {
    return "GitHub authentication is required for this repository. The plugin will use your local git credentials when available, but this repo still is not accessible from the worker.";
  }

  if (
    normalizedMessage.toLowerCase().includes("repository not found") ||
    normalizedMessage.toLowerCase().includes("authentication failed")
  ) {
    return "The repository could not be reached with the current git credentials.";
  }

  return normalizedMessage;
}

export async function buildGitProcessEnvironment(
  options: GitProcessEnvironmentOptions = {}
): Promise<NodeJS.ProcessEnv> {
  const baseEnvironment = options.env ?? process.env;
  const nextEnvironment: NodeJS.ProcessEnv = {
    ...baseEnvironment,
    GIT_TERMINAL_PROMPT: "0"
  };
  const doesPathExist = options.pathExists ?? pathExists;
  const candidateHomeDirectories = [
    options.preferredHomeDirectory?.trim(),
    baseEnvironment.HOME?.trim()
  ].filter((candidate, index, array): candidate is string => Boolean(candidate) && array.indexOf(candidate) === index);

  let selectedHomeDirectory = candidateHomeDirectories[0] ?? null;

  for (const candidateHomeDirectory of candidateHomeDirectories) {
    const { gitConfigPath, gitCredentialsPath, xdgGitConfigPath } = getCredentialConfigPaths(candidateHomeDirectory);
    if (
      (await doesPathExist(gitConfigPath)) ||
      (await doesPathExist(gitCredentialsPath)) ||
      (await doesPathExist(xdgGitConfigPath))
    ) {
      selectedHomeDirectory = candidateHomeDirectory;
      break;
    }
  }

  if (selectedHomeDirectory) {
    const { gitConfigPath, xdgConfigHome, xdgGitConfigPath } = getCredentialConfigPaths(selectedHomeDirectory);
    nextEnvironment.HOME = selectedHomeDirectory;

    if (!nextEnvironment.GIT_CONFIG_GLOBAL && (await doesPathExist(gitConfigPath))) {
      nextEnvironment.GIT_CONFIG_GLOBAL = gitConfigPath;
    }

    if (!nextEnvironment.XDG_CONFIG_HOME && (await doesPathExist(xdgGitConfigPath))) {
      nextEnvironment.XDG_CONFIG_HOME = xdgConfigHome;
    }
  }

  return nextEnvironment;
}

function getRequiredString(params: Record<string, unknown>, key: string): string {
  const value = asNonEmptyString(params[key]);
  if (!value) {
    throw new Error(`${key} is required.`);
  }

  return value;
}

function updateRepository(
  state: CatalogState,
  repositoryId: string,
  updater: (repository: RepositorySource) => RepositorySource
): CatalogState {
  return {
    ...state,
    repositories: state.repositories.map((repository) =>
      repository.id === repositoryId ? updater(repository) : repository
    )
  };
}

function shouldAutoScan(repository: RepositorySource): boolean {
  return (
    repository.status === "idle" &&
    repository.lastScannedAt === null &&
    repository.lastScanError === null &&
    repository.companies.length === 0
  );
}

function looksLikeLocalPath(input: string): boolean {
  return (
    input.startsWith("/") ||
    input.startsWith("./") ||
    input.startsWith("../") ||
    input.startsWith("~/") ||
    /^[A-Za-z]:[\\/]/u.test(input)
  );
}

function canonicalizeRepositoryInput(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Repository URL or local git path is required.");
  }

  if (trimmed.startsWith("~/")) {
    return resolve(resolveUserHomeDirectory(), trimmed.slice(2));
  }

  return looksLikeLocalPath(trimmed) ? resolve(trimmed) : normalizeRepositoryCloneRef(trimmed);
}

async function loadCatalogState(ctx: PluginContext): Promise<CatalogState> {
  const storedState = await ctx.state.get(CATALOG_SCOPE);
  return normalizeCatalogState(storedState);
}

async function loadCatalogStateRecord(ctx: PluginContext): Promise<LoadedCatalogState> {
  const storedState = await ctx.state.get(CATALOG_SCOPE);

  return {
    state: normalizeCatalogState(storedState),
    hasPersistedRepositories: hasPersistedCatalogRepositories(storedState)
  };
}

async function persistCatalogState(
  ctx: PluginContext,
  state: CatalogState,
  now: string
): Promise<CatalogState> {
  const nextState = normalizeCatalogState({
    repositories: state.repositories,
    updatedAt: now
  });

  await ctx.state.set(CATALOG_SCOPE, nextState);
  return nextState;
}

async function scanRepositoryEntry(
  repository: RepositorySource,
  scanRepository: RepositoryScanner,
  timestamp: string,
  logger: PluginContext["logger"]
): Promise<RepositorySource> {
  try {
    const companies = await scanRepository(repository);
    logger.info("Scanned repository for agent companies", {
      repositoryId: repository.id,
      repositoryUrl: repository.url,
      companyCount: companies.length
    });

    return {
      ...repository,
      status: "ready",
      companies,
      lastScannedAt: timestamp,
      lastScanError: null
    };
  } catch (error) {
    const message = summarizeErrorMessage(error);
    logger.warn("Repository scan failed", {
      repositoryId: repository.id,
      repositoryUrl: repository.url,
      error: message
    });

    return {
      ...repository,
      status: "error",
      lastScannedAt: timestamp,
      lastScanError: message
    };
  }
}

async function ensureSeedRepositoriesScanned(
  ctx: PluginContext,
  state: CatalogState,
  hasPersistedRepositories: boolean,
  now: string,
  scanRepository: RepositoryScanner
): Promise<CatalogState> {
  if (hasPersistedRepositories) {
    return state;
  }

  const repositoriesToScan = state.repositories.filter(
    (repository) => repository.isDefault && shouldAutoScan(repository)
  );
  if (repositoriesToScan.length === 0) {
    return state;
  }

  let nextState = state;

  for (const repository of repositoriesToScan) {
    const scannedRepository = await scanRepositoryEntry(repository, scanRepository, now, ctx.logger);
    nextState = updateRepository(nextState, repository.id, () => scannedRepository);
  }

  return persistCatalogState(ctx, nextState, now);
}

function buildCatalogResponse(state: CatalogState): CatalogSnapshot {
  return buildCatalogSnapshot(state);
}

async function runProcess(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
  } = {}
): Promise<ProcessResult> {
  const timeoutMs = options.timeoutMs ?? 120000;

  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      rejectPromise(error);
    });

    child.on("close", (code) => {
      clearTimeout(timer);

      if (timedOut) {
        rejectPromise(new Error(`${command} ${args.join(" ")} timed out after ${timeoutMs}ms.`));
        return;
      }

      if (code !== 0) {
        rejectPromise(
          new Error(
            `${command} ${args.join(" ")} failed with code ${code}: ${
              stderr.trim() || stdout.trim() || "Unknown error"
            }`
          )
        );
        return;
      }

      resolvePromise({ stdout, stderr });
    });
  });
}

async function findCompanyManifestPaths(repositoryRoot: string): Promise<string[]> {
  const manifests: string[] = [];
  const queue = [repositoryRoot];

  while (queue.length > 0) {
    const currentDirectory = queue.pop();
    if (!currentDirectory) {
      continue;
    }

    let entries;
    try {
      entries = await readdir(currentDirectory, { withFileTypes: true });
    } catch (error) {
      if (
        isRecord(error) &&
        (error.code === "ENOENT" || error.code === "ENOTDIR" || error.code === "EACCES")
      ) {
        continue;
      }

      throw error;
    }

    for (const entry of entries) {
      const fullPath = join(currentDirectory, entry.name);

      if (entry.isSymbolicLink()) {
        continue;
      }

      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORY_NAMES.has(entry.name)) {
          queue.push(fullPath);
        }
        continue;
      }

      if (entry.isFile() && entry.name === "COMPANY.md") {
        manifests.push(fullPath);
      }
    }
  }

  manifests.sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));
  return manifests;
}

async function parseAgentCompanyManifest(
  manifestPath: string,
  repositoryRoot: string,
  repositoryId: string
): Promise<DiscoveredAgentCompany | null> {
  let content;
  try {
    content = await readFile(manifestPath, "utf8");
  } catch (error) {
    if (
      isRecord(error) &&
      (error.code === "ENOENT" || error.code === "EISDIR" || error.code === "EACCES")
    ) {
      return null;
    }

    throw error;
  }

  const frontmatterMatch = content.match(FRONTMATTER_PATTERN);
  if (!frontmatterMatch) {
    return null;
  }

  const frontmatter = frontmatterMatch[1];
  const schema = getTopLevelScalar(frontmatter, "schema");
  if (schema !== AGENT_COMPANIES_SCHEMA) {
    return null;
  }

  const directoryRelativePath = toPosixPath(relative(repositoryRoot, dirname(manifestPath)));
  const normalizedRelativePath = directoryRelativePath === "." ? "" : directoryRelativePath;
  const normalizedManifestPath = toPosixPath(relative(repositoryRoot, manifestPath));
  const name =
    getTopLevelScalar(frontmatter, "name") ??
    normalizedRelativePath.split("/").filter(Boolean).at(-1) ??
    "Agent Company";

  return {
    id: `${repositoryId}:${normalizedManifestPath}`,
    name,
    slug:
      getTopLevelScalar(frontmatter, "slug") ??
      slugify(normalizedRelativePath || name),
    description: getTopLevelScalar(frontmatter, "description"),
    schema,
    version: getTopLevelScalar(frontmatter, "version"),
    relativePath: normalizedRelativePath,
    manifestPath: normalizedManifestPath
  };
}

async function scanRepositoryDirectory(
  repositoryRoot: string,
  repositoryId: string
): Promise<DiscoveredAgentCompany[]> {
  const manifestPaths = await findCompanyManifestPaths(repositoryRoot);
  const companies = await Promise.all(
    manifestPaths.map((manifestPath) => parseAgentCompanyManifest(manifestPath, repositoryRoot, repositoryId))
  );

  return companies
    .filter((company): company is DiscoveredAgentCompany => company !== null)
    .sort((left, right) =>
      left.name.localeCompare(right.name, undefined, { sensitivity: "base" }) ||
      left.slug.localeCompare(right.slug, undefined, { sensitivity: "base" }) ||
      left.manifestPath.localeCompare(right.manifestPath, undefined, { sensitivity: "base" })
    );
}

export async function scanRepositoryForAgentCompanies(
  repositoryReference: string,
  repositoryId = "repository"
): Promise<DiscoveredAgentCompany[]> {
  const tempDirectory = await mkdtemp(join(tmpdir(), "paperclip-agent-companies-plugin-"));
  const checkoutDirectory = join(tempDirectory, "checkout");
  const gitEnvironment = await buildGitProcessEnvironment({
    preferredHomeDirectory: resolveUserHomeDirectory()
  });

  try {
    await runProcess(
      "git",
      [
        "clone",
        "--depth",
        "1",
        "--quiet",
        "--no-tags",
        "--single-branch",
        "--recurse-submodules=no",
        repositoryReference,
        checkoutDirectory
      ],
      {
        env: gitEnvironment
      }
    );

    return await scanRepositoryDirectory(checkoutDirectory, repositoryId);
  } catch (error) {
    const message = summarizeErrorMessage(error);
    if (message.includes("spawn git ENOENT")) {
      throw new Error("Git is not available in the plugin worker environment.");
    }

    throw new Error(summarizeRepositoryCloneFailure(message));
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

function createRepositoryScanner(): RepositoryScanner {
  return async (repository) => scanRepositoryForAgentCompanies(repository.url, repository.id);
}

export function createAgentCompaniesPlugin(options: AgentCompaniesPluginOptions = {}) {
  const now = options.now ?? (() => new Date().toISOString());
  const scanRepository = options.scanRepository ?? createRepositoryScanner();

  return definePlugin({
    async setup(ctx) {
      ctx.data.register("catalog.read", async () => {
        const loadedState = await loadCatalogStateRecord(ctx);
        const hydratedState = await ensureSeedRepositoriesScanned(
          ctx,
          loadedState.state,
          loadedState.hasPersistedRepositories,
          now(),
          scanRepository
        );
        return buildCatalogResponse(hydratedState);
      });

      ctx.actions.register("catalog.add-repository", async (rawParams) => {
        const params = isRecord(rawParams) ? rawParams : {};
        const repositoryInput = canonicalizeRepositoryInput(getRequiredString(params, "url"));
        const currentState = await loadCatalogState(ctx);
        const repository = createRepositorySource(repositoryInput);

        if (
          currentState.repositories.some(
            (existingRepository) => existingRepository.normalizedUrl === repository.normalizedUrl
          )
        ) {
          throw new Error("That repository has already been added.");
        }

        const scannedRepository = await scanRepositoryEntry(repository, scanRepository, now(), ctx.logger);
        const nextState = await persistCatalogState(
          ctx,
          {
            ...currentState,
            repositories: [...currentState.repositories, scannedRepository]
          },
          now()
        );

        return buildCatalogResponse(nextState);
      });

      ctx.actions.register("catalog.remove-repository", async (rawParams) => {
        const params = isRecord(rawParams) ? rawParams : {};
        const repositoryId = getRequiredString(params, "repositoryId");
        const currentState = await loadCatalogState(ctx);
        const nextRepositories = currentState.repositories.filter(
          (repository) => repository.id !== repositoryId
        );

        if (nextRepositories.length === currentState.repositories.length) {
          throw new Error("Repository not found.");
        }

        const nextState = await persistCatalogState(
          ctx,
          {
            ...currentState,
            repositories: nextRepositories
          },
          now()
        );

        return buildCatalogResponse(nextState);
      });

      ctx.actions.register("catalog.scan-repository", async (rawParams) => {
        const params = isRecord(rawParams) ? rawParams : {};
        const repositoryId = getRequiredString(params, "repositoryId");
        const currentState = await loadCatalogState(ctx);
        const repository = currentState.repositories.find((candidate) => candidate.id === repositoryId);

        if (!repository) {
          throw new Error("Repository not found.");
        }

        const scannedRepository = await scanRepositoryEntry(repository, scanRepository, now(), ctx.logger);
        const nextState = await persistCatalogState(
          ctx,
          updateRepository(currentState, repositoryId, () => scannedRepository),
          now()
        );

        return buildCatalogResponse(nextState);
      });

      ctx.actions.register("catalog.scan-all-repositories", async () => {
        let nextState = await loadCatalogState(ctx);
        const timestamp = now();

        for (const repository of nextState.repositories) {
          const scannedRepository = await scanRepositoryEntry(repository, scanRepository, timestamp, ctx.logger);
          nextState = updateRepository(nextState, repository.id, () => scannedRepository);
        }

        const persistedState = await persistCatalogState(ctx, nextState, timestamp);
        return buildCatalogResponse(persistedState);
      });
    }
  });
}

const plugin = createAgentCompaniesPlugin();

export default plugin;
runWorker(plugin, import.meta.url);
