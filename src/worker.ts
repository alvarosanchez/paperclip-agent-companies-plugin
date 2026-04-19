import { constants, realpathSync } from "node:fs";
import { access, mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir, userInfo } from "node:os";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { definePlugin, startWorkerRpcHost, type PluginContext, type ScopeKey } from "@paperclipai/plugin-sdk";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import {
  AGENT_COMPANIES_SCHEMA,
  buildCatalogSnapshot,
  CATALOG_STATE_KEY,
  type CatalogPreparedCompanyImport,
  type CatalogCompanySyncResult,
  DEFAULT_AUTO_SYNC_ENABLED,
  DEFAULT_SYNC_COLLISION_STRATEGY,
  type ImportedCatalogCompanyRecord,
  COMPANY_CONTENT_KEYS,
  type CatalogCompanyContentDetail,
  createRepositorySource,
  createEmptyCompanyContents,
  hasPersistedCatalogRepositories,
  isCatalogCompanySyncAvailable,
  isCatalogCompanyAutoSyncDue,
  normalizeCompanyContentPath,
  normalizeCatalogState,
  normalizeRepositoryCloneRef,
  type PaperclipCompanyImportResult,
  sortCompanyContentItems,
  type CatalogSnapshot,
  type CatalogSyncCollisionStrategy,
  type CatalogCompanySyncStatus,
  type CompanyContentItem,
  type CompanyContentKey,
  type CompanyContents,
  type DiscoveredAgentCompany,
  type PortableCatalogFileEntry,
  type RepositorySource,
  type CatalogState
} from "./catalog.js";
import { requiresPaperclipBoardAccess } from "./paperclip-health.js";

const CATALOG_SCOPE: ScopeKey = {
  scopeKind: "instance",
  stateKey: CATALOG_STATE_KEY
};
const BOARD_ACCESS_STATE_KEY = "agent-companies.board-access.v1";
const BOARD_ACCESS_SCOPE: ScopeKey = {
  scopeKind: "instance",
  stateKey: BOARD_ACCESS_STATE_KEY
};
const PAPERCLIP_RUNTIME_STATE_KEY = "agent-companies.paperclip-runtime.v1";
const PAPERCLIP_RUNTIME_SCOPE: ScopeKey = {
  scopeKind: "instance",
  stateKey: PAPERCLIP_RUNTIME_STATE_KEY
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
const SENSITIVE_DIRECTORY_NAMES = new Set([".aws", ".gnupg", ".ssh"]);
const IGNORED_PORTABLE_FILE_NAMES = new Set([".ds_store", "thumbs.db"]);
const SENSITIVE_PORTABLE_FILE_NAMES = new Set([
  ".git-credentials",
  ".netrc",
  ".npmrc",
  ".pypirc",
  ".terraformrc",
  ".yarnrc",
  ".yarnrc.yml",
  "terraform.rc"
]);
const SENSITIVE_PORTABLE_FILE_EXTENSIONS = new Set([".key", ".kdbx", ".p12", ".pem", ".pfx"]);
const SENSITIVE_PORTABLE_FILE_PATTERNS = [/^\.env(?:\..+)?$/iu, /^id_(?:rsa|dsa|ecdsa|ed25519)$/iu];

const FRONTMATTER_PATTERN = /^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/u;
const COMPANY_CONTENT_FILE_NAMES = new Set(["AGENTS.md", "PROJECT.md", "TASK.md", "ISSUE.md", "SKILL.md"]);
const repositoryCheckoutCache = new Map<string, RepositoryCheckoutCacheEntry>();
const repositoryCheckoutInflight = new Map<string, Promise<RepositoryCheckoutCacheEntry>>();
const companySyncInflight = new Map<string, Promise<CatalogCompanySyncResult>>();
let autoSyncSweepPromise: Promise<void> | null = null;
const TEXT_FILE_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".sh",
  ".svg",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml"
]);
const TEXT_FILE_NAMES = new Set([
  ".env",
  ".eslintrc",
  ".gitignore",
  ".npmignore",
  ".paperclip.yaml",
  ".paperclip.yml",
  ".prettierignore",
  ".prettierrc",
  "dockerfile",
  "makefile"
]);
const PORTABLE_FILE_CONTENT_TYPES = new Map<string, string>([
  [".gif", "image/gif"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".pdf", "application/pdf"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"]
]);
// Keep inline bridge payloads bounded so one import cannot overwhelm worker memory.
const MAX_INLINE_IMPORT_FILES = 250;
const MAX_INLINE_IMPORT_SINGLE_FILE_BYTES = 1024 * 1024;
const MAX_INLINE_IMPORT_TOTAL_PAYLOAD_BYTES = 8 * 1024 * 1024;
const AUTO_SYNC_JOB_KEY = "catalog-auto-sync";
const DEFAULT_STARTUP_AUTO_SYNC_DELAY_MS = 5000;
const STALE_SYNC_TIMEOUT_MS = 30 * 60 * 1000;
const PAPERCLIP_EXTENSION_SCHEMA = "paperclip/v1";
const PAPERCLIP_AGENT_ICONS_ROUTE = "/llms/agent-icons.txt";
const PAPERCLIP_EXTENSION_FILE_NAMES = [".paperclip.yaml", ".paperclip.yml"] as const;
const DEFAULT_SUPPORTED_PAPERCLIP_AGENT_ICONS = new Set([
  "atom",
  "bot",
  "brain",
  "bug",
  "circuit-board",
  "code",
  "cog",
  "cpu",
  "crown",
  "database",
  "eye",
  "file-code",
  "fingerprint",
  "flame",
  "gem",
  "git-branch",
  "globe",
  "hammer",
  "heart",
  "hexagon",
  "lightbulb",
  "lock",
  "mail",
  "message-square",
  "microscope",
  "package",
  "pentagon",
  "puzzle",
  "radar",
  "rocket",
  "search",
  "shield",
  "sparkles",
  "star",
  "swords",
  "target",
  "telescope",
  "terminal",
  "wand",
  "wrench",
  "zap"
]);

type RepositoryScanner = (repository: RepositorySource) => Promise<DiscoveredAgentCompany[]>;
type SyncImportExecutor = (
  ctx: PluginContext,
  input: SyncImportRequest
) => Promise<PaperclipCompanyImportResult>;

interface AgentCompaniesPluginOptions {
  now?: () => string;
  scanRepository?: RepositoryScanner;
  syncImport?: SyncImportExecutor;
  startupAutoSyncDelayMs?: number | null;
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

interface RepositoryCheckoutCacheEntry {
  checkoutDirectory: string;
  tempDirectory: string;
}

interface PortableCatalogFileBuildResult {
  entry: PortableCatalogFileEntry;
  sourceBytes: number;
  payloadBytes: number;
}

interface PortableCatalogFileSummary {
  fileCount: number;
  textFileCount: number;
  binaryFileCount: number;
  totalPayloadBytes: number;
}

interface PortableCatalogFileAugmentationResult {
  files: Record<string, PortableCatalogFileEntry>;
  sourceByteDelta: number;
}

interface PaperclipRoutineMetadata {
  status: string | null;
  triggerCount: number;
}

interface SyncImportRequest {
  sourceCompanyId: string;
  sourceCompanyName: string;
  importedCompanyId: string;
  collisionStrategy: CatalogSyncCollisionStrategy;
  preparedImport: CatalogPreparedCompanyImport;
}

interface PaperclipApiConnection {
  apiBase: string;
  apiKey: string | null;
}

interface PaperclipIssueRecord {
  id: string;
  identifier: string | null;
  title: string | null;
  status: string | null;
  assigneeAgentId: string | null;
}

interface PaperclipIssueWakeTarget {
  agentId: string;
  issueId: string;
  issueIdentifier: string | null;
  issueTitle: string | null;
}

class PaperclipApiResponseError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "PaperclipApiResponseError";
    this.status = status;
  }
}

interface StoredBoardCredential {
  apiBase: string;
  token: string;
  createdAt: string;
  updatedAt: string;
  userId: string | null;
}

interface CompanyBoardAccessRecord {
  paperclipBoardApiTokenRef: string;
  identity: string | null;
  updatedAt: string | null;
}

interface BoardAccessState {
  companies: Record<string, CompanyBoardAccessRecord>;
  updatedAt: string | null;
}

interface PaperclipRuntimeState {
  apiBase: string | null;
  updatedAt: string | null;
}

interface BoardAccessRegistration {
  companyId: string | null;
  configured: boolean;
  identity: string | null;
  updatedAt: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asIsoTimestamp(value: unknown): string | null {
  return asNonEmptyString(value);
}

function normalizeCompanyBoardAccessRecord(value: unknown): CompanyBoardAccessRecord | null {
  if (!isRecord(value)) {
    return null;
  }

  const paperclipBoardApiTokenRef = asNonEmptyString(value.paperclipBoardApiTokenRef);
  if (!paperclipBoardApiTokenRef) {
    return null;
  }

  return {
    paperclipBoardApiTokenRef,
    identity: asNonEmptyString(value.identity),
    updatedAt: asIsoTimestamp(value.updatedAt)
  };
}

function normalizeBoardAccessState(value: unknown): BoardAccessState {
  if (!isRecord(value)) {
    return {
      companies: {},
      updatedAt: null
    };
  }

  const rawCompanies = isRecord(value.companies) ? value.companies : {};
  const companies: Record<string, CompanyBoardAccessRecord> = {};

  for (const [companyId, record] of Object.entries(rawCompanies)) {
    const normalizedCompanyId = asNonEmptyString(companyId);
    const normalizedRecord = normalizeCompanyBoardAccessRecord(record);
    if (!normalizedCompanyId || !normalizedRecord) {
      continue;
    }

    companies[normalizedCompanyId] = normalizedRecord;
  }

  return {
    companies,
    updatedAt: asIsoTimestamp(value.updatedAt)
  };
}

function normalizePaperclipRuntimeState(value: unknown): PaperclipRuntimeState {
  if (!isRecord(value)) {
    return {
      apiBase: null,
      updatedAt: null
    };
  }

  const apiBase = asNonEmptyString(value.apiBase);

  return {
    apiBase: apiBase ? normalizeApiBase(apiBase) : null,
    updatedAt: asIsoTimestamp(value.updatedAt)
  };
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

function expandHomePrefix(value: string): string {
  if (value === "~") {
    return resolveUserHomeDirectory();
  }

  if (value.startsWith("~/")) {
    return resolve(resolveUserHomeDirectory(), value.slice(2));
  }

  return value;
}

function resolvePaperclipHomeDirectory(): string {
  const configuredHome = process.env.PAPERCLIP_HOME?.trim();
  if (configuredHome) {
    return resolve(expandHomePrefix(configuredHome));
  }

  return resolve(resolveUserHomeDirectory(), ".paperclip");
}

function resolvePaperclipInstanceId(): string {
  const instanceId = process.env.PAPERCLIP_INSTANCE_ID?.trim() || "default";
  return /^[A-Za-z0-9_-]+$/u.test(instanceId) ? instanceId : "default";
}

function resolveDefaultPaperclipConfigPath(): string {
  return join(
    resolvePaperclipHomeDirectory(),
    "instances",
    resolvePaperclipInstanceId(),
    "config.json"
  );
}

function resolvePaperclipConfigPath(): string {
  const explicitPath = process.env.PAPERCLIP_CONFIG_PATH?.trim() || process.env.PAPERCLIP_CONFIG?.trim();
  if (explicitPath) {
    return resolve(expandHomePrefix(explicitPath));
  }

  return resolveDefaultPaperclipConfigPath();
}

function resolvePaperclipAuthStorePath(): string {
  const explicitPath = process.env.PAPERCLIP_AUTH_STORE?.trim();
  if (explicitPath) {
    return resolve(expandHomePrefix(explicitPath));
  }

  return join(resolvePaperclipHomeDirectory(), "auth.json");
}

function normalizeApiBase(apiBase: string): string {
  return apiBase.trim().replace(/\/+$/u, "");
}

async function readJsonObjectFile(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function inferPaperclipApiBaseFromConfig(configPath: string): Promise<string> {
  const host = process.env.PAPERCLIP_SERVER_HOST?.trim() || "localhost";
  let port = Number(process.env.PAPERCLIP_SERVER_PORT || "");

  if (!Number.isFinite(port) || port <= 0) {
    const config = await readJsonObjectFile(configPath);
    const server = config?.server;
    if (isRecord(server) && typeof server.port === "number" && Number.isFinite(server.port) && server.port > 0) {
      port = server.port;
    } else {
      port = 3100;
    }
  }

  if (!Number.isFinite(port) || port <= 0) {
    port = 3100;
  }

  return `http://${host}:${port}`;
}

async function readStoredBoardCredential(apiBase: string): Promise<StoredBoardCredential | null> {
  const authStore = await readJsonObjectFile(resolvePaperclipAuthStorePath());
  const credentials = authStore?.credentials;
  if (!isRecord(credentials)) {
    return null;
  }

  const credential = credentials[normalizeApiBase(apiBase)];
  if (!isRecord(credential)) {
    return null;
  }

  const normalizedApiBase = asNonEmptyString(credential.apiBase);
  const token = asNonEmptyString(credential.token);
  const createdAt = asIsoTimestamp(credential.createdAt);
  const updatedAt = asIsoTimestamp(credential.updatedAt);

  if (!normalizedApiBase || !token || !createdAt || !updatedAt) {
    return null;
  }

  return {
    apiBase: normalizedApiBase,
    token,
    createdAt,
    updatedAt,
    userId: asNonEmptyString(credential.userId)
  };
}

async function resolveSavedBoardAccessToken(
  ctx: PluginContext,
  companyId: string | null
): Promise<string | null> {
  if (!companyId) {
    return null;
  }

  const state = await loadBoardAccessState(ctx);
  const secretRef = state.companies[companyId]?.paperclipBoardApiTokenRef?.trim();
  if (!secretRef) {
    return null;
  }

  try {
    const token = (await ctx.secrets.resolve(secretRef)).trim();
    return token || null;
  } catch (error) {
    ctx.logger.warn("Unable to resolve the saved Paperclip board access token.", {
      companyId,
      secretRef,
      error: summarizeErrorMessage(error)
    });
    return null;
  }
}

export async function resolvePaperclipApiConnection(
  ctx?: PluginContext,
  companyId: string | null = null
): Promise<PaperclipApiConnection> {
  const explicitApiBase = process.env.PAPERCLIP_API_URL?.trim();
  const savedApiBase = ctx ? await resolveSavedPaperclipApiBase(ctx) : null;
  const configPath = resolvePaperclipConfigPath();
  const apiBase = normalizeApiBase(
    explicitApiBase
    || savedApiBase
    || (await inferPaperclipApiBaseFromConfig(configPath))
  );
  const apiKey =
    process.env.PAPERCLIP_API_KEY?.trim()
    || (ctx ? await resolveSavedBoardAccessToken(ctx, companyId) : null)
    || (await readStoredBoardCredential(apiBase))?.token
    || null;

  return {
    apiBase,
    apiKey
  };
}

async function fetchPaperclipHealth(apiBase: string): Promise<unknown | null> {
  let response: Response;
  try {
    response = await fetch(`${apiBase}/api/health`, {
      headers: {
        accept: "application/json"
      }
    });
  } catch {
    return null;
  }

  try {
    return await parsePaperclipJsonResponse(response);
  } catch {
    return null;
  }
}

async function resolveSavedPaperclipApiBase(ctx: PluginContext): Promise<string | null> {
  const state = await loadPaperclipRuntimeState(ctx);
  return state.apiBase;
}

function buildBoardAccessRequiredSyncMessage(): string {
  return "Board access required. Open Agent Companies Plugin settings inside the imported company, connect board access, and retry sync.";
}

function isBoardAccessRequiredError(error: unknown): boolean {
  return summarizeErrorMessage(error).toLowerCase().includes("board access required");
}

function getStructuredMessageLines(value: unknown, maxLines = 4): string[] {
  const lines: string[] = [];
  const seen = new Set<string>();

  function visit(candidate: unknown, depth = 0): void {
    if (depth > 4 || lines.length >= maxLines) {
      return;
    }

    if (typeof candidate === "string") {
      const normalized = candidate.replace(/\s+/gu, " ").trim();
      if (normalized && !seen.has(normalized)) {
        seen.add(normalized);
        lines.push(normalized);
      }
      return;
    }

    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        visit(item, depth + 1);
        if (lines.length >= maxLines) {
          break;
        }
      }
      return;
    }

    if (!isRecord(candidate)) {
      return;
    }

    for (const key of ["message", "error", "detail", "reason", "title"]) {
      visit(candidate[key], depth + 1);
      if (lines.length >= maxLines) {
        return;
      }
    }

    for (const key of ["details", "errors", "issues", "warnings"]) {
      visit(candidate[key], depth + 1);
      if (lines.length >= maxLines) {
        return;
      }
    }
  }

  visit(value);
  return lines;
}

function getPaperclipApiErrorMessage(payload: unknown, status: number): string {
  if (!isRecord(payload)) {
    return `Request failed with status ${status}.`;
  }

  const directMessage = payload.message ?? payload.error;
  const primaryMessage =
    typeof directMessage === "string" && directMessage.trim() ? directMessage.trim() : null;
  const detailLines = getStructuredMessageLines(payload.details ?? payload.errors ?? payload).filter(
    (line) => line !== primaryMessage
  );

  if (primaryMessage && detailLines.length > 0) {
    return [primaryMessage, ...detailLines.map((line) => `- ${line}`)].join("\n");
  }

  if (primaryMessage) {
    return primaryMessage;
  }

  if (detailLines.length > 0) {
    return detailLines.map((line) => `- ${line}`).join("\n");
  }

  return `Request failed with status ${status}.`;
}

async function parsePaperclipJsonResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  const rawBody = await response.text();
  const normalizedBody = rawBody.trim();

  if (
    contentType.includes("text/html") ||
    normalizedBody.startsWith("<!DOCTYPE html") ||
    normalizedBody.startsWith("<html")
  ) {
    throw new PaperclipApiResponseError("Paperclip returned HTML instead of JSON.", response.status);
  }

  let payload: unknown = null;
  if (normalizedBody) {
    try {
      payload = JSON.parse(normalizedBody);
    } catch {
      throw new PaperclipApiResponseError(
        "Paperclip returned an unexpected non-JSON response.",
        response.status
      );
    }
  }

  if (!response.ok) {
    throw new PaperclipApiResponseError(
      getPaperclipApiErrorMessage(payload, response.status),
      response.status
    );
  }

  return payload;
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

function isPaperclipApiAuthorizationError(error: unknown): boolean {
  return (
    error instanceof PaperclipApiResponseError
    && (error.status === 401 || error.status === 403)
  );
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

function isProbablyTextBuffer(buffer: Buffer): boolean {
  if (buffer.length === 0) {
    return true;
  }

  const sampleLength = Math.min(buffer.length, 1024);
  let suspiciousByteCount = 0;

  for (let index = 0; index < sampleLength; index += 1) {
    const byte = buffer[index];

    if (byte === 0) {
      return false;
    }

    if (byte < 7 || (byte > 14 && byte < 32)) {
      suspiciousByteCount += 1;
    }
  }

  return suspiciousByteCount / sampleLength < 0.1;
}

function isLikelyTextFilePath(filePath: string): boolean {
  const normalizedPath = toPosixPath(filePath).toLowerCase();
  const fileName = normalizedPath.split("/").at(-1) ?? normalizedPath;

  return TEXT_FILE_NAMES.has(fileName) || TEXT_FILE_EXTENSIONS.has(extname(fileName));
}

function inferPortableFileContentType(filePath: string): string | null {
  const normalizedPath = toPosixPath(filePath).toLowerCase();
  return PORTABLE_FILE_CONTENT_TYPES.get(extname(normalizedPath)) ?? null;
}

function shouldSkipPortableCompanyFilePath(filePath: string): boolean {
  const normalizedPath = toPosixPath(filePath).toLowerCase();
  const segments = normalizedPath.split("/").filter(Boolean);
  const fileName = segments.at(-1) ?? normalizedPath;

  if (segments.slice(0, -1).some((segment) => SENSITIVE_DIRECTORY_NAMES.has(segment))) {
    return true;
  }

  if (IGNORED_PORTABLE_FILE_NAMES.has(fileName) || SENSITIVE_PORTABLE_FILE_NAMES.has(fileName)) {
    return true;
  }

  if (SENSITIVE_PORTABLE_FILE_PATTERNS.some((pattern) => pattern.test(fileName))) {
    return true;
  }

  return SENSITIVE_PORTABLE_FILE_EXTENSIONS.has(extname(fileName));
}

function formatByteCount(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    const kibibytes = bytes / 1024;
    return `${kibibytes.toFixed(kibibytes >= 10 ? 0 : 1)} KiB`;
  }

  const mebibytes = bytes / (1024 * 1024);
  return `${mebibytes.toFixed(mebibytes >= 10 ? 0 : 1)} MiB`;
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

function updateImportedCatalogCompany(
  state: CatalogState,
  sourceCompanyId: string,
  updater: (company: ImportedCatalogCompanyRecord) => ImportedCatalogCompanyRecord
): CatalogState {
  let didUpdate = false;
  const importedCompanies = state.importedCompanies.map((company) => {
    if (company.sourceCompanyId !== sourceCompanyId) {
      return company;
    }

    didUpdate = true;
    return updater(company);
  });

  return didUpdate
    ? {
        ...state,
        importedCompanies
      }
    : state;
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

function splitMarkdownDocument(content: string): {
  frontmatter: string | null;
  markdown: string;
} {
  const frontmatterMatch = content.match(FRONTMATTER_PATTERN);
  if (!frontmatterMatch) {
    return {
      frontmatter: null,
      markdown: content.trim()
    };
  }

  return {
    frontmatter: frontmatterMatch[1]?.trim() || null,
    markdown: content.slice(frontmatterMatch[0].length).trim()
  };
}

function parseYamlObject(content: string): Record<string, unknown> | null {
  try {
    const parsed = parseYaml(content);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function getPaperclipAgentIconHint(frontmatter: Record<string, unknown> | null): string | null {
  if (!frontmatter) {
    return null;
  }

  const metadata = isRecord(frontmatter.metadata) ? frontmatter.metadata : null;
  const paperclip = metadata && isRecord(metadata.paperclip) ? metadata.paperclip : null;
  return asNonEmptyString(paperclip?.agentIcon);
}

function normalizePaperclipSlug(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");

  return normalized || null;
}

function isRecurringTaskFrontmatter(
  parsedFrontmatter: Record<string, unknown> | null,
  rawFrontmatter: string | null
): boolean {
  if (parsedFrontmatter) {
    if (parsedFrontmatter.recurring === true) {
      return true;
    }

    if (
      typeof parsedFrontmatter.recurring === "string"
      && parsedFrontmatter.recurring.trim().toLowerCase() === "true"
    ) {
      return true;
    }

    const schedule = isRecord(parsedFrontmatter.schedule) ? parsedFrontmatter.schedule : null;
    if (asNonEmptyString(schedule?.recurrence)) {
      return true;
    }
  }

  return rawFrontmatter ? getTopLevelScalar(rawFrontmatter, "recurring")?.toLowerCase() === "true" : false;
}

async function readPaperclipRoutineMetadata(
  companyRoot: string
): Promise<Map<string, PaperclipRoutineMetadata>> {
  const metadataBySlug = new Map<string, PaperclipRoutineMetadata>();

  for (const fileName of PAPERCLIP_EXTENSION_FILE_NAMES) {
    let content: string;
    try {
      content = await readFile(join(companyRoot, fileName), "utf8");
    } catch (error) {
      if (
        isRecord(error)
        && (error.code === "ENOENT" || error.code === "EISDIR" || error.code === "EACCES")
      ) {
        continue;
      }

      throw error;
    }

    const extension = parseYamlObject(content);
    const routines = extension && isRecord(extension.routines) ? extension.routines : null;
    if (!routines) {
      return metadataBySlug;
    }

    for (const [rawSlug, value] of Object.entries(routines)) {
      if (!isRecord(value)) {
        continue;
      }

      const slug = normalizePaperclipSlug(rawSlug);
      if (!slug) {
        continue;
      }

      metadataBySlug.set(slug, {
        status: asNonEmptyString(value.status),
        triggerCount: Array.isArray(value.triggers) ? value.triggers.length : 0
      });
    }

    return metadataBySlug;
  }

  return metadataBySlug;
}

function summarizePortableCatalogFiles(
  files: Record<string, PortableCatalogFileEntry>
): PortableCatalogFileSummary {
  let textFileCount = 0;
  let binaryFileCount = 0;
  let totalPayloadBytes = 0;

  for (const entry of Object.values(files)) {
    if (typeof entry === "string") {
      textFileCount += 1;
      totalPayloadBytes += Buffer.byteLength(entry, "utf8");
      continue;
    }

    binaryFileCount += 1;
    totalPayloadBytes += Buffer.byteLength(entry.data, "utf8");
  }

  return {
    fileCount: Object.keys(files).length,
    textFileCount,
    binaryFileCount,
    totalPayloadBytes
  };
}

function parseSupportedPaperclipAgentIcons(content: string): Set<string> {
  const icons = new Set<string>();

  for (const line of content.split(/\r?\n/u)) {
    const match = /^\s*-\s+([A-Za-z0-9-]+)\s*$/u.exec(line);
    if (!match?.[1]) {
      continue;
    }

    icons.add(match[1]);
  }

  return icons;
}

async function resolveSupportedPaperclipAgentIcons(ctx?: PluginContext): Promise<Set<string>> {
  const fallbackIcons = new Set(DEFAULT_SUPPORTED_PAPERCLIP_AGENT_ICONS);

  try {
    const connection = await resolvePaperclipApiConnection(ctx);
    const headers: Record<string, string> = {
      accept: "text/plain"
    };

    if (connection.apiKey) {
      headers.authorization = `Bearer ${connection.apiKey}`;
    }

    const response = await fetch(`${connection.apiBase}${PAPERCLIP_AGENT_ICONS_ROUTE}`, {
      headers
    });
    if (!response.ok) {
      return fallbackIcons;
    }

    const icons = parseSupportedPaperclipAgentIcons(await response.text());
    return icons.size > 0 ? icons : fallbackIcons;
  } catch {
    return fallbackIcons;
  }
}

function findPortablePaperclipExtensionPath(
  files: Record<string, PortableCatalogFileEntry>
): string | null {
  for (const fileName of PAPERCLIP_EXTENSION_FILE_NAMES) {
    if (typeof files[fileName] === "string") {
      return fileName;
    }
  }

  for (const fileName of PAPERCLIP_EXTENSION_FILE_NAMES) {
    if (fileName in files) {
      return fileName;
    }
  }

  return null;
}

async function discoverPaperclipAgentIcons(
  companyRoot: string
): Promise<Map<string, { icon: string; path: string }>> {
  const icons = new Map<string, { icon: string; path: string }>();
  const manifestPaths = await findCompanyContentManifestPaths(companyRoot);

  for (const manifestPath of manifestPaths) {
    const relativePath = normalizeCompanyContentPath(toPosixPath(relative(companyRoot, manifestPath)));
    if (!relativePath || classifyCompanyContentPath(relativePath) !== "agents") {
      continue;
    }

    let content;
    try {
      content = await readFile(manifestPath, "utf8");
    } catch (error) {
      if (
        isRecord(error) &&
        (error.code === "ENOENT" || error.code === "EISDIR" || error.code === "EACCES")
      ) {
        continue;
      }

      throw error;
    }

    const frontmatterMatch = content.match(FRONTMATTER_PATTERN);
    if (!frontmatterMatch) {
      continue;
    }

    const frontmatter = parseYamlObject(frontmatterMatch[1] ?? "");
    if (!frontmatter) {
      continue;
    }

    const icon = getPaperclipAgentIconHint(frontmatter);
    const slug =
      normalizePaperclipSlug(frontmatter.slug) ??
      normalizePaperclipSlug(relativePath.split("/").filter(Boolean).at(-2));

    if (!slug || !icon) {
      continue;
    }

    icons.set(slug, {
      icon,
      path: relativePath
    });
  }

  return icons;
}

async function applyPaperclipAgentIconsToPortableFiles(
  ctx: PluginContext,
  companyRoot: string,
  files: Record<string, PortableCatalogFileEntry>
): Promise<PortableCatalogFileAugmentationResult> {
  const requestedIcons = await discoverPaperclipAgentIcons(companyRoot);
  if (requestedIcons.size === 0) {
    return {
      files,
      sourceByteDelta: 0
    };
  }

  const supportedIcons = await resolveSupportedPaperclipAgentIcons(ctx);
  const extensionPath = findPortablePaperclipExtensionPath(files) ?? PAPERCLIP_EXTENSION_FILE_NAMES[0];
  const existingExtensionEntry = files[extensionPath];

  if (existingExtensionEntry && typeof existingExtensionEntry !== "string") {
    ctx.logger.warn("Skipped Paperclip agent icon metadata because the extension file is not text", {
      extensionPath
    });
    return {
      files,
      sourceByteDelta: 0
    };
  }

  const existingExtension =
    typeof existingExtensionEntry === "string"
      ? parseYamlObject(existingExtensionEntry)
      : {};
  if (typeof existingExtensionEntry === "string" && !existingExtension) {
    ctx.logger.warn("Skipped Paperclip agent icon metadata because the extension file is not valid YAML", {
      extensionPath
    });
    return {
      files,
      sourceByteDelta: 0
    };
  }

  const nextExtension: Record<string, unknown> = {
    ...(existingExtension ?? {})
  };
  const nextAgents = isRecord(nextExtension.agents) ? { ...nextExtension.agents } : {};
  let didUpdate = false;

  for (const [slug, request] of requestedIcons.entries()) {
    if (!supportedIcons.has(request.icon)) {
      ctx.logger.info("Skipped unsupported Paperclip agent icon from company metadata", {
        agentSlug: slug,
        agentPath: request.path,
        requestedIcon: request.icon
      });
      continue;
    }

    const existingAgent = isRecord(nextAgents[slug]) ? { ...nextAgents[slug] } : {};
    if (asNonEmptyString(existingAgent.icon)) {
      continue;
    }

    existingAgent.icon = request.icon;
    nextAgents[slug] = existingAgent;
    didUpdate = true;
  }

  if (!didUpdate) {
    return {
      files,
      sourceByteDelta: 0
    };
  }

  if (!asNonEmptyString(nextExtension.schema)) {
    nextExtension.schema = PAPERCLIP_EXTENSION_SCHEMA;
  }
  nextExtension.agents = nextAgents;

  const nextExtensionContent = `${stringifyYaml(nextExtension).trimEnd()}\n`;
  const nextFiles = {
    ...files,
    [extensionPath]: nextExtensionContent
  };
  const previousSourceBytes =
    typeof existingExtensionEntry === "string" ? Buffer.byteLength(existingExtensionEntry, "utf8") : 0;

  return {
    files: nextFiles,
    sourceByteDelta: Buffer.byteLength(nextExtensionContent, "utf8") - previousSourceBytes
  };
}

function resolveRepositoryRelativePath(repositoryRoot: string, relativePath: string): string {
  const normalizedPath = normalizeCompanyContentPath(relativePath);
  if (!normalizedPath) {
    throw new Error(`Expected a repository-relative path but received "${relativePath}".`);
  }

  const resolvedRepositoryRoot = resolve(repositoryRoot);
  const resolvedPath = resolve(resolvedRepositoryRoot, ...normalizedPath.split("/"));
  const repositoryRelativePath = relative(resolvedRepositoryRoot, resolvedPath);

  if (
    repositoryRelativePath === "" ||
    repositoryRelativePath === ".." ||
    repositoryRelativePath.startsWith(`..${sep}`)
  ) {
    throw new Error(`Path "${relativePath}" resolves outside the repository root.`);
  }

  return resolvedPath;
}

function getRepositoryRelativeCompanyRoot(company: DiscoveredAgentCompany): string {
  const companyRoot = dirname(company.manifestPath);
  return companyRoot === "." ? "" : toPosixPath(companyRoot);
}

function getRepositoryRelativeCompanyContentPath(
  company: DiscoveredAgentCompany,
  itemPath: string
): string {
  const companyRoot = getRepositoryRelativeCompanyRoot(company);
  return companyRoot ? `${companyRoot}/${itemPath}` : itemPath;
}

function findRepositoryCompany(
  state: CatalogState,
  companyId: string
): { repository: RepositorySource; company: DiscoveredAgentCompany } | null {
  for (const repository of state.repositories) {
    const company = repository.companies.find((candidate) => candidate.id === companyId);
    if (company) {
      return {
        repository,
        company
      };
    }
  }

  return null;
}

function findImportedCatalogCompany(
  state: CatalogState,
  sourceCompanyId: string
): ImportedCatalogCompanyRecord | null {
  return state.importedCompanies.find((candidate) => candidate.sourceCompanyId === sourceCompanyId) ?? null;
}

function buildAlreadyImportedErrorMessage(
  companyName: string,
  importedCompany: ImportedCatalogCompanyRecord
): string {
  const importedLabel =
    importedCompany.importedCompanyIssuePrefix?.trim() ||
    importedCompany.importedCompanyName.trim() ||
    importedCompany.importedCompanyId;

  return `"${companyName}" has already been imported as "${importedLabel}". Use sync to update the existing Paperclip company.`;
}

function assertCatalogCompanyCanBeImported(
  state: CatalogState,
  company: DiscoveredAgentCompany
): void {
  const importedCompany = findImportedCatalogCompany(state, company.id);
  if (!importedCompany) {
    return;
  }

  throw new Error(buildAlreadyImportedErrorMessage(company.name, importedCompany));
}

function assertCatalogCompanyCanBeSynced(
  state: CatalogState,
  company: DiscoveredAgentCompany
): ImportedCatalogCompanyRecord {
  const importedCompany = findImportedCatalogCompany(state, company.id);
  if (!importedCompany) {
    throw new Error(`"${company.name}" must be imported before it can be synced.`);
  }

  return importedCompany;
}

function isRunningSyncStale(
  importedCompany: ImportedCatalogCompanyRecord,
  timestamp: string
): boolean {
  if (importedCompany.lastSyncStatus !== "running") {
    return false;
  }

  const runningSince = importedCompany.syncRunningSince ?? importedCompany.lastSyncAttemptAt;
  if (!runningSince) {
    return true;
  }

  const runningSinceTimestamp = Date.parse(runningSince);
  const nowTimestamp = Date.parse(timestamp);
  if (!Number.isFinite(runningSinceTimestamp) || !Number.isFinite(nowTimestamp)) {
    return true;
  }

  return nowTimestamp - runningSinceTimestamp >= STALE_SYNC_TIMEOUT_MS;
}

function isSyncCurrentlyRunning(
  importedCompany: ImportedCatalogCompanyRecord,
  timestamp: string
): boolean {
  return importedCompany.lastSyncStatus === "running" && !isRunningSyncStale(importedCompany, timestamp);
}

function recoverStaleImportedCompanySyncs(
  state: CatalogState,
  timestamp: string
): { state: CatalogState; changed: boolean } {
  let changed = false;

  const importedCompanies = state.importedCompanies.map((importedCompany) => {
    if (!isRunningSyncStale(importedCompany, timestamp)) {
      return importedCompany;
    }

    changed = true;
    return {
      ...importedCompany,
      lastSyncStatus: "failed" as CatalogCompanySyncStatus,
      lastSyncError:
        importedCompany.lastSyncError ??
        "The previous sync did not finish before the stale-run timeout expired.",
      syncRunningSince: null
    };
  });

  return {
    state: changed
      ? {
          ...state,
          importedCompanies
        }
      : state,
    changed
  };
}

function findCompanyContentEntry(
  company: DiscoveredAgentCompany,
  itemPath: string
): { kind: CompanyContentKey; item: CompanyContentItem } | null {
  for (const kind of COMPANY_CONTENT_KEYS) {
    const item = company.contents[kind].find((candidate) => candidate.path === itemPath);
    if (item) {
      return {
        kind,
        item
      };
    }
  }

  return null;
}

export async function clearRepositoryCheckoutCacheEntry(repositoryId: string): Promise<void> {
  const cachedEntry = repositoryCheckoutCache.get(repositoryId);
  if (!cachedEntry) {
    return;
  }

  repositoryCheckoutCache.delete(repositoryId);
  await rm(cachedEntry.tempDirectory, { recursive: true, force: true });
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

async function loadPaperclipRuntimeState(ctx: PluginContext): Promise<PaperclipRuntimeState> {
  const storedState = await ctx.state.get(PAPERCLIP_RUNTIME_SCOPE);
  return normalizePaperclipRuntimeState(storedState);
}

async function loadBoardAccessState(ctx: PluginContext): Promise<BoardAccessState> {
  const storedState = await ctx.state.get(BOARD_ACCESS_SCOPE);
  return normalizeBoardAccessState(storedState);
}

async function loadCatalogStateWithSyncRecovery(
  ctx: PluginContext,
  timestamp: string
): Promise<CatalogState> {
  const state = await loadCatalogState(ctx);
  const recoveredState = recoverStaleImportedCompanySyncs(state, timestamp);

  if (!recoveredState.changed) {
    return state;
  }

  return persistCatalogState(ctx, recoveredState.state, timestamp);
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
    importedCompanies: state.importedCompanies,
    updatedAt: now
  });

  await ctx.state.set(CATALOG_SCOPE, nextState);
  return nextState;
}

async function persistBoardAccessState(
  ctx: PluginContext,
  state: BoardAccessState,
  now: string
): Promise<BoardAccessState> {
  const nextState = normalizeBoardAccessState({
    companies: state.companies,
    updatedAt: now
  });

  await ctx.state.set(BOARD_ACCESS_SCOPE, nextState);
  return nextState;
}

async function persistPaperclipRuntimeState(
  ctx: PluginContext,
  state: PaperclipRuntimeState,
  now: string
): Promise<PaperclipRuntimeState> {
  const nextState = normalizePaperclipRuntimeState({
    apiBase: state.apiBase,
    updatedAt: now
  });

  await ctx.state.set(PAPERCLIP_RUNTIME_SCOPE, nextState);
  return nextState;
}

function getBoardAccessRegistration(
  state: BoardAccessState,
  companyId: string | null
): BoardAccessRegistration {
  const record = companyId ? state.companies[companyId] ?? null : null;

  return {
    companyId,
    configured: Boolean(record?.paperclipBoardApiTokenRef),
    identity: record?.identity ?? null,
    updatedAt: record?.updatedAt ?? null
  };
}

async function scanRepositoryEntry(
  repository: RepositorySource,
  scanRepository: RepositoryScanner,
  timestamp: string,
  logger: PluginContext["logger"]
): Promise<RepositorySource> {
  await clearRepositoryCheckoutCacheEntry(repository.id);

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

function buildCatalogResponse(state: CatalogState, timestamp: string): CatalogSnapshot {
  return buildCatalogSnapshot(state, timestamp);
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
        if (!IGNORED_DIRECTORY_NAMES.has(entry.name) && !SENSITIVE_DIRECTORY_NAMES.has(entry.name)) {
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

async function findCompanyContentManifestPaths(companyRoot: string): Promise<string[]> {
  const manifests: string[] = [];
  const queue = [companyRoot];

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

      if (entry.isFile() && COMPANY_CONTENT_FILE_NAMES.has(entry.name)) {
        manifests.push(fullPath);
      }
    }
  }

  manifests.sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));
  return manifests;
}

function classifyCompanyContentPath(relativePath: string): CompanyContentKey | null {
  const segments = toPosixPath(relativePath).split("/").filter(Boolean);
  const firstSegment = segments[0];
  const fileName = segments.at(-1);

  if (!firstSegment || !fileName) {
    return null;
  }

  if (fileName === "AGENTS.md" && firstSegment === "agents") {
    return "agents";
  }

  if (fileName === "SKILL.md" && firstSegment === "skills") {
    return "skills";
  }

  if (fileName === "PROJECT.md" && firstSegment === "projects") {
    return "projects";
  }

  if (fileName === "TASK.md" && (firstSegment === "tasks" || firstSegment === "projects")) {
    return "tasks";
  }

  if (fileName === "ISSUE.md" && (firstSegment === "issues" || firstSegment === "projects")) {
    return "issues";
  }

  return null;
}

function deriveCompanyContentName(relativePath: string): string {
  const segments = relativePath.split("/").filter(Boolean);
  return segments.length >= 2 ? segments[segments.length - 2] ?? relativePath : relativePath;
}

async function parseCompanyContentItem(
  manifestPath: string,
  companyRoot: string,
  routineMetadataByTaskSlug: Map<string, PaperclipRoutineMetadata>
): Promise<{ kind: CompanyContentKey; item: CompanyContentItem } | null> {
  const relativePath = normalizeCompanyContentPath(toPosixPath(relative(companyRoot, manifestPath)));
  if (!relativePath) {
    return null;
  }

  const kind = classifyCompanyContentPath(relativePath);

  if (!kind) {
    return null;
  }

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
  const frontmatter = frontmatterMatch?.[1] ?? null;
  const parsedFrontmatter = frontmatter ? parseYamlObject(frontmatter) : null;
  const name =
    asNonEmptyString(parsedFrontmatter?.name) ??
    asNonEmptyString(parsedFrontmatter?.title) ??
    (frontmatter ? getTopLevelScalar(frontmatter, "name") : null) ??
    (frontmatter ? getTopLevelScalar(frontmatter, "title") : null) ??
    deriveCompanyContentName(relativePath);
  const paperclipAgentIcon =
    kind === "agents" ? getPaperclipAgentIconHint(parsedFrontmatter) : null;
  const taskSlug =
    kind === "tasks" ? normalizePaperclipSlug(relativePath.split("/").filter(Boolean).at(-2)) : null;
  const routineMetadata =
    kind === "tasks" && taskSlug ? routineMetadataByTaskSlug.get(taskSlug) ?? null : null;
  const recurring =
    kind === "tasks"
      ? isRecurringTaskFrontmatter(parsedFrontmatter, frontmatter) || routineMetadata !== null
      : false;

  return {
    kind,
    item: {
      name,
      path: relativePath,
      ...(paperclipAgentIcon ? { paperclipAgentIcon } : {}),
      ...(recurring ? { recurring: true } : {}),
      ...(routineMetadata?.status ? { paperclipRoutineStatus: routineMetadata.status } : {}),
      ...(routineMetadata ? { paperclipRoutineTriggerCount: routineMetadata.triggerCount } : {})
    }
  };
}

async function scanCompanyContents(companyRoot: string): Promise<CompanyContents> {
  const contents = createEmptyCompanyContents();
  const manifestPaths = await findCompanyContentManifestPaths(companyRoot);
  const routineMetadataByTaskSlug = await readPaperclipRoutineMetadata(companyRoot);

  for (const manifestPath of manifestPaths) {
    const parsedItem = await parseCompanyContentItem(
      manifestPath,
      companyRoot,
      routineMetadataByTaskSlug
    );
    if (!parsedItem) {
      continue;
    }

    contents[parsedItem.kind].push(parsedItem.item);
  }

  for (const key of COMPANY_CONTENT_KEYS) {
    contents[key].sort(sortCompanyContentItems);
  }

  return contents;
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

  const companyRoot = dirname(manifestPath);
  const directoryRelativePath = toPosixPath(relative(repositoryRoot, companyRoot));
  const normalizedRelativePath = directoryRelativePath === "." ? "" : directoryRelativePath;
  const normalizedManifestPath = toPosixPath(relative(repositoryRoot, manifestPath));
  const contents = await scanCompanyContents(companyRoot);
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
    manifestPath: normalizedManifestPath,
    contents
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

async function cloneRepositoryCheckout(
  repositoryReference: string
): Promise<RepositoryCheckoutCacheEntry> {
  const tempDirectory = await mkdtemp(join(tmpdir(), "paperclip-agent-companies-plugin-content-"));
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

    return {
      checkoutDirectory,
      tempDirectory
    };
  } catch (error) {
    await rm(tempDirectory, { recursive: true, force: true });
    const message = summarizeErrorMessage(error);
    if (message.includes("spawn git ENOENT")) {
      throw new Error("Git is not available in the plugin worker environment.");
    }

    throw new Error(summarizeRepositoryCloneFailure(message));
  }
}

export async function resolveRepositoryContentRoot(
  repository: RepositorySource,
  options: {
    cloneCheckout?: (repositoryReference: string) => Promise<RepositoryCheckoutCacheEntry>;
    doesPathExist?: (path: string) => Promise<boolean>;
  } = {}
): Promise<string> {
  if (looksLikeLocalPath(repository.url)) {
    return repository.url;
  }

  const doesPathExist = options.doesPathExist ?? pathExists;
  const cloneCheckout = options.cloneCheckout ?? cloneRepositoryCheckout;
  const cachedEntry = repositoryCheckoutCache.get(repository.id);
  if (cachedEntry && (await doesPathExist(cachedEntry.checkoutDirectory))) {
    return cachedEntry.checkoutDirectory;
  }

  if (cachedEntry) {
    await clearRepositoryCheckoutCacheEntry(repository.id);
  }

  let inFlightCheckout = repositoryCheckoutInflight.get(repository.id);
  if (!inFlightCheckout) {
    inFlightCheckout = (async () => {
      const nextEntry = await cloneCheckout(repository.url);
      repositoryCheckoutCache.set(repository.id, nextEntry);
      return nextEntry;
    })();

    repositoryCheckoutInflight.set(repository.id, inFlightCheckout);
    inFlightCheckout.finally(() => {
      if (repositoryCheckoutInflight.get(repository.id) === inFlightCheckout) {
        repositoryCheckoutInflight.delete(repository.id);
      }
    }).catch(() => {
      // noop: the awaiting caller will receive the original rejection
    });
  }

  const nextEntry = await inFlightCheckout;
  return nextEntry.checkoutDirectory;
}

async function readCatalogCompanyContentDetail(
  ctx: PluginContext,
  companyId: string,
  itemPath: string
): Promise<CatalogCompanyContentDetail | null> {
  const state = await loadCatalogState(ctx);
  const match = findRepositoryCompany(state, companyId);
  if (!match) {
    return null;
  }

  const contentEntry = findCompanyContentEntry(match.company, itemPath);
  if (!contentEntry) {
    return null;
  }

  const relativeFilePath = getRepositoryRelativeCompanyContentPath(match.company, contentEntry.item.path);
  const repositoryRoot = await resolveRepositoryContentRoot(match.repository);
  let absoluteFilePath;
  try {
    absoluteFilePath = resolveRepositoryRelativePath(repositoryRoot, relativeFilePath);
  } catch {
    return null;
  }

  let content;
  try {
    content = await readFile(absoluteFilePath, "utf8");
  } catch (error) {
    if (
      isRecord(error) &&
      (error.code === "ENOENT" || error.code === "EISDIR" || error.code === "EACCES")
    ) {
      return null;
    }

    throw error;
  }

  const document = splitMarkdownDocument(content);

  return {
    companyId: match.company.id,
    companyName: match.company.name,
    repositoryId: match.repository.id,
    repositoryLabel: match.repository.label,
    repositoryUrl: match.repository.url,
    item: {
      ...contentEntry.item,
      kind: contentEntry.kind,
      fullPath: relativeFilePath,
      frontmatter: document.frontmatter,
      markdown: document.markdown
    }
  };
}

async function findPortableCompanyFilePaths(companyRoot: string): Promise<string[]> {
  const filePaths: string[] = [];
  const queue = [companyRoot];

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
        if (!IGNORED_DIRECTORY_NAMES.has(entry.name) && !SENSITIVE_DIRECTORY_NAMES.has(entry.name)) {
          queue.push(fullPath);
        }
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const relativePath = normalizeCompanyContentPath(toPosixPath(relative(companyRoot, fullPath)));
      if (relativePath && !shouldSkipPortableCompanyFilePath(relativePath)) {
        filePaths.push(relativePath);
      }
    }
  }

  filePaths.sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));
  return filePaths;
}

async function buildPortableCatalogFileEntry(
  companyRoot: string,
  filePath: string
): Promise<PortableCatalogFileBuildResult> {
  const absolutePath = resolveRepositoryRelativePath(companyRoot, filePath);
  const fileStats = await stat(absolutePath);

  if (!fileStats.isFile()) {
    throw new Error(`File "${filePath}" is no longer available for import.`);
  }

  if (fileStats.size > MAX_INLINE_IMPORT_SINGLE_FILE_BYTES) {
    throw new Error(
      `File "${filePath}" is ${formatByteCount(fileStats.size)}, which exceeds the inline import per-file limit of ${formatByteCount(MAX_INLINE_IMPORT_SINGLE_FILE_BYTES)}.`
    );
  }

  const content = await readFile(absolutePath);
  const sourceBytes = content.byteLength;

  if (isLikelyTextFilePath(filePath) || isProbablyTextBuffer(content)) {
    const entry = content.toString("utf8");
    return {
      entry,
      sourceBytes,
      payloadBytes: Buffer.byteLength(entry, "utf8")
    };
  }

  const entry = {
    encoding: "base64" as const,
    data: content.toString("base64"),
    contentType: inferPortableFileContentType(filePath)
  };

  return {
    entry,
    sourceBytes,
    payloadBytes: Buffer.byteLength(entry.data, "utf8")
  };
}

async function buildCatalogCompanyImportSource(
  ctx: PluginContext,
  companyId: string,
  options: {
    allowImported?: boolean;
  } = {}
): Promise<CatalogPreparedCompanyImport> {
  const state = await loadCatalogState(ctx);
  const match = findRepositoryCompany(state, companyId);
  if (!match) {
    throw new Error("Company not found.");
  }

  if (!options.allowImported) {
    assertCatalogCompanyCanBeImported(state, match.company);
  }

  const repositoryRoot = await resolveRepositoryContentRoot(match.repository);
  const companyRelativeRoot = getRepositoryRelativeCompanyRoot(match.company);
  const companyRoot = companyRelativeRoot
    ? resolveRepositoryRelativePath(repositoryRoot, companyRelativeRoot)
    : repositoryRoot;
  const filePaths = await findPortableCompanyFilePaths(companyRoot);

  if (!filePaths.includes("COMPANY.md")) {
    throw new Error("Company package is missing COMPANY.md.");
  }

  if (filePaths.length > MAX_INLINE_IMPORT_FILES) {
    throw new Error(
      `"${match.company.name}" exceeds the inline import file limit of ${MAX_INLINE_IMPORT_FILES} files (${filePaths.length} discovered). Remove extra files or trim the package before importing.`
    );
  }

  const files: Record<string, PortableCatalogFileEntry> = {};
  let totalSourceBytes = 0;
  let totalPayloadBytes = 0;

  for (const filePath of filePaths) {
    const fileEntry = await buildPortableCatalogFileEntry(companyRoot, filePath);
    const nextTotalPayloadBytes = totalPayloadBytes + fileEntry.payloadBytes;

    if (nextTotalPayloadBytes > MAX_INLINE_IMPORT_TOTAL_PAYLOAD_BYTES) {
      throw new Error(
        `Adding "${filePath}" would exceed the inline import payload limit of ${formatByteCount(MAX_INLINE_IMPORT_TOTAL_PAYLOAD_BYTES)} (${formatByteCount(nextTotalPayloadBytes)} after encoding). Remove large assets or trim the package before importing.`
      );
    }

    totalSourceBytes += fileEntry.sourceBytes;
    totalPayloadBytes = nextTotalPayloadBytes;
    files[filePath] = fileEntry.entry;
  }

  const iconAugmentation = await applyPaperclipAgentIconsToPortableFiles(ctx, companyRoot, files);
  const portableFileSummary = summarizePortableCatalogFiles(iconAugmentation.files);
  totalSourceBytes += iconAugmentation.sourceByteDelta;

  if (portableFileSummary.fileCount > MAX_INLINE_IMPORT_FILES) {
    throw new Error(
      `"${match.company.name}" exceeds the inline import file limit of ${MAX_INLINE_IMPORT_FILES} files once Paperclip metadata is included (${portableFileSummary.fileCount} prepared). Remove extra files or trim the package before importing.`
    );
  }

  if (portableFileSummary.totalPayloadBytes > MAX_INLINE_IMPORT_TOTAL_PAYLOAD_BYTES) {
    throw new Error(
      `"${match.company.name}" exceeds the inline import payload limit of ${formatByteCount(MAX_INLINE_IMPORT_TOTAL_PAYLOAD_BYTES)} once Paperclip metadata is included (${formatByteCount(portableFileSummary.totalPayloadBytes)} after encoding). Remove large assets or trim the package before importing.`
    );
  }

  ctx.logger.info("Prepared inline company import source", {
    companyId: match.company.id,
    companyName: match.company.name,
    repositoryId: match.repository.id,
    fileCount: portableFileSummary.fileCount,
    totalSourceBytes,
    totalPayloadBytes: portableFileSummary.totalPayloadBytes
  });

  return {
    companyId: match.company.id,
    companyName: match.company.name,
    source: {
      type: "inline",
      files: iconAugmentation.files
    },
    stats: {
      fileCount: portableFileSummary.fileCount,
      textFileCount: portableFileSummary.textFileCount,
      binaryFileCount: portableFileSummary.binaryFileCount
    }
  };
}

async function executeDefaultSyncImport(
  ctx: PluginContext,
  input: SyncImportRequest
): Promise<PaperclipCompanyImportResult> {
  const connection = await resolvePaperclipApiConnection(ctx, input.importedCompanyId);
  if (!connection.apiKey) {
    const health = await fetchPaperclipHealth(connection.apiBase);
    if (requiresPaperclipBoardAccess(health)) {
      throw new Error(buildBoardAccessRequiredSyncMessage());
    }
  }

  const requestUrl = `${connection.apiBase}/api/companies/import`;
  let response;
  try {
    response = await fetch(requestUrl, {
      method: "POST",
      headers: buildPaperclipApiHeaders(connection, {
        includeJsonContentType: true
      }),
      body: JSON.stringify({
        source: input.preparedImport.source,
        include: {
          company: true,
          agents: true,
          projects: true,
          issues: true,
          skills: true
        },
        target: {
          mode: "existing_company",
          companyId: input.importedCompanyId
        },
        collisionStrategy: input.collisionStrategy
      })
    });
  } catch (error) {
    throw new Error(
      `Could not reach the Paperclip import API at ${connection.apiBase}: ${summarizeErrorMessage(error)}`
    );
  }

  let payload;
  try {
    payload = await parsePaperclipJsonResponse(response);
  } catch (error) {
    if (isBoardAccessRequiredError(error) || isPaperclipApiAuthorizationError(error)) {
      throw new Error(buildBoardAccessRequiredSyncMessage());
    }

    throw error;
  }

  if (!isRecord(payload)) {
    throw new Error("Paperclip returned an unexpected sync response.");
  }

  return payload as PaperclipCompanyImportResult;
}

function buildPaperclipApiHeaders(
  connection: PaperclipApiConnection,
  options: {
    includeJsonContentType?: boolean;
  } = {}
): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json"
  };

  if (options.includeJsonContentType) {
    headers["content-type"] = "application/json";
  }

  if (connection.apiKey) {
    headers.authorization = `Bearer ${connection.apiKey}`;
  }

  return headers;
}

async function fetchPaperclipApiJson(
  connection: PaperclipApiConnection,
  path: string,
  init: Omit<RequestInit, "headers"> = {}
): Promise<unknown> {
  const requestUrl = `${connection.apiBase}${path}`;
  let response: Response;

  try {
    response = await fetch(requestUrl, {
      ...init,
      headers: {
        ...buildPaperclipApiHeaders(connection, {
          includeJsonContentType: init.body !== undefined
        })
      }
    });
  } catch (error) {
    throw new Error(
      `Could not reach the Paperclip API at ${connection.apiBase}: ${summarizeErrorMessage(error)}`
    );
  }

  return parsePaperclipJsonResponse(response);
}

function normalizePaperclipIssue(value: unknown): PaperclipIssueRecord | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = asNonEmptyString(value.id);
  if (!id) {
    return null;
  }

  return {
    id,
    identifier: asNonEmptyString(value.identifier),
    title: asNonEmptyString(value.title),
    status: asNonEmptyString(value.status),
    assigneeAgentId: asNonEmptyString(value.assigneeAgentId)
  };
}

async function fetchPaperclipCompanyIssues(
  connection: PaperclipApiConnection,
  companyId: string
): Promise<PaperclipIssueRecord[]> {
  const payload = await fetchPaperclipApiJson(
    connection,
    `/api/companies/${encodeURIComponent(companyId)}/issues`
  );

  if (!Array.isArray(payload)) {
    throw new Error("Paperclip returned an unexpected issues response.");
  }

  return payload
    .map((issue) => normalizePaperclipIssue(issue))
    .filter((issue): issue is PaperclipIssueRecord => issue !== null);
}

function selectPaperclipIssueWakeTargets(
  beforeIssues: PaperclipIssueRecord[],
  afterIssues: PaperclipIssueRecord[]
): PaperclipIssueWakeTarget[] {
  const wakeTargetsByAgentId = new Map<string, PaperclipIssueWakeTarget>();
  const previousAssigneesByIssueId = new Map(
    beforeIssues.map((issue) => [issue.id, issue.assigneeAgentId ?? null])
  );

  for (const issue of afterIssues) {
    const assigneeAgentId = issue.assigneeAgentId;
    if (!assigneeAgentId || issue.status === "done" || issue.status === "cancelled") {
      continue;
    }

    const previousAssigneeAgentId = previousAssigneesByIssueId.get(issue.id) ?? null;
    if (previousAssigneeAgentId === assigneeAgentId) {
      continue;
    }

    if (!wakeTargetsByAgentId.has(assigneeAgentId)) {
      wakeTargetsByAgentId.set(assigneeAgentId, {
        agentId: assigneeAgentId,
        issueId: issue.id,
        issueIdentifier: issue.identifier,
        issueTitle: issue.title
      });
    }
  }

  return [...wakeTargetsByAgentId.values()];
}

function buildPaperclipIssueWakeReason(target: PaperclipIssueWakeTarget): string {
  return target.issueIdentifier
    ? `Wake for imported issue ${target.issueIdentifier}`
    : target.issueTitle
      ? `Wake for imported issue ${target.issueTitle}`
      : `Wake for imported issue ${target.issueId}`;
}

async function requestPaperclipIssueWake(
  connection: PaperclipApiConnection,
  target: PaperclipIssueWakeTarget
): Promise<void> {
  await fetchPaperclipApiJson(
    connection,
    `/api/agents/${encodeURIComponent(target.agentId)}/wakeup`,
    {
      method: "POST",
      body: JSON.stringify({
        source: "assignment",
        triggerDetail: "system",
        reason: buildPaperclipIssueWakeReason(target),
        payload: {
          issueId: target.issueId
        }
      })
    }
  );
}

async function tryFetchPaperclipCompanyIssues(
  ctx: PluginContext,
  companyId: string
): Promise<PaperclipIssueRecord[] | null> {
  try {
    const connection = await resolvePaperclipApiConnection(ctx, companyId);
    return await fetchPaperclipCompanyIssues(connection, companyId);
  } catch (error) {
    ctx.logger.warn("Skipped Paperclip issue wake snapshot because the issue list could not be read", {
      companyId,
      error: summarizeErrorMessage(error)
    });
    return null;
  }
}

async function requestWakeForNewlyAssignedPaperclipIssues(
  ctx: PluginContext,
  companyId: string,
  beforeIssues: PaperclipIssueRecord[] | null
): Promise<void> {
  if (!beforeIssues) {
    return;
  }

  let connection: PaperclipApiConnection;
  let afterIssues: PaperclipIssueRecord[];
  try {
    connection = await resolvePaperclipApiConnection(ctx, companyId);
    afterIssues = await fetchPaperclipCompanyIssues(connection, companyId);
  } catch (error) {
    ctx.logger.warn("Skipped Paperclip issue wake requests because the synced issue list could not be read", {
      companyId,
      error: summarizeErrorMessage(error)
    });
    return;
  }

  const wakeTargets = selectPaperclipIssueWakeTargets(beforeIssues, afterIssues);
  if (wakeTargets.length === 0) {
    return;
  }

  for (const target of wakeTargets) {
    try {
      await requestPaperclipIssueWake(connection, target);
      ctx.logger.info("Queued Paperclip wake request for a newly assigned synced issue", {
        companyId,
        agentId: target.agentId,
        issueId: target.issueId,
        issueIdentifier: target.issueIdentifier
      });
    } catch (error) {
      ctx.logger.warn("Failed to queue a Paperclip wake request for a newly assigned synced issue", {
        companyId,
        agentId: target.agentId,
        issueId: target.issueId,
        issueIdentifier: target.issueIdentifier,
        error: summarizeErrorMessage(error)
      });
    }
  }
}

async function runCatalogCompanySync(
  ctx: PluginContext,
  sourceCompanyId: string,
  options: {
    now: () => string;
    scanRepository: RepositoryScanner;
    syncImport: SyncImportExecutor;
    trigger: "manual" | "schedule" | "startup";
  }
): Promise<CatalogCompanySyncResult> {
  const existingSync = companySyncInflight.get(sourceCompanyId);
  if (existingSync) {
    return existingSync;
  }

  const syncPromise = (async () => {
    const startedAt = options.now();
    let currentState = await loadCatalogStateWithSyncRecovery(ctx, startedAt);
    const initialMatch = findRepositoryCompany(currentState, sourceCompanyId);
    if (!initialMatch) {
      throw new Error("Company not found.");
    }

    const importedCompany = assertCatalogCompanyCanBeSynced(currentState, initialMatch.company);
    if (isSyncCurrentlyRunning(importedCompany, startedAt)) {
      throw new Error(`"${initialMatch.company.name}" is already syncing.`);
    }

    currentState = await persistCatalogState(
      ctx,
      updateImportedCatalogCompany(currentState, sourceCompanyId, (company) => ({
        ...company,
        lastSyncStatus: "running",
        syncRunningSince: startedAt,
        lastSyncAttemptAt: startedAt,
        lastSyncError: null
      })),
      startedAt
    );

    try {
      const scannedRepository = await scanRepositoryEntry(
        initialMatch.repository,
        options.scanRepository,
        startedAt,
        ctx.logger
      );
      currentState = await persistCatalogState(
        ctx,
        updateRepository(currentState, initialMatch.repository.id, () => scannedRepository),
        options.now()
      );

      if (scannedRepository.lastScanError) {
        throw new Error(`Source repository scan failed: ${scannedRepository.lastScanError}`);
      }

      const refreshedMatch = findRepositoryCompany(currentState, sourceCompanyId);
      if (!refreshedMatch) {
        throw new Error(
          `"${initialMatch.company.name}" no longer exists in the source repository after the latest scan.`
        );
      }

      const latestSourceVersion = refreshedMatch.company.version;
      const syncAvailable = isCatalogCompanySyncAvailable(
        importedCompany.importedSourceVersion,
        latestSourceVersion
      );

      if (!syncAvailable) {
        const syncedAt = options.now();
        const latestState = await loadCatalogState(ctx);

        await persistCatalogState(
          ctx,
          updateImportedCatalogCompany(latestState, sourceCompanyId, (company) => ({
            ...company,
            importedSourceVersion: latestSourceVersion,
            lastSyncStatus: "succeeded",
            syncRunningSince: null,
            lastSyncedAt: syncedAt,
            lastSyncError: null
          })),
          syncedAt
        );

        ctx.logger.info("Skipped imported agent company sync because it is already up to date", {
          sourceCompanyId,
          sourceCompanyName: refreshedMatch.company.name,
          importedCompanyId: importedCompany.importedCompanyId,
          trigger: options.trigger,
          latestSourceVersion
        });

        return {
          company: {
            id: importedCompany.importedCompanyId,
            name: importedCompany.importedCompanyName,
            action: "unchanged"
          },
          sourceCompanyId,
          sourceCompanyName: refreshedMatch.company.name,
          importedCompanyId: importedCompany.importedCompanyId,
          importedCompanyName: importedCompany.importedCompanyName,
          importedCompanyIssuePrefix: importedCompany.importedCompanyIssuePrefix,
          importedSourceVersion: latestSourceVersion,
          latestSourceVersion,
          collisionStrategy: importedCompany.syncCollisionStrategy,
          syncedAt,
          upToDate: true
        };
      }

      const preparedImport = await buildCatalogCompanyImportSource(ctx, sourceCompanyId, {
        allowImported: true
      });
      const issuesBeforeSync = await tryFetchPaperclipCompanyIssues(
        ctx,
        importedCompany.importedCompanyId
      );
      const importResult = await options.syncImport(ctx, {
        sourceCompanyId,
        sourceCompanyName: refreshedMatch.company.name,
        importedCompanyId: importedCompany.importedCompanyId,
        collisionStrategy: importedCompany.syncCollisionStrategy,
        preparedImport
      });
      const syncedAt = options.now();
      const latestState = await loadCatalogState(ctx);
      const nextImportedCompanyId =
        asNonEmptyString(importResult.company?.id) ?? importedCompany.importedCompanyId;
      const nextImportedCompanyName = importedCompany.importedCompanyName;

      if (nextImportedCompanyId === importedCompany.importedCompanyId) {
        await requestWakeForNewlyAssignedPaperclipIssues(
          ctx,
          nextImportedCompanyId,
          issuesBeforeSync
        );
      } else {
        ctx.logger.info(
          "Skipped Paperclip wake detection because the synced import changed the imported company id",
          {
            sourceCompanyId,
            previousImportedCompanyId: importedCompany.importedCompanyId,
            nextImportedCompanyId
          }
        );
      }

      await persistCatalogState(
        ctx,
        updateImportedCatalogCompany(latestState, sourceCompanyId, (company) => ({
          ...company,
          importedCompanyId: nextImportedCompanyId,
          importedCompanyName: nextImportedCompanyName,
          importedSourceVersion: latestSourceVersion,
          lastSyncStatus: "succeeded",
          syncRunningSince: null,
          lastSyncedAt: syncedAt,
          lastSyncError: null
        })),
        syncedAt
      );

      ctx.logger.info("Synced imported agent company", {
        sourceCompanyId,
        sourceCompanyName: refreshedMatch.company.name,
        importedCompanyId: nextImportedCompanyId,
        trigger: options.trigger,
        collisionStrategy: importedCompany.syncCollisionStrategy
      });

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
        syncedAt,
        upToDate: false
      };
    } catch (error) {
      const failedAt = options.now();
      const latestState = await loadCatalogState(ctx);

      await persistCatalogState(
        ctx,
        updateImportedCatalogCompany(latestState, sourceCompanyId, (company) => ({
          ...company,
          lastSyncStatus: "failed",
          syncRunningSince: null,
          lastSyncError: summarizeErrorMessage(error)
        })),
        failedAt
      );

      ctx.logger.warn("Imported agent company sync failed", {
        sourceCompanyId,
        trigger: options.trigger,
        error: summarizeErrorMessage(error)
      });
      throw error;
    }
  })().finally(() => {
    if (companySyncInflight.get(sourceCompanyId) === syncPromise) {
      companySyncInflight.delete(sourceCompanyId);
    }
  });

  companySyncInflight.set(sourceCompanyId, syncPromise);
  return syncPromise;
}

async function runDueAutoSyncs(
  ctx: PluginContext,
  options: {
    now: () => string;
    scanRepository: RepositoryScanner;
    syncImport: SyncImportExecutor;
    trigger: "schedule" | "startup";
  }
): Promise<void> {
  if (autoSyncSweepPromise) {
    return autoSyncSweepPromise;
  }

  autoSyncSweepPromise = (async () => {
    const timestamp = options.now();
    const currentState = await loadCatalogStateWithSyncRecovery(ctx, timestamp);
    const dueImports = currentState.importedCompanies.filter((company) =>
      isCatalogCompanyAutoSyncDue(company, timestamp)
    );

    for (const importedCompany of dueImports) {
      try {
        await runCatalogCompanySync(ctx, importedCompany.sourceCompanyId, {
          ...options,
          trigger: options.trigger
        });
      } catch (error) {
        ctx.logger.warn("Automatic agent company sync failed", {
          sourceCompanyId: importedCompany.sourceCompanyId,
          trigger: options.trigger,
          error: summarizeErrorMessage(error)
        });
      }
    }
  })().finally(() => {
    autoSyncSweepPromise = null;
  });

  return autoSyncSweepPromise;
}

async function scanRepositorySource(repository: RepositorySource): Promise<DiscoveredAgentCompany[]> {
  const repositoryRoot = await resolveRepositoryContentRoot(repository);
  return scanRepositoryDirectory(repositoryRoot, repository.id);
}

function createRepositoryScanner(): RepositoryScanner {
  return scanRepositorySource;
}

export function shouldStartWorkerHost(moduleUrl: string, entry = process.argv[1]): boolean {
  if (typeof entry !== "string" || !entry.trim()) {
    return false;
  }

  const modulePath = fileURLToPath(moduleUrl);

  try {
    return realpathSync(entry) === realpathSync(modulePath);
  } catch {
    return resolve(entry) === resolve(modulePath);
  }
}

export function createAgentCompaniesPlugin(options: AgentCompaniesPluginOptions = {}) {
  const now = options.now ?? (() => new Date().toISOString());
  const scanRepository = options.scanRepository ?? createRepositoryScanner();
  const syncImport = options.syncImport ?? executeDefaultSyncImport;
  const startupAutoSyncDelayMs =
    options.startupAutoSyncDelayMs === undefined
      ? DEFAULT_STARTUP_AUTO_SYNC_DELAY_MS
      : options.startupAutoSyncDelayMs;

  return definePlugin({
    async setup(ctx) {
      ctx.data.register("catalog.read", async () => {
        const timestamp = now();
        const loadedState = await loadCatalogStateRecord(ctx);
        const hydratedState = await ensureSeedRepositoriesScanned(
          ctx,
          loadedState.state,
          loadedState.hasPersistedRepositories,
          timestamp,
          scanRepository
        );
        const recoveredState = recoverStaleImportedCompanySyncs(hydratedState, timestamp);
        const nextState = recoveredState.changed
          ? await persistCatalogState(ctx, recoveredState.state, timestamp)
          : hydratedState;

        return buildCatalogResponse(nextState, timestamp);
      });

      ctx.data.register("board-access.read", async (rawParams) => {
        const params = isRecord(rawParams) ? rawParams : {};
        const companyId = asNonEmptyString(params.companyId);
        const state = await loadBoardAccessState(ctx);
        return getBoardAccessRegistration(state, companyId);
      });

      ctx.data.register("catalog.company-content.read", async (rawParams) => {
        const params = isRecord(rawParams) ? rawParams : {};
        const companyId = asNonEmptyString(params.companyId);
        const itemPath = asNonEmptyString(params.itemPath);

        if (!companyId || !itemPath) {
          return null;
        }

        return readCatalogCompanyContentDetail(ctx, companyId, itemPath);
      });

      ctx.actions.register("catalog.prepare-company-import", async (rawParams) => {
        const params = isRecord(rawParams) ? rawParams : {};
        const companyId = getRequiredString(params, "companyId");
        return buildCatalogCompanyImportSource(ctx, companyId);
      });

      ctx.actions.register("paperclip-runtime.set-api-base", async (rawParams) => {
        const params = isRecord(rawParams) ? rawParams : {};
        const apiBase = normalizeApiBase(getRequiredString(params, "apiBase"));
        const currentState = await loadPaperclipRuntimeState(ctx);

        if (currentState.apiBase === apiBase) {
          return currentState;
        }

        const timestamp = now();
        return persistPaperclipRuntimeState(
          ctx,
          {
            apiBase,
            updatedAt: timestamp
          },
          timestamp
        );
      });

      ctx.actions.register("catalog.record-company-import", async (rawParams) => {
        const params = isRecord(rawParams) ? rawParams : {};
        const sourceCompanyId = getRequiredString(params, "sourceCompanyId");
        const importedCompanyId = getRequiredString(params, "importedCompanyId");
        const importedCompanyName = getRequiredString(params, "importedCompanyName");
        const importedCompanyIssuePrefix = asNonEmptyString(params.importedCompanyIssuePrefix);
        const timestamp = now();
        const currentState = await loadCatalogStateWithSyncRecovery(ctx, timestamp);
        const match = findRepositoryCompany(currentState, sourceCompanyId);

        if (!match) {
          throw new Error("Company not found.");
        }

        const existingImport = findImportedCatalogCompany(currentState, sourceCompanyId);
        if (existingImport && existingImport.importedCompanyId !== importedCompanyId) {
          throw new Error(buildAlreadyImportedErrorMessage(match.company.name, existingImport));
        }

        const nextState = await persistCatalogState(
          ctx,
          {
            ...currentState,
            importedCompanies: [
              ...currentState.importedCompanies.filter(
                (candidate) => candidate.sourceCompanyId !== sourceCompanyId
              ),
              {
                sourceCompanyId,
                importedCompanyId,
                importedCompanyName,
                importedCompanyIssuePrefix,
                importedSourceVersion: match.company.version,
                importedAt: timestamp,
                autoSyncEnabled: existingImport?.autoSyncEnabled ?? DEFAULT_AUTO_SYNC_ENABLED,
                syncCollisionStrategy:
                  existingImport?.syncCollisionStrategy ?? DEFAULT_SYNC_COLLISION_STRATEGY,
                lastSyncStatus: "succeeded",
                lastSyncAttemptAt: existingImport?.lastSyncAttemptAt ?? timestamp,
                lastSyncedAt: timestamp,
                lastSyncError: null,
                syncRunningSince: null
              }
            ]
          },
          timestamp
        );

        return buildCatalogResponse(nextState, timestamp);
      });

      ctx.actions.register("catalog.set-company-auto-sync", async (rawParams) => {
        const params = isRecord(rawParams) ? rawParams : {};
        const sourceCompanyId = getRequiredString(params, "sourceCompanyId");
        const enabled = typeof params.enabled === "boolean" ? params.enabled : null;

        if (enabled === null) {
          throw new Error("enabled must be a boolean.");
        }

        const timestamp = now();
        const currentState = await loadCatalogStateWithSyncRecovery(ctx, timestamp);
        const match = findRepositoryCompany(currentState, sourceCompanyId);
        if (!match) {
          throw new Error("Company not found.");
        }

        assertCatalogCompanyCanBeSynced(currentState, match.company);

        const nextState = await persistCatalogState(
          ctx,
          updateImportedCatalogCompany(currentState, sourceCompanyId, (company) => ({
            ...company,
            autoSyncEnabled: enabled
          })),
          timestamp
        );

        return buildCatalogResponse(nextState, timestamp);
      });

      ctx.actions.register("catalog.sync-company", async (rawParams) => {
        const params = isRecord(rawParams) ? rawParams : {};
        const companyId = getRequiredString(params, "companyId");

        return runCatalogCompanySync(ctx, companyId, {
          now,
          scanRepository,
          syncImport,
          trigger: "manual"
        });
      });

      ctx.actions.register("board-access.update", async (rawParams) => {
        const params = isRecord(rawParams) ? rawParams : {};
        const companyId = getRequiredString(params, "companyId");
        const paperclipBoardApiTokenRef = asNonEmptyString(params.paperclipBoardApiTokenRef);
        const identity = asNonEmptyString(params.identity);
        const timestamp = now();
        const currentState = await loadBoardAccessState(ctx);
        const nextCompanies = { ...currentState.companies };

        if (paperclipBoardApiTokenRef) {
          nextCompanies[companyId] = {
            paperclipBoardApiTokenRef,
            identity,
            updatedAt: timestamp
          };
        } else {
          delete nextCompanies[companyId];
        }

        const nextState = await persistBoardAccessState(
          ctx,
          {
            companies: nextCompanies,
            updatedAt: timestamp
          },
          timestamp
        );

        return getBoardAccessRegistration(nextState, companyId);
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

        return buildCatalogResponse(nextState, now());
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

        await clearRepositoryCheckoutCacheEntry(repositoryId);

        const nextState = await persistCatalogState(
          ctx,
          {
            ...currentState,
            repositories: nextRepositories
          },
          now()
        );

        return buildCatalogResponse(nextState, now());
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

        return buildCatalogResponse(nextState, now());
      });

      ctx.actions.register("catalog.scan-all-repositories", async () => {
        const timestamp = now();
        let nextState = await loadCatalogStateWithSyncRecovery(ctx, timestamp);

        for (const repository of nextState.repositories) {
          const scannedRepository = await scanRepositoryEntry(repository, scanRepository, timestamp, ctx.logger);
          nextState = updateRepository(nextState, repository.id, () => scannedRepository);
        }

        const persistedState = await persistCatalogState(ctx, nextState, timestamp);
        return buildCatalogResponse(persistedState, timestamp);
      });

      ctx.jobs.register(AUTO_SYNC_JOB_KEY, async () => {
        await runDueAutoSyncs(ctx, {
          now,
          scanRepository,
          syncImport,
          trigger: "schedule"
        });
      });

      if (startupAutoSyncDelayMs !== null && Number.isFinite(startupAutoSyncDelayMs) && startupAutoSyncDelayMs >= 0) {
        const startupTimer = setTimeout(() => {
          void runDueAutoSyncs(ctx, {
            now,
            scanRepository,
            syncImport,
            trigger: "startup"
          });
        }, startupAutoSyncDelayMs);
        startupTimer.unref?.();
      }
    }
  });
}

const plugin = createAgentCompaniesPlugin();

export default plugin;

if (shouldStartWorkerHost(import.meta.url)) {
  startWorkerRpcHost({ plugin });
}
