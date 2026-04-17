export const PLUGIN_ID = "paperclip-agent-companies-plugin";
export const PLUGIN_DISPLAY_NAME = "Agent Companies Plugin";
export const DEFAULT_REPOSITORY_URL = "https://github.com/paperclipai/companies";
export const CATALOG_STATE_KEY = "agent-companies.catalog.v1";
export const AGENT_COMPANIES_SCHEMA = "agentcompanies/v1";
export const COMPANY_CONTENT_KEYS = ["agents", "projects", "tasks", "issues", "skills"] as const;
export const DEFAULT_AUTO_SYNC_ENABLED = true;
export const DEFAULT_SYNC_COLLISION_STRATEGY = "replace" as const;
export const AUTO_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

export type CompanyContentKey = (typeof COMPANY_CONTENT_KEYS)[number];
export type CatalogSyncCollisionStrategy = "rename" | "skip" | "replace";
export type CatalogCompanySyncStatus = "idle" | "running" | "succeeded" | "failed";

export type RepositoryScanStatus = "idle" | "ready" | "error";

export interface CompanyContentItem {
  name: string;
  path: string;
  paperclipAgentIcon?: string | null;
  recurring?: boolean;
  paperclipRoutineStatus?: string | null;
  paperclipRoutineTriggerCount?: number;
}

export interface CompanyContents {
  agents: CompanyContentItem[];
  projects: CompanyContentItem[];
  tasks: CompanyContentItem[];
  issues: CompanyContentItem[];
  skills: CompanyContentItem[];
}

export interface CatalogCompanyContentDetail {
  companyId: string;
  companyName: string;
  repositoryId: string;
  repositoryLabel: string;
  repositoryUrl: string;
  item: CompanyContentItem & {
    kind: CompanyContentKey;
    fullPath: string;
    frontmatter: string | null;
    markdown: string;
  };
}

export type PortableCatalogFileEntry =
  | string
  | {
      encoding: "base64";
      data: string;
      contentType?: string | null;
    };

export interface CatalogPreparedCompanyImport {
  companyId: string;
  companyName: string;
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

export interface CatalogImportEntityResult {
  action?: string;
  id?: string | null;
  name?: string;
  slug?: string;
  reason?: string | null;
}

export interface PaperclipCompanyImportResult {
  company?: {
    id?: string;
    name?: string;
    action?: string;
  } | null;
  agents?: CatalogImportEntityResult[] | null;
  projects?: CatalogImportEntityResult[] | null;
  issues?: CatalogImportEntityResult[] | null;
  skills?: CatalogImportEntityResult[] | null;
  warnings?: unknown;
}

export interface ImportedCatalogCompanyRecord {
  sourceCompanyId: string;
  importedCompanyId: string;
  importedCompanyName: string;
  importedCompanyIssuePrefix: string | null;
  importedSourceVersion: string | null;
  importedAt: string | null;
  autoSyncEnabled: boolean;
  syncCollisionStrategy: CatalogSyncCollisionStrategy;
  lastSyncStatus: CatalogCompanySyncStatus;
  lastSyncAttemptAt: string | null;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  syncRunningSince: string | null;
}

export interface CatalogCompanyImportStatus {
  id: string;
  name: string;
  issuePrefix: string | null;
  importedSourceVersion: string | null;
  latestSourceVersion: string | null;
  importedAt: string | null;
  autoSyncEnabled: boolean;
  syncCollisionStrategy: CatalogSyncCollisionStrategy;
  syncStatus: CatalogCompanySyncStatus;
  lastSyncAttemptAt: string | null;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  syncRunningSince: string | null;
  isSyncAvailable: boolean;
  isUpToDate: boolean;
  isAutoSyncDue: boolean;
  nextAutoSyncAt: string | null;
}

export interface CatalogCompanySyncResult extends PaperclipCompanyImportResult {
  sourceCompanyId: string;
  sourceCompanyName: string;
  importedCompanyId: string;
  importedCompanyName: string;
  importedCompanyIssuePrefix: string | null;
  importedSourceVersion: string | null;
  latestSourceVersion: string | null;
  collisionStrategy: CatalogSyncCollisionStrategy;
  syncedAt: string;
  upToDate: boolean;
}

export interface DiscoveredAgentCompany {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  schema: string;
  version: string | null;
  relativePath: string;
  manifestPath: string;
  contents: CompanyContents;
}

export interface RepositorySource {
  id: string;
  url: string;
  normalizedUrl: string;
  label: string;
  isDefault: boolean;
  status: RepositoryScanStatus;
  companies: DiscoveredAgentCompany[];
  lastScannedAt: string | null;
  lastScanError: string | null;
}

export interface CatalogState {
  repositories: RepositorySource[];
  importedCompanies: ImportedCatalogCompanyRecord[];
  updatedAt: string | null;
}

export interface CatalogRepositorySummary extends RepositorySource {
  companyCount: number;
}

export interface CatalogCompanySummary extends DiscoveredAgentCompany {
  repositoryId: string;
  repositoryLabel: string;
  repositoryUrl: string;
  repositoryIsDefault: boolean;
  importedCompanies: CatalogCompanyImportStatus[];
}

export interface CatalogImportedCompanySummary extends CatalogCompanySummary {
  sourceCompanyId: string;
  importedCompany: CatalogCompanyImportStatus;
}

export interface CatalogSnapshot {
  repositories: CatalogRepositorySummary[];
  companies: CatalogCompanySummary[];
  importedCompanies: CatalogImportedCompanySummary[];
  summary: {
    repositoryCount: number;
    scannedRepositoryCount: number;
    errorRepositoryCount: number;
    companyCount: number;
    importedCompanyCount: number;
    updatedAt: string | null;
  };
}

const GIT_SSH_REPOSITORY_PATTERN = /^git@([^:]+):(.+)$/i;
const GITHUB_SHORTHAND_REPOSITORY_PATTERN = /^(?<owner>[A-Za-z0-9_.-]+)\/(?<repo>[A-Za-z0-9_.-]+?)(?:\.git)?$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asIsoTimestamp(value: unknown): string | null {
  const text = asNonEmptyString(value);
  return text ?? null;
}

function asNonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function normalizeCatalogSyncCollisionStrategy(value: unknown): CatalogSyncCollisionStrategy {
  return value === "rename" || value === "skip" ? value : DEFAULT_SYNC_COLLISION_STRATEGY;
}

function normalizeCatalogCompanySyncStatus(value: unknown): CatalogCompanySyncStatus {
  return value === "running" || value === "succeeded" || value === "failed" ? value : "idle";
}

function addMillisecondsToIso(timestamp: string, deltaMs: number): string | null {
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return new Date(parsed + deltaMs).toISOString();
}

function normalizeComparableVersion(value: string): string {
  return value.trim().replace(/^v/iu, "");
}

function parseComparableVersion(value: string): {
  major: number;
  minor: number;
  patch: number;
  prerelease: string | null;
} | null {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/u.exec(normalizeComparableVersion(value));
  if (!match) {
    return null;
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ?? null
  };
}

export function isCatalogCompanySyncAvailable(
  importedSourceVersion: string | null,
  latestSourceVersion: string | null
): boolean {
  const importedVersion = asNonEmptyString(importedSourceVersion);
  const latestVersion = asNonEmptyString(latestSourceVersion);

  if (!latestVersion) {
    return true;
  }

  if (!importedVersion) {
    return true;
  }

  if (normalizeComparableVersion(importedVersion) === normalizeComparableVersion(latestVersion)) {
    return false;
  }

  const parsedImportedVersion = parseComparableVersion(importedVersion);
  const parsedLatestVersion = parseComparableVersion(latestVersion);
  if (!parsedImportedVersion || !parsedLatestVersion) {
    return true;
  }

  if (parsedLatestVersion.major !== parsedImportedVersion.major) {
    return parsedLatestVersion.major > parsedImportedVersion.major;
  }

  if (parsedLatestVersion.minor !== parsedImportedVersion.minor) {
    return parsedLatestVersion.minor > parsedImportedVersion.minor;
  }

  if (parsedLatestVersion.patch !== parsedImportedVersion.patch) {
    return parsedLatestVersion.patch > parsedImportedVersion.patch;
  }

  if (parsedImportedVersion.prerelease === parsedLatestVersion.prerelease) {
    return false;
  }

  if (parsedImportedVersion.prerelease && !parsedLatestVersion.prerelease) {
    return true;
  }

  if (!parsedImportedVersion.prerelease && parsedLatestVersion.prerelease) {
    return false;
  }

  return true;
}

export function getCatalogCompanyAutoSyncReferenceAt(
  record: Pick<ImportedCatalogCompanyRecord, "lastSyncAttemptAt" | "lastSyncedAt" | "importedAt">
): string | null {
  return (
    asIsoTimestamp(record.lastSyncAttemptAt) ??
    asIsoTimestamp(record.lastSyncedAt) ??
    asIsoTimestamp(record.importedAt)
  );
}

export function getCatalogCompanyNextAutoSyncAt(
  record: Pick<
    ImportedCatalogCompanyRecord,
    "autoSyncEnabled" | "lastSyncAttemptAt" | "lastSyncedAt" | "importedAt"
  >
): string | null {
  if (!record.autoSyncEnabled) {
    return null;
  }

  const referenceTimestamp = getCatalogCompanyAutoSyncReferenceAt(record);
  if (!referenceTimestamp) {
    return null;
  }

  return addMillisecondsToIso(referenceTimestamp, AUTO_SYNC_INTERVAL_MS);
}

export function isCatalogCompanyAutoSyncDue(
  record: Pick<
    ImportedCatalogCompanyRecord,
    "autoSyncEnabled" | "lastSyncAttemptAt" | "lastSyncedAt" | "importedAt" | "lastSyncStatus"
  >,
  now: string
): boolean {
  if (!record.autoSyncEnabled || record.lastSyncStatus === "running") {
    return false;
  }

  const nextAutoSyncAt = getCatalogCompanyNextAutoSyncAt(record);
  if (!nextAutoSyncAt) {
    return true;
  }

  const nowTimestamp = Date.parse(now);
  const nextTimestamp = Date.parse(nextAutoSyncAt);
  if (!Number.isFinite(nowTimestamp) || !Number.isFinite(nextTimestamp)) {
    return false;
  }

  return nowTimestamp >= nextTimestamp;
}

export function sortCompanyContentItems(left: CompanyContentItem, right: CompanyContentItem): number {
  return (
    left.name.localeCompare(right.name, undefined, { sensitivity: "base" }) ||
    left.path.localeCompare(right.path, undefined, { sensitivity: "base" })
  );
}

export function normalizeCompanyContentPath(value: string): string | null {
  const normalizedPath = value.trim().replace(/[\\]+/gu, "/");
  if (
    !normalizedPath ||
    normalizedPath.startsWith("/") ||
    normalizedPath.startsWith("~/") ||
    /^[A-Za-z]:\//u.test(normalizedPath)
  ) {
    return null;
  }

  const segments = normalizedPath.split("/").filter(Boolean);
  if (
    segments.length === 0 ||
    segments.some((segment) => segment === "." || segment === "..")
  ) {
    return null;
  }

  return segments.join("/");
}

function deriveCompanyContentName(path: string): string {
  const segments = path.split("/").filter(Boolean);
  return segments.length >= 2 ? segments[segments.length - 2] ?? path : path;
}

function normalizeCompanyContentItem(value: unknown): CompanyContentItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const rawPath = asNonEmptyString(value.path);
  if (!rawPath) {
    return null;
  }

  const path = normalizeCompanyContentPath(rawPath);
  if (!path) {
    return null;
  }

  const paperclipAgentIcon = asNonEmptyString(value.paperclipAgentIcon);
  const paperclipRoutineStatus = asNonEmptyString(value.paperclipRoutineStatus);
  const paperclipRoutineTriggerCount = asNonNegativeInteger(value.paperclipRoutineTriggerCount);

  return {
    name: asNonEmptyString(value.name) ?? deriveCompanyContentName(path),
    path,
    ...(paperclipAgentIcon ? { paperclipAgentIcon } : {}),
    ...(value.recurring === true ? { recurring: true } : {}),
    ...(paperclipRoutineStatus ? { paperclipRoutineStatus } : {}),
    ...(paperclipRoutineTriggerCount !== null
      ? { paperclipRoutineTriggerCount }
      : {})
  };
}

export function createEmptyCompanyContents(): CompanyContents {
  return {
    agents: [],
    projects: [],
    tasks: [],
    issues: [],
    skills: []
  };
}

function normalizeCompanyContents(value: unknown): CompanyContents {
  if (!isRecord(value)) {
    return createEmptyCompanyContents();
  }

  const contents = createEmptyCompanyContents();

  for (const key of COMPANY_CONTENT_KEYS) {
    const items: CompanyContentItem[] = [];
    const seenPaths = new Set<string>();
    const rawItems = Array.isArray(value[key]) ? value[key] : [];

    for (const rawItem of rawItems) {
      const item = normalizeCompanyContentItem(rawItem);
      if (!item || seenPaths.has(item.path)) {
        continue;
      }

      items.push(item);
      seenPaths.add(item.path);
    }

    contents[key] = items.sort(sortCompanyContentItems);
  }

  return contents;
}

function normalizeRepositoryScanStatus(value: unknown): RepositoryScanStatus {
  return value === "ready" || value === "error" ? value : "idle";
}

function normalizeDisplaySegments(url: URL): string[] {
  return url.pathname
    .replace(/\/+$/u, "")
    .replace(/\.git$/iu, "")
    .split("/")
    .filter(Boolean);
}

function maybeParseRepositoryUrl(input: string): URL | null {
  try {
    return new URL(input);
  } catch {
    return null;
  }
}

function canonicalizeHttpRepository(url: URL): string {
  const segments = normalizeDisplaySegments(url);
  return `https://${url.host.toLowerCase()}/${segments.join("/")}`;
}

function normalizeSshRepository(input: string): string {
  const match = GIT_SSH_REPOSITORY_PATTERN.exec(input);
  if (!match) {
    return input;
  }

  const [, host, path] = match;
  const normalizedPath = path.replace(/\/+$/u, "").replace(/\.git$/iu, "");
  return `https://${host.toLowerCase()}/${normalizedPath}`;
}

function normalizeGithubShorthandRepository(input: string): string | null {
  const trimmed = input.trim();
  if (
    trimmed.startsWith("./") ||
    trimmed.startsWith("../") ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("~/") ||
    /^[A-Za-z]:[\\/]/u.test(trimmed) ||
    trimmed.includes("\\")
  ) {
    return null;
  }

  const match = GITHUB_SHORTHAND_REPOSITORY_PATTERN.exec(trimmed);
  if (!match?.groups) {
    return null;
  }

  const owner = match.groups.owner?.trim();
  const repo = match.groups.repo?.trim();
  if (!owner || !repo) {
    return null;
  }

  return `https://github.com/${owner}/${repo}`;
}

export function normalizeRepositoryReference(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Repository URL or local path is required.");
  }

  if (GIT_SSH_REPOSITORY_PATTERN.test(trimmed)) {
    return normalizeSshRepository(trimmed);
  }

  const githubShorthand = normalizeGithubShorthandRepository(trimmed);
  if (githubShorthand) {
    return githubShorthand;
  }

  const parsedUrl = maybeParseRepositoryUrl(trimmed);
  if (parsedUrl) {
    if (parsedUrl.protocol === "file:") {
      return parsedUrl.pathname.replace(/\/+$/u, "");
    }

    if (
      parsedUrl.protocol === "http:" ||
      parsedUrl.protocol === "https:" ||
      parsedUrl.protocol === "ssh:" ||
      parsedUrl.protocol === "git:"
    ) {
      return canonicalizeHttpRepository(parsedUrl);
    }
  }

  return trimmed.replace(/\/+$/u, "");
}

export function normalizeRepositoryCloneRef(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Repository URL or local path is required.");
  }

  if (GIT_SSH_REPOSITORY_PATTERN.test(trimmed)) {
    return trimmed.replace(/\/+$/u, "");
  }

  const githubShorthand = normalizeGithubShorthandRepository(trimmed);
  if (githubShorthand) {
    return githubShorthand;
  }

  const parsedUrl = maybeParseRepositoryUrl(trimmed);
  if (parsedUrl) {
    if (parsedUrl.protocol === "file:") {
      return parsedUrl.pathname.replace(/\/+$/u, "");
    }

    parsedUrl.search = "";
    parsedUrl.hash = "";
    parsedUrl.pathname = parsedUrl.pathname.replace(/\/+$/u, "");
    return parsedUrl.toString();
  }

  return trimmed.replace(/\/+$/u, "");
}

export function createRepositoryId(normalizedUrl: string): string {
  let hash = 2166136261;

  for (let index = 0; index < normalizedUrl.length; index += 1) {
    hash ^= normalizedUrl.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `repo-${Math.abs(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function deriveRepositoryLabel(normalizedUrl: string): string {
  const parsedUrl = maybeParseRepositoryUrl(normalizedUrl);
  if (parsedUrl) {
    const segments = normalizeDisplaySegments(parsedUrl);
    if (segments.length >= 2) {
      return `${segments[segments.length - 2]}/${segments[segments.length - 1]}`;
    }

    return parsedUrl.host;
  }

  const segments = normalizedUrl.split(/[\\/]/u).filter(Boolean);
  return segments[segments.length - 1] ?? normalizedUrl;
}

function normalizeCompany(value: unknown, repositoryId: string): DiscoveredAgentCompany | null {
  if (!isRecord(value)) {
    return null;
  }

  const manifestPath = asNonEmptyString(value.manifestPath);
  if (!manifestPath) {
    return null;
  }

  const name = asNonEmptyString(value.name) ?? manifestPath;
  const slug = asNonEmptyString(value.slug) ?? name.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "");
  const relativePath = asNonEmptyString(value.relativePath) ?? "";

  return {
    id:
      asNonEmptyString(value.id) ??
      `${repositoryId}:${manifestPath}`,
    name,
    slug,
    description: asNonEmptyString(value.description),
    schema: asNonEmptyString(value.schema) ?? AGENT_COMPANIES_SCHEMA,
    version: asNonEmptyString(value.version),
    relativePath,
    manifestPath,
    contents: normalizeCompanyContents(value.contents)
  };
}

function normalizeImportedCatalogCompany(value: unknown): ImportedCatalogCompanyRecord | null {
  if (!isRecord(value)) {
    return null;
  }

  const sourceCompanyId =
    asNonEmptyString(value.sourceCompanyId) ??
    asNonEmptyString(value.catalogCompanyId) ??
    asNonEmptyString(value.companyId);
  const importedCompanyId =
    asNonEmptyString(value.importedCompanyId) ??
    asNonEmptyString(value.paperclipCompanyId);

  if (!sourceCompanyId || !importedCompanyId) {
    return null;
  }

  const importedAt =
    asIsoTimestamp(value.importedAt) ??
    asIsoTimestamp(value.lastSyncedAt) ??
    asIsoTimestamp(value.lastSyncAttemptAt);
  const lastSyncedAt = asIsoTimestamp(value.lastSyncedAt) ?? importedAt;
  const lastSyncAttemptAt = asIsoTimestamp(value.lastSyncAttemptAt) ?? lastSyncedAt ?? importedAt;
  const initialSyncStatus = normalizeCatalogCompanySyncStatus(
    value.lastSyncStatus ??
      value.syncStatus ??
      (lastSyncedAt ? "succeeded" : "idle")
  );
  const syncRunningSince =
    asIsoTimestamp(value.syncRunningSince) ??
    (initialSyncStatus === "running" ? lastSyncAttemptAt : null);

  return {
    sourceCompanyId,
    importedCompanyId,
    importedCompanyName:
      asNonEmptyString(value.importedCompanyName) ??
      asNonEmptyString(value.paperclipCompanyName) ??
      importedCompanyId,
    importedCompanyIssuePrefix:
      asNonEmptyString(value.importedCompanyIssuePrefix) ??
      asNonEmptyString(value.paperclipCompanyIssuePrefix) ??
      asNonEmptyString(value.issuePrefix),
    importedSourceVersion:
      asNonEmptyString(value.importedSourceVersion) ??
      asNonEmptyString(value.sourceVersion) ??
      asNonEmptyString(value.version),
    importedAt,
    autoSyncEnabled:
      typeof value.autoSyncEnabled === "boolean"
        ? value.autoSyncEnabled
        : typeof value.syncEnabled === "boolean"
          ? value.syncEnabled
          : DEFAULT_AUTO_SYNC_ENABLED,
    syncCollisionStrategy: normalizeCatalogSyncCollisionStrategy(
      value.syncCollisionStrategy ?? value.collisionStrategy
    ),
    lastSyncStatus:
      initialSyncStatus === "idle" && lastSyncedAt !== null
        ? "succeeded"
        : initialSyncStatus,
    lastSyncAttemptAt,
    lastSyncedAt,
    lastSyncError: asNonEmptyString(value.lastSyncError),
    syncRunningSince
  };
}

function getImportedCatalogCompanyRecordKey(record: Pick<ImportedCatalogCompanyRecord, "sourceCompanyId" | "importedCompanyId">): string {
  return `${record.sourceCompanyId}::${record.importedCompanyId}`;
}

function normalizeRepositorySource(value: unknown): RepositorySource | null {
  if (!isRecord(value)) {
    return null;
  }

  const rawUrl = asNonEmptyString(value.url) ?? asNonEmptyString(value.normalizedUrl);
  if (!rawUrl) {
    return null;
  }

  const url = normalizeRepositoryCloneRef(rawUrl);
  const normalizedUrl = normalizeRepositoryReference(rawUrl);
  const id = asNonEmptyString(value.id) ?? createRepositoryId(normalizedUrl);
  const companies = Array.isArray(value.companies)
    ? value.companies
        .map((company) => normalizeCompany(company, id))
        .filter((company): company is DiscoveredAgentCompany => company !== null)
        .sort((left, right) =>
          left.name.localeCompare(right.name, undefined, { sensitivity: "base" }) ||
          left.slug.localeCompare(right.slug, undefined, { sensitivity: "base" }) ||
          left.manifestPath.localeCompare(right.manifestPath, undefined, { sensitivity: "base" })
        )
    : [];
  const lastScannedAt = asIsoTimestamp(value.lastScannedAt);
  const lastScanError = asNonEmptyString(value.lastScanError);
  const derivedStatus =
    lastScanError !== null
      ? "error"
      : lastScannedAt !== null || companies.length > 0
        ? "ready"
        : normalizeRepositoryScanStatus(value.status);

  return {
    id,
    url,
    normalizedUrl,
    label: asNonEmptyString(value.label) ?? deriveRepositoryLabel(normalizedUrl),
    isDefault:
      typeof value.isDefault === "boolean"
        ? value.isDefault
        : normalizedUrl === normalizeRepositoryReference(DEFAULT_REPOSITORY_URL),
    status: derivedStatus,
    companies,
    lastScannedAt,
    lastScanError
  };
}

export function createRepositorySource(rawInput: string): RepositorySource {
  const url = normalizeRepositoryCloneRef(rawInput);
  const normalizedUrl = normalizeRepositoryReference(rawInput);

  return {
    id: createRepositoryId(normalizedUrl),
    url,
    normalizedUrl,
    label: deriveRepositoryLabel(normalizedUrl),
    isDefault: normalizedUrl === normalizeRepositoryReference(DEFAULT_REPOSITORY_URL),
    status: "idle",
    companies: [],
    lastScannedAt: null,
    lastScanError: null
  };
}

export function createDefaultCatalogState(): CatalogState {
  return {
    repositories: [createRepositorySource(DEFAULT_REPOSITORY_URL)],
    importedCompanies: [],
    updatedAt: null
  };
}

export function hasPersistedCatalogRepositories(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return Array.isArray(value.repositories) || Array.isArray(value.repos);
}

export function normalizeCatalogState(value: unknown): CatalogState {
  if (!isRecord(value)) {
    return createDefaultCatalogState();
  }

  const hadExplicitRepositories = Array.isArray(value.repositories) || Array.isArray(value.repos);
  const rawRepositories = Array.isArray(value.repositories)
    ? value.repositories
    : Array.isArray(value.repos)
      ? value.repos
      : [];
  const seen = new Set<string>();
  const repositories: RepositorySource[] = [];

  for (const repository of rawRepositories) {
    const normalizedRepository = normalizeRepositorySource(repository);
    if (!normalizedRepository || seen.has(normalizedRepository.id)) {
      continue;
    }

    repositories.push(normalizedRepository);
    seen.add(normalizedRepository.id);
  }

  const rawImportedCompanies = Array.isArray(value.importedCompanies)
    ? value.importedCompanies
    : Array.isArray(value.imports)
      ? value.imports
      : [];
  const importedCompanies = new Map<string, ImportedCatalogCompanyRecord>();

  for (const importedCompany of rawImportedCompanies) {
    const normalizedImportedCompany = normalizeImportedCatalogCompany(importedCompany);
    if (!normalizedImportedCompany) {
      continue;
    }

    importedCompanies.set(
      getImportedCatalogCompanyRecordKey(normalizedImportedCompany),
      normalizedImportedCompany
    );
  }

  return {
    repositories: repositories.length > 0 || hadExplicitRepositories ? repositories : createDefaultCatalogState().repositories,
    importedCompanies: [...importedCompanies.values()],
    updatedAt: asIsoTimestamp(value.updatedAt)
  };
}

export function buildCatalogSnapshot(state: CatalogState, now: string | null = null): CatalogSnapshot {
  const importedCompaniesBySourceId = new Map<string, ImportedCatalogCompanyRecord[]>();

  for (const importedCompany of state.importedCompanies) {
    const existingImportedCompanies = importedCompaniesBySourceId.get(importedCompany.sourceCompanyId) ?? [];
    existingImportedCompanies.push(importedCompany);
    importedCompaniesBySourceId.set(importedCompany.sourceCompanyId, existingImportedCompanies);
  }
  const repositories = state.repositories.map((repository) => ({
    ...repository,
    companyCount: repository.companies.length
  }));
  const companies = repositories
    .flatMap((repository) =>
      repository.companies.map((company) => ({
        ...company,
        repositoryId: repository.id,
        repositoryLabel: repository.label,
        repositoryUrl: repository.url,
        repositoryIsDefault: repository.isDefault,
        importedCompanies: (importedCompaniesBySourceId.get(company.id) ?? [])
          .map((importedCompany) => {
            const latestSourceVersion = company.version;
            const isSyncAvailable = isCatalogCompanySyncAvailable(
              importedCompany.importedSourceVersion,
              latestSourceVersion
            );

            return {
              id: importedCompany.importedCompanyId,
              name: importedCompany.importedCompanyName,
              issuePrefix: importedCompany.importedCompanyIssuePrefix,
              importedSourceVersion: importedCompany.importedSourceVersion,
              latestSourceVersion,
              importedAt: importedCompany.importedAt,
              autoSyncEnabled: importedCompany.autoSyncEnabled,
              syncCollisionStrategy: importedCompany.syncCollisionStrategy,
              syncStatus: importedCompany.lastSyncStatus,
              lastSyncAttemptAt: importedCompany.lastSyncAttemptAt,
              lastSyncedAt: importedCompany.lastSyncedAt,
              lastSyncError: importedCompany.lastSyncError,
              syncRunningSince: importedCompany.syncRunningSince,
              isSyncAvailable,
              isUpToDate: !isSyncAvailable,
              isAutoSyncDue:
                now && isSyncAvailable ? isCatalogCompanyAutoSyncDue(importedCompany, now) : false,
              nextAutoSyncAt: importedCompany.autoSyncEnabled ? getCatalogCompanyNextAutoSyncAt(importedCompany) : null
            };
          })
          .sort((left, right) =>
            left.name.localeCompare(right.name, undefined, { sensitivity: "base" }) ||
            (left.issuePrefix ?? "").localeCompare(right.issuePrefix ?? "", undefined, {
              sensitivity: "base"
            }) ||
            left.id.localeCompare(right.id, undefined, { sensitivity: "base" })
          )
      }))
    )
    .sort((left, right) =>
      left.name.localeCompare(right.name, undefined, { sensitivity: "base" }) ||
      left.repositoryLabel.localeCompare(right.repositoryLabel, undefined, { sensitivity: "base" }) ||
      left.manifestPath.localeCompare(right.manifestPath, undefined, { sensitivity: "base" })
    );
  const importedCompanies = companies
    .flatMap((company) =>
      company.importedCompanies.map((importedCompany) => ({
        ...company,
        sourceCompanyId: company.id,
        importedCompany
      }))
    )
    .sort((left, right) =>
      left.importedCompany.name.localeCompare(right.importedCompany.name, undefined, {
        sensitivity: "base"
      }) ||
      left.name.localeCompare(right.name, undefined, { sensitivity: "base" }) ||
      left.repositoryLabel.localeCompare(right.repositoryLabel, undefined, { sensitivity: "base" }) ||
      left.importedCompany.id.localeCompare(right.importedCompany.id, undefined, {
        sensitivity: "base"
      })
    );

  return {
    repositories,
    companies,
    importedCompanies,
    summary: {
      repositoryCount: repositories.length,
      scannedRepositoryCount: repositories.filter((repository) => repository.lastScannedAt !== null).length,
      errorRepositoryCount: repositories.filter((repository) => repository.status === "error").length,
      companyCount: companies.length,
      importedCompanyCount: importedCompanies.length,
      updatedAt: state.updatedAt
    }
  };
}
