import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export const PLUGIN_ID = "paperclip-agent-companies-plugin";
export const PLUGIN_DISPLAY_NAME = "Agent Companies Plugin";
export const DEFAULT_REPOSITORY_URL = "https://github.com/paperclipai/companies";
export const CATALOG_STATE_KEY = "agent-companies.catalog.v1";
export const AGENT_COMPANIES_SCHEMA = "agentcompanies/v1";
export const COMPANY_CONTENT_KEYS = ["agents", "projects", "tasks", "issues", "skills"] as const;
export const DEFAULT_AUTO_SYNC_ENABLED = true;
export const DEFAULT_AUTO_SYNC_CADENCE_HOURS = 24;
export const MIN_AUTO_SYNC_CADENCE_HOURS = 1;
export const DEFAULT_SYNC_COLLISION_STRATEGY = "replace" as const;

export type CompanyContentKey = (typeof COMPANY_CONTENT_KEYS)[number];
export type CompanyImportSelectionMode = "all" | "selected" | "none";
export type CatalogSyncCollisionStrategy = "rename" | "skip" | "replace";
export type CatalogCompanySyncStatus = "idle" | "running" | "succeeded" | "failed";
export type CatalogSourceVersionComparison =
  | "missing_latest"
  | "missing_imported"
  | "same"
  | "latest_newer"
  | "latest_older"
  | "different_unknown";

export type RepositoryScanStatus = "idle" | "ready" | "error";

export interface CompanyContentItem {
  name: string;
  path: string;
  dependencyPaths?: string[];
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

export type CompanyContentSectionId = "agents" | "projects" | "tasks" | "skills";

export interface CompanyContentSectionDefinition {
  id: CompanyContentSectionId;
  label: string;
  singular: string;
  plural: string;
  contentKeys: CompanyContentKey[];
}

export interface CompanyContentSectionItem {
  kind: CompanyContentKey;
  item: CompanyContentItem;
}

export type CompanyContentRequirementLookup = Map<string, CompanyContentSectionItem[]>;

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

export interface AdapterPreset {
  id: string;
  name: string;
  adapterType: string;
  adapterConfig: Record<string, unknown>;
  updatedAt: string | null;
}

export interface ImportAdapterPresetSelection {
  defaultPresetId: string | null;
  agentPresetIds: Record<string, string | null>;
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
  selection: CompanyImportSelection;
  adapterPresetSelection: ImportAdapterPresetSelection;
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
  selection: CompanyImportSelection;
  adapterPresetSelection: ImportAdapterPresetSelection;
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
  adapterPresets: AdapterPreset[];
  autoSyncCadenceHours: number;
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

export type CatalogImportedCompanySummary = Omit<
  CatalogCompanySummary,
  "id" | "importedCompanies"
> & {
  id: string;
  sourceCompanyId: string;
  importedCompany: CatalogCompanyImportStatus;
};

export interface CatalogSnapshot {
  autoSyncCadenceHours: number;
  adapterPresets: AdapterPreset[];
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
const PORTABLE_PAPERCLIP_EXTENSION_PATHS = [".paperclip.yaml", ".paperclip.yml"] as const;

export type PaperclipImportStage = "pre_issues" | "issues";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function findPortablePaperclipExtensionPath(
  files: Record<string, PortableCatalogFileEntry>
): string | null {
  for (const filePath of PORTABLE_PAPERCLIP_EXTENSION_PATHS) {
    if (Object.prototype.hasOwnProperty.call(files, filePath)) {
      return filePath;
    }
  }

  return null;
}

export function buildStagedPaperclipImportSource(
  source: CatalogPreparedCompanyImport["source"],
  stage: PaperclipImportStage
): CatalogPreparedCompanyImport["source"] {
  const extensionPath = findPortablePaperclipExtensionPath(source.files);
  if (!extensionPath) {
    return source;
  }

  const extension = source.files[extensionPath];
  if (typeof extension !== "string") {
    return source;
  }

  let parsedExtension: unknown;
  try {
    parsedExtension = parseYaml(extension);
  } catch {
    return source;
  }

  if (!isRecord(parsedExtension)) {
    return source;
  }

  const nextExtension: Record<string, unknown> = {
    ...parsedExtension
  };
  let didChange = false;

  if (stage === "pre_issues" && Object.prototype.hasOwnProperty.call(nextExtension, "routines")) {
    delete nextExtension.routines;
    didChange = true;
  }

  if (stage === "issues" && Object.prototype.hasOwnProperty.call(nextExtension, "agents")) {
    delete nextExtension.agents;
    didChange = true;
  }

  if (!didChange) {
    return source;
  }

  const nextFiles = {
    ...source.files
  };

  if (Object.keys(nextExtension).length === 0) {
    delete nextFiles[extensionPath];
  } else {
    nextFiles[extensionPath] = `${stringifyYaml(nextExtension).trimEnd()}\n`;
  }

  return {
    ...source,
    files: nextFiles
  };
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

export function normalizeCatalogAutoSyncCadenceHours(value: unknown): number {
  const candidate =
    typeof value === "string" && value.trim()
      ? Number(value)
      : typeof value === "number"
        ? value
        : NaN;

  return Number.isInteger(candidate) && candidate >= MIN_AUTO_SYNC_CADENCE_HOURS
    ? candidate
    : DEFAULT_AUTO_SYNC_CADENCE_HOURS;
}

function normalizeCatalogSyncCollisionStrategy(value: unknown): CatalogSyncCollisionStrategy {
  return value === "rename" || value === "skip" ? value : DEFAULT_SYNC_COLLISION_STRATEGY;
}

function normalizeCatalogCompanySyncStatus(value: unknown): CatalogCompanySyncStatus {
  return value === "running" || value === "succeeded" || value === "failed" ? value : "idle";
}

export function createDefaultCompanyImportSelection(): CompanyImportSelection {
  return {
    agents: { mode: "all" },
    projects: { mode: "all" },
    tasks: { mode: "all" },
    issues: { mode: "all" },
    skills: { mode: "all" }
  };
}

function normalizeCompanyImportPartSelection(value: unknown): CompanyImportPartSelection {
  if (!isRecord(value)) {
    return { mode: "all" };
  }

  const mode =
    value.mode === "selected" || value.mode === "none"
      ? value.mode
      : "all";
  const itemPaths = Array.isArray(value.itemPaths)
    ? [...new Set(
        value.itemPaths
          .map((itemPath) =>
            typeof itemPath === "string" ? normalizeCompanyContentPath(itemPath) : null
          )
          .filter((itemPath): itemPath is string => itemPath !== null)
      )].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }))
    : [];

  if (mode === "selected") {
    return itemPaths.length > 0
      ? {
          mode,
          itemPaths
        }
      : { mode: "none" };
  }

  return {
    mode
  };
}

export function normalizeCompanyImportSelection(value: unknown): CompanyImportSelection {
  if (!isRecord(value)) {
    return createDefaultCompanyImportSelection();
  }

  const selection = createDefaultCompanyImportSelection();

  for (const key of COMPANY_CONTENT_KEYS) {
    selection[key] = normalizeCompanyImportPartSelection(value[key]);
  }

  return selection;
}

function normalizeAdapterPresetId(value: unknown): string | null {
  return typeof value === "string" && /^[a-z0-9][a-z0-9._-]{0,63}$/iu.test(value.trim())
    ? value.trim()
    : null;
}

function normalizeAdapterConfig(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function normalizeAdapterPreset(value: unknown): AdapterPreset | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = normalizeAdapterPresetId(value.id);
  const name = asNonEmptyString(value.name);
  const adapterType = asNonEmptyString(value.adapterType);

  if (!id || !name || !adapterType) {
    return null;
  }

  return {
    id,
    name,
    adapterType,
    adapterConfig: normalizeAdapterConfig(value.adapterConfig),
    updatedAt: asIsoTimestamp(value.updatedAt)
  };
}

export function normalizeAdapterPresets(value: unknown): AdapterPreset[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const presets = new Map<string, AdapterPreset>();
  for (const rawPreset of value) {
    const preset = normalizeAdapterPreset(rawPreset);
    if (preset) {
      presets.set(preset.id, preset);
    }
  }

  return [...presets.values()].sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { sensitivity: "base" }) ||
    left.id.localeCompare(right.id, undefined, { sensitivity: "base" })
  );
}

export function normalizeImportAdapterPresetSelection(value: unknown): ImportAdapterPresetSelection {
  if (!isRecord(value)) {
    return {
      defaultPresetId: null,
      agentPresetIds: {}
    };
  }

  const agentPresetIds: Record<string, string | null> = {};
  const rawAgentPresetIds = isRecord(value.agentPresetIds) ? value.agentPresetIds : {};

  for (const [rawSlug, rawPresetId] of Object.entries(rawAgentPresetIds)) {
    const slug = normalizeAdapterPresetId(rawSlug);
    if (!slug) {
      continue;
    }

    agentPresetIds[slug] = rawPresetId === null ? null : normalizeAdapterPresetId(rawPresetId);
  }

  return {
    defaultPresetId: value.defaultPresetId === null ? null : normalizeAdapterPresetId(value.defaultPresetId),
    agentPresetIds
  };
}

export function isCompanyImportSelectionEmpty(selection: CompanyImportSelection): boolean {
  return COMPANY_CONTENT_KEYS.every((key) => selection[key].mode === "none");
}

export function normalizeSelectionPartForCompanyItems(
  items: CompanyContentItem[],
  selection: CompanyImportPartSelection
): CompanyImportPartSelection {
  if (items.length === 0) {
    return { mode: "none" };
  }

  if (selection.mode === "all") {
    return { mode: "all" };
  }

  if (selection.mode === "none") {
    return { mode: "none" };
  }

  const itemPaths = [...new Set(
    selection.itemPaths?.filter((itemPath) => items.some((item) => item.path === itemPath)) ?? []
  )].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));

  if (itemPaths.length === 0) {
    return { mode: "none" };
  }

  return {
    mode: "selected",
    itemPaths
  };
}

function getSelectedCompanyContentItemPaths(
  items: CompanyContentItem[],
  selection: CompanyImportPartSelection
): string[] {
  if (selection.mode === "all") {
    return items.map((item) => item.path);
  }

  if (selection.mode === "selected") {
    return selection.itemPaths?.filter((itemPath) => items.some((item) => item.path === itemPath)) ?? [];
  }

  return [];
}

function isCompanyContentItemSelected(
  selection: CompanyImportPartSelection,
  itemPath: string
): boolean {
  if (selection.mode === "all") {
    return true;
  }

  if (selection.mode !== "selected") {
    return false;
  }

  return selection.itemPaths?.includes(itemPath) ?? false;
}

export function expandCompanyImportSelectionDependencies(
  contents: CompanyContents,
  selection: CompanyImportSelection
): CompanyImportSelection {
  const itemsByPath = new Map<string, CompanyContentSectionItem>();
  const selectedPathsByKind = new Map<CompanyContentKey, Set<string>>();

  for (const key of COMPANY_CONTENT_KEYS) {
    const items = contents[key];
    selectedPathsByKind.set(
      key,
      new Set(getSelectedCompanyContentItemPaths(items, selection[key]))
    );

    for (const item of items) {
      itemsByPath.set(item.path, {
        kind: key,
        item
      });
    }
  }

  const pendingPaths = [...new Set(
    COMPANY_CONTENT_KEYS.flatMap((key) => [...(selectedPathsByKind.get(key) ?? new Set<string>())])
  )];
  const visitedPaths = new Set<string>();

  while (pendingPaths.length > 0) {
    const currentPath = pendingPaths.pop();
    if (!currentPath || visitedPaths.has(currentPath)) {
      continue;
    }

    visitedPaths.add(currentPath);
    const currentItem = itemsByPath.get(currentPath);
    if (!currentItem) {
      continue;
    }

    for (const dependencyPath of currentItem.item.dependencyPaths ?? []) {
      const dependency = itemsByPath.get(dependencyPath);
      if (!dependency) {
        continue;
      }

      const selectedDependencyPaths = selectedPathsByKind.get(dependency.kind);
      if (selectedDependencyPaths?.has(dependencyPath)) {
        continue;
      }

      selectedDependencyPaths?.add(dependencyPath);
      pendingPaths.push(dependencyPath);
    }
  }

  const nextSelection = createDefaultCompanyImportSelection();

  for (const key of COMPANY_CONTENT_KEYS) {
    const selectedItemPaths = [...(selectedPathsByKind.get(key) ?? new Set<string>())].sort(
      (left, right) => left.localeCompare(right, undefined, { sensitivity: "base" })
    );

    if (selectedItemPaths.length === 0) {
      nextSelection[key] = { mode: "none" };
      continue;
    }

    if (selection[key].mode === "all" && selectedItemPaths.length === contents[key].length) {
      nextSelection[key] = { mode: "all" };
      continue;
    }

    nextSelection[key] = {
      mode: "selected",
      itemPaths: selectedItemPaths
    };
  }

  return nextSelection;
}

export function resolveCompanyImportSelection(
  contents: CompanyContents,
  value: unknown
): CompanyImportSelection {
  const normalizedSelection = normalizeCompanyImportSelection(value);
  const nextSelection = createDefaultCompanyImportSelection();

  for (const key of COMPANY_CONTENT_KEYS) {
    nextSelection[key] = normalizeSelectionPartForCompanyItems(contents[key], normalizedSelection[key]);
  }

  return expandCompanyImportSelectionDependencies(contents, nextSelection);
}

export const COMPANY_CONTENT_SECTION_DEFINITIONS: readonly CompanyContentSectionDefinition[] = [
  {
    id: "agents",
    label: "Agents",
    singular: "agent",
    plural: "agents",
    contentKeys: ["agents"]
  },
  {
    id: "projects",
    label: "Projects",
    singular: "project",
    plural: "projects",
    contentKeys: ["projects"]
  },
  {
    id: "tasks",
    label: "Tasks",
    singular: "task",
    plural: "tasks",
    contentKeys: ["tasks", "issues"]
  },
  {
    id: "skills",
    label: "Skills",
    singular: "skill",
    plural: "skills",
    contentKeys: ["skills"]
  }
] as const;

export function getCompanyContentSectionForKey(
  key: CompanyContentKey
): CompanyContentSectionDefinition {
  return (
    COMPANY_CONTENT_SECTION_DEFINITIONS.find((section) => section.contentKeys.includes(key))
    ?? COMPANY_CONTENT_SECTION_DEFINITIONS[0]
  );
}

export function getCompanyContentSectionItemCount(
  contents: CompanyContents,
  section: CompanyContentSectionDefinition
): number {
  return section.contentKeys.reduce((count, key) => count + contents[key].length, 0);
}

export function listCompanyContentSectionItems(
  contents: CompanyContents,
  section: CompanyContentSectionDefinition
): CompanyContentSectionItem[] {
  return section.contentKeys
    .flatMap((key) =>
      contents[key].map((item) => ({
        kind: key,
        item
      }))
    )
    .sort(
      (left, right) =>
        left.item.path.localeCompare(right.item.path, undefined, { sensitivity: "base" })
        || left.item.name.localeCompare(right.item.name, undefined, { sensitivity: "base" })
    );
}

export function getVisibleCompanyContentSections(
  contents: CompanyContents
): CompanyContentSectionDefinition[] {
  return COMPANY_CONTENT_SECTION_DEFINITIONS.filter(
    (section) => getCompanyContentSectionItemCount(contents, section) > 0
  );
}

export function getCompanyContentItemRequirementLookup(
  contents: CompanyContents,
  selection: CompanyImportSelection
): CompanyContentRequirementLookup {
  const resolvedSelection = resolveCompanyImportSelection(contents, selection);
  const selectedEntries: CompanyContentSectionItem[] = [];
  const itemsByPath = new Map<string, CompanyContentSectionItem>();

  for (const key of COMPANY_CONTENT_KEYS) {
    for (const item of contents[key]) {
      const entry = {
        kind: key,
        item
      };

      itemsByPath.set(item.path, entry);
      if (isCompanyContentItemSelected(resolvedSelection[key], item.path)) {
        selectedEntries.push(entry);
      }
    }
  }

  const selectedPaths = new Set(selectedEntries.map((entry) => entry.item.path));
  const requirementSourcesByPath: CompanyContentRequirementLookup = new Map();

  for (const entry of selectedEntries) {
    const visitedDependencyPaths = new Set<string>();
    const pendingDependencyPaths = [...(entry.item.dependencyPaths ?? [])];

    while (pendingDependencyPaths.length > 0) {
      const dependencyPath = pendingDependencyPaths.pop();
      if (
        !dependencyPath
        || visitedDependencyPaths.has(dependencyPath)
        || !selectedPaths.has(dependencyPath)
      ) {
        continue;
      }

      visitedDependencyPaths.add(dependencyPath);

      const existingSources = requirementSourcesByPath.get(dependencyPath);
      if (existingSources) {
        existingSources.push(entry);
      } else {
        requirementSourcesByPath.set(dependencyPath, [entry]);
      }

      const dependencyEntry = itemsByPath.get(dependencyPath);
      if (dependencyEntry?.item.dependencyPaths?.length) {
        pendingDependencyPaths.push(...dependencyEntry.item.dependencyPaths);
      }
    }
  }

  for (const sources of requirementSourcesByPath.values()) {
    sources.sort(
      (left, right) =>
        left.item.name.localeCompare(right.item.name, undefined, { sensitivity: "base" })
        || left.item.path.localeCompare(right.item.path, undefined, { sensitivity: "base" })
    );
  }

  return requirementSourcesByPath;
}

export function getCompanyContentItemRequirementSources(
  contents: CompanyContents,
  selection: CompanyImportSelection,
  itemPath: string
): CompanyContentSectionItem[] {
  return getCompanyContentItemRequirementLookup(contents, selection).get(itemPath) ?? [];
}

export function isCompanyContentItemRequiredBySelection(
  contents: CompanyContents,
  selection: CompanyImportSelection,
  kind: CompanyContentKey,
  itemPath: string
): boolean {
  const resolvedSelection = resolveCompanyImportSelection(contents, selection);
  if (!isCompanyContentItemSelected(resolvedSelection[kind], itemPath)) {
    return false;
  }

  return (getCompanyContentItemRequirementLookup(contents, resolvedSelection).get(itemPath)?.length ?? 0) > 0;
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

export function compareCatalogSourceVersions(
  importedSourceVersion: string | null,
  latestSourceVersion: string | null
): CatalogSourceVersionComparison {
  const importedVersion = asNonEmptyString(importedSourceVersion);
  const latestVersion = asNonEmptyString(latestSourceVersion);

  if (!latestVersion) {
    return "missing_latest";
  }

  if (!importedVersion) {
    return "missing_imported";
  }

  if (normalizeComparableVersion(importedVersion) === normalizeComparableVersion(latestVersion)) {
    return "same";
  }

  const parsedImportedVersion = parseComparableVersion(importedVersion);
  const parsedLatestVersion = parseComparableVersion(latestVersion);
  if (!parsedImportedVersion || !parsedLatestVersion) {
    return "different_unknown";
  }

  if (parsedLatestVersion.major !== parsedImportedVersion.major) {
    return parsedLatestVersion.major > parsedImportedVersion.major
      ? "latest_newer"
      : "latest_older";
  }

  if (parsedLatestVersion.minor !== parsedImportedVersion.minor) {
    return parsedLatestVersion.minor > parsedImportedVersion.minor
      ? "latest_newer"
      : "latest_older";
  }

  if (parsedLatestVersion.patch !== parsedImportedVersion.patch) {
    return parsedLatestVersion.patch > parsedImportedVersion.patch
      ? "latest_newer"
      : "latest_older";
  }

  if (parsedImportedVersion.prerelease === parsedLatestVersion.prerelease) {
    return "same";
  }

  if (parsedImportedVersion.prerelease && !parsedLatestVersion.prerelease) {
    return "latest_newer";
  }

  if (!parsedImportedVersion.prerelease && parsedLatestVersion.prerelease) {
    return "latest_older";
  }

  return "different_unknown";
}

export function isCatalogCompanySyncAvailable(
  importedSourceVersion: string | null,
  latestSourceVersion: string | null
): boolean {
  const comparison = compareCatalogSourceVersions(importedSourceVersion, latestSourceVersion);
  return comparison === "missing_latest"
    || comparison === "missing_imported"
    || comparison === "latest_newer"
    || comparison === "different_unknown";
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
  >,
  cadenceHours = DEFAULT_AUTO_SYNC_CADENCE_HOURS
): string | null {
  if (!record.autoSyncEnabled) {
    return null;
  }

  const referenceTimestamp = getCatalogCompanyAutoSyncReferenceAt(record);
  if (!referenceTimestamp) {
    return null;
  }

  return addMillisecondsToIso(
    referenceTimestamp,
    normalizeCatalogAutoSyncCadenceHours(cadenceHours) * 60 * 60 * 1000
  );
}

export function isCatalogCompanyAutoSyncDue(
  record: Pick<
    ImportedCatalogCompanyRecord,
    "autoSyncEnabled" | "lastSyncAttemptAt" | "lastSyncedAt" | "importedAt" | "lastSyncStatus"
  >,
  now: string,
  cadenceHours = DEFAULT_AUTO_SYNC_CADENCE_HOURS
): boolean {
  if (!record.autoSyncEnabled || record.lastSyncStatus === "running") {
    return false;
  }

  const nextAutoSyncAt = getCatalogCompanyNextAutoSyncAt(record, cadenceHours);
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
  const dependencyPaths = [...new Set(
    (Array.isArray(value.dependencyPaths) ? value.dependencyPaths : [])
      .map((dependencyPath) =>
        typeof dependencyPath === "string" ? normalizeCompanyContentPath(dependencyPath) : null
      )
      .filter((dependencyPath): dependencyPath is string => Boolean(dependencyPath))
      .filter((dependencyPath) => dependencyPath !== path)
  )].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));

  return {
    name: asNonEmptyString(value.name) ?? deriveCompanyContentName(path),
    path,
    ...(dependencyPaths.length > 0 ? { dependencyPaths } : {}),
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
    selection: normalizeCompanyImportSelection(value.selection),
    adapterPresetSelection: normalizeImportAdapterPresetSelection(value.adapterPresetSelection),
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
    adapterPresets: [],
    autoSyncCadenceHours: DEFAULT_AUTO_SYNC_CADENCE_HOURS,
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
    repositories:
      repositories.length > 0 || hadExplicitRepositories
        ? repositories
        : createDefaultCatalogState().repositories,
    importedCompanies: [...importedCompanies.values()],
    adapterPresets: normalizeAdapterPresets(value.adapterPresets),
    autoSyncCadenceHours: normalizeCatalogAutoSyncCadenceHours(
      value.autoSyncCadenceHours ?? value.syncCadenceHours ?? value.autoSyncIntervalHours
    ),
    updatedAt: asIsoTimestamp(value.updatedAt)
  };
}

export function buildCatalogSnapshot(state: CatalogState, now: string | null = null): CatalogSnapshot {
  const autoSyncCadenceHours = normalizeCatalogAutoSyncCadenceHours(state.autoSyncCadenceHours);
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
              selection: importedCompany.selection,
              adapterPresetSelection: importedCompany.adapterPresetSelection,
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
                now && isSyncAvailable
                  ? isCatalogCompanyAutoSyncDue(importedCompany, now, autoSyncCadenceHours)
                  : false,
              nextAutoSyncAt:
                importedCompany.autoSyncEnabled
                  ? getCatalogCompanyNextAutoSyncAt(importedCompany, autoSyncCadenceHours)
                  : null
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
    .flatMap((company) => {
      const {
        id: sourceCompanyId,
        importedCompanies: importedCompanyStatuses,
        ...sourceCompany
      } = company;

      return importedCompanyStatuses.map((importedCompany) => ({
        ...sourceCompany,
        id: importedCompany.id,
        sourceCompanyId,
        importedCompany
      }));
    })
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
    autoSyncCadenceHours,
    adapterPresets: state.adapterPresets,
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
