export const PLUGIN_ID = "paperclip-agent-companies-plugin";
export const PLUGIN_DISPLAY_NAME = "Agent Companies Plugin";
export const DEFAULT_REPOSITORY_URL = "https://github.com/paperclipai/companies";
export const CATALOG_STATE_KEY = "agent-companies.catalog.v1";
export const AGENT_COMPANIES_SCHEMA = "agentcompanies/v1";

export type RepositoryScanStatus = "idle" | "ready" | "error";

export interface DiscoveredAgentCompany {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  schema: string;
  version: string | null;
  relativePath: string;
  manifestPath: string;
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
}

export interface CatalogSnapshot {
  repositories: CatalogRepositorySummary[];
  companies: CatalogCompanySummary[];
  summary: {
    repositoryCount: number;
    scannedRepositoryCount: number;
    errorRepositoryCount: number;
    companyCount: number;
    updatedAt: string | null;
  };
}

const GIT_SSH_REPOSITORY_PATTERN = /^git@([^:]+):(.+)$/i;

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

export function normalizeRepositoryReference(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Repository URL or local path is required.");
  }

  if (GIT_SSH_REPOSITORY_PATTERN.test(trimmed)) {
    return normalizeSshRepository(trimmed);
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
    manifestPath
  };
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

  return {
    repositories: repositories.length > 0 || hadExplicitRepositories ? repositories : createDefaultCatalogState().repositories,
    updatedAt: asIsoTimestamp(value.updatedAt)
  };
}

export function buildCatalogSnapshot(state: CatalogState): CatalogSnapshot {
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
        repositoryIsDefault: repository.isDefault
      }))
    )
    .sort((left, right) =>
      left.name.localeCompare(right.name, undefined, { sensitivity: "base" }) ||
      left.repositoryLabel.localeCompare(right.repositoryLabel, undefined, { sensitivity: "base" }) ||
      left.manifestPath.localeCompare(right.manifestPath, undefined, { sensitivity: "base" })
    );

  return {
    repositories,
    companies,
    summary: {
      repositoryCount: repositories.length,
      scannedRepositoryCount: repositories.filter((repository) => repository.lastScannedAt !== null).length,
      errorRepositoryCount: repositories.filter((repository) => repository.status === "error").length,
      companyCount: companies.length,
      updatedAt: state.updatedAt
    }
  };
}
