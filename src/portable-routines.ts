import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { PortableCatalogFileEntry } from "./catalog.js";

const FRONTMATTER_PATTERN = /^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/u;
const PORTABLE_PAPERCLIP_EXTENSION_PATHS = [".paperclip.yaml", ".paperclip.yml"] as const;

export interface ImportedRecurringTaskDefinition {
  slug: string | null;
  title: string;
  description: string | null;
}

export interface ImportedRoutineTriggerDefinition {
  kind: "schedule" | "webhook" | "api";
  label: string | null;
  enabled: boolean;
  cronExpression: string | null;
  timezone: string | null;
  signingMode: string | null;
  replayWindowSec: number | null;
}

export interface ImportedRecurringTaskFileDefinition extends ImportedRecurringTaskDefinition {
  filePath: string;
  rootPath: string;
  routineStatus: string | null;
  routineTriggers: ImportedRoutineTriggerDefinition[] | null;
}

export interface ImportedRoutineTriggerSnapshot {
  id: string;
  kind: string | null;
  label: string | null;
  enabled: boolean | null;
  cronExpression: string | null;
  timezone: string | null;
  signingMode: string | null;
  replayWindowSec: number | null;
}

export interface ImportedRoutineSnapshot {
  id: string;
  title: string | null;
  description: string | null;
  status: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  triggers?: ImportedRoutineTriggerSnapshot[] | null;
}

export interface ImportedRoutineUpdatePlan {
  task: ImportedRecurringTaskFileDefinition;
  routine: ImportedRoutineSnapshot;
  patch: {
    title: string;
    description: string | null;
    status?: string;
  };
}

interface PortableRoutineMetadata {
  status: string | null;
  triggers: ImportedRoutineTriggerDefinition[] | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function getTopLevelScalar(frontmatter: string | null, key: string): string | null {
  if (!frontmatter) {
    return null;
  }

  const pattern = new RegExp(`^${key}:\\s*(.+)$`, "imu");
  const match = frontmatter.match(pattern);
  return match?.[1]?.trim() ?? null;
}

function parseYamlObject(content: string): Record<string, unknown> | null {
  try {
    const parsed = parseYaml(content);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function hasOnlyPaperclipSchema(value: Record<string, unknown>): boolean {
  const keys = Object.keys(value);
  return keys.length === 1 && keys[0] === "schema";
}

function normalizePaperclipSlug(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/gu, "-")
    .replace(/[^a-z0-9-]/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "");

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

function normalizeComparisonText(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/\r\n?/gu, "\n").trim();
  return normalized || null;
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

function normalizeImportedRoutineTriggerDefinition(
  value: unknown
): ImportedRoutineTriggerDefinition | null {
  if (!isRecord(value)) {
    return null;
  }

  const kind = asNonEmptyString(value.kind);
  const label = asNonEmptyString(value.label);
  const enabled = asBoolean(value.enabled) ?? true;

  if (kind === "schedule") {
    const cronExpression = asNonEmptyString(value.cronExpression);
    if (!cronExpression) {
      return null;
    }

    return {
      kind,
      label,
      enabled,
      cronExpression,
      timezone: asNonEmptyString(value.timezone) ?? "UTC",
      signingMode: null,
      replayWindowSec: null
    };
  }

  if (kind === "webhook") {
    return {
      kind,
      label,
      enabled,
      cronExpression: null,
      timezone: null,
      signingMode: asNonEmptyString(value.signingMode) ?? "bearer",
      replayWindowSec: asInteger(value.replayWindowSec) ?? 300
    };
  }

  if (kind === "api") {
    return {
      kind,
      label,
      enabled,
      cronExpression: null,
      timezone: null,
      signingMode: null,
      replayWindowSec: null
    };
  }

  return null;
}

function getPortableRoutineMetadata(
  files: Record<string, PortableCatalogFileEntry>
): Map<string, PortableRoutineMetadata> {
  const extensionPath = findPortablePaperclipExtensionPath(files);
  if (!extensionPath) {
    return new Map<string, PortableRoutineMetadata>();
  }

  const extension = files[extensionPath];
  if (typeof extension !== "string") {
    return new Map<string, PortableRoutineMetadata>();
  }

  const parsedExtension = parseYamlObject(extension);
  const routines = parsedExtension && isRecord(parsedExtension.routines) ? parsedExtension.routines : null;
  if (!routines) {
    return new Map<string, PortableRoutineMetadata>();
  }

  const metadata = new Map<string, PortableRoutineMetadata>();
  for (const [rawSlug, value] of Object.entries(routines)) {
    const slug = normalizePaperclipSlug(rawSlug);
    if (slug) {
      const record = isRecord(value) ? value : {};
      const rawTriggers = Array.isArray(record.triggers) ? record.triggers : null;
      const triggers = rawTriggers
        ? rawTriggers
            .map((trigger) => normalizeImportedRoutineTriggerDefinition(trigger))
            .filter((trigger): trigger is ImportedRoutineTriggerDefinition => trigger !== null)
        : null;

      metadata.set(slug, {
        status: asNonEmptyString(record.status),
        triggers
      });
    }
  }

  return metadata;
}

function getPortableRoutineSlugs(
  files: Record<string, PortableCatalogFileEntry>
): Set<string> {
  return new Set(getPortableRoutineMetadata(files).keys());
}

function isPortableTaskFilePath(filePath: string): boolean {
  if (!filePath.endsWith("/TASK.md") && filePath !== "TASK.md") {
    return false;
  }

  return filePath.startsWith("tasks/") || filePath.startsWith("projects/");
}

function getPortableTaskFallbackName(filePath: string): string {
  const segments = filePath.split("/").filter(Boolean);
  return segments.length >= 2 ? segments[segments.length - 2] ?? filePath : filePath;
}

function getPortableTaskSlug(
  filePath: string,
  parsedFrontmatter: Record<string, unknown> | null,
  rawFrontmatter: string | null
): string | null {
  return (
    normalizePaperclipSlug(parsedFrontmatter?.slug)
    ?? (rawFrontmatter ? normalizePaperclipSlug(getTopLevelScalar(rawFrontmatter, "slug")) : null)
    ?? normalizePaperclipSlug(getPortableTaskFallbackName(filePath))
  );
}

function getPortableTaskDescription(content: string): string | null {
  return normalizeComparisonText(content.replace(FRONTMATTER_PATTERN, ""));
}

function getPortableTaskRootPath(filePath: string): string {
  const segments = filePath.split("/").filter(Boolean);
  if (segments.length <= 1) {
    return filePath;
  }

  return segments.slice(0, -1).join("/");
}

export function extractPortableRecurringTaskFileDefinitions(
  files: Record<string, PortableCatalogFileEntry>
): ImportedRecurringTaskFileDefinition[] {
  const routineMetadata = getPortableRoutineMetadata(files);
  const routineSlugs = new Set(routineMetadata.keys());
  const definitionsByKey = new Map<string, ImportedRecurringTaskFileDefinition>();

  for (const [filePath, entry] of Object.entries(files)) {
    if (!isPortableTaskFilePath(filePath) || typeof entry !== "string") {
      continue;
    }

    const frontmatterMatch = entry.match(FRONTMATTER_PATTERN);
    const rawFrontmatter = frontmatterMatch?.[1] ?? null;
    const parsedFrontmatter = rawFrontmatter ? parseYamlObject(rawFrontmatter) : null;
    const slug = getPortableTaskSlug(filePath, parsedFrontmatter, rawFrontmatter);
    const recurring =
      isRecurringTaskFrontmatter(parsedFrontmatter, rawFrontmatter)
      || (slug !== null && routineSlugs.has(slug));
    if (!recurring) {
      continue;
    }

    const title =
      asNonEmptyString(parsedFrontmatter?.name)
      ?? asNonEmptyString(parsedFrontmatter?.title)
      ?? (rawFrontmatter ? asNonEmptyString(getTopLevelScalar(rawFrontmatter, "name")) : null)
      ?? (rawFrontmatter ? asNonEmptyString(getTopLevelScalar(rawFrontmatter, "title")) : null)
      ?? getPortableTaskFallbackName(filePath);
    const description = getPortableTaskDescription(entry);
    const key = `${normalizeComparisonText(title)}\u0000${description ?? ""}`;

    const metadata = slug ? routineMetadata.get(slug) : undefined;
    definitionsByKey.set(key, {
      slug,
      title,
      description,
      filePath,
      rootPath: getPortableTaskRootPath(filePath),
      routineStatus: metadata?.status ?? null,
      routineTriggers: metadata?.triggers ?? null
    });
  }

  return [...definitionsByKey.values()].sort((left, right) =>
    left.title.localeCompare(right.title, undefined, { sensitivity: "base" })
  );
}

export function extractPortableRecurringTaskDefinitions(
  files: Record<string, PortableCatalogFileEntry>
): ImportedRecurringTaskDefinition[] {
  return extractPortableRecurringTaskFileDefinitions(files).map((definition) => ({
    slug: definition.slug,
    title: definition.title,
    description: definition.description
  }));
}

function routineMatchesImportedTask(
  task: ImportedRecurringTaskDefinition,
  routine: ImportedRoutineSnapshot
): boolean {
  const taskTitle = normalizeComparisonText(task.title);
  const routineTitle = normalizeComparisonText(routine.title);
  if (!taskTitle || !routineTitle || taskTitle !== routineTitle) {
    return false;
  }

  const taskDescription = normalizeComparisonText(task.description);
  const routineDescription = normalizeComparisonText(routine.description);

  return taskDescription === routineDescription;
}

function compareRoutineRecency(
  left: ImportedRoutineSnapshot,
  right: ImportedRoutineSnapshot
): number {
  const leftTimestamp = left.updatedAt ?? left.createdAt ?? "";
  const rightTimestamp = right.updatedAt ?? right.createdAt ?? "";
  return (
    rightTimestamp.localeCompare(leftTimestamp) ||
    right.id.localeCompare(left.id, undefined, { sensitivity: "base" })
  );
}

export function findArchivableImportedRoutineIds(
  importedRecurringTasks: ImportedRecurringTaskDefinition[],
  routines: ImportedRoutineSnapshot[]
): string[] {
  const routineIds = new Set<string>();

  for (const task of importedRecurringTasks) {
    const matches = routines
      .filter((routine) => routine.status !== "archived" && routineMatchesImportedTask(task, routine))
      .sort(compareRoutineRecency);

    if (matches.length <= 1) {
      continue;
    }

    for (const routine of matches.slice(1)) {
      routineIds.add(routine.id);
    }
  }

  return [...routineIds].sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: "base" })
  );
}

export function findUpdatableImportedRoutinePlans(
  importedRecurringTasks: ImportedRecurringTaskFileDefinition[],
  routines: ImportedRoutineSnapshot[]
): ImportedRoutineUpdatePlan[] {
  const tasksByTitle = new Map<string, ImportedRecurringTaskFileDefinition[]>();
  for (const task of importedRecurringTasks) {
    const title = normalizeComparisonText(task.title);
    if (!title) {
      continue;
    }

    const tasks = tasksByTitle.get(title) ?? [];
    tasks.push(task);
    tasksByTitle.set(title, tasks);
  }

  const activeRoutinesByTitle = new Map<string, ImportedRoutineSnapshot[]>();
  for (const routine of routines) {
    if (routine.status === "archived") {
      continue;
    }

    const title = normalizeComparisonText(routine.title);
    if (!title) {
      continue;
    }

    const matchingRoutines = activeRoutinesByTitle.get(title) ?? [];
    matchingRoutines.push(routine);
    activeRoutinesByTitle.set(title, matchingRoutines);
  }

  const plans: ImportedRoutineUpdatePlan[] = [];
  const plannedRoutineIds = new Set<string>();

  for (const [title, tasks] of tasksByTitle) {
    if (tasks.length !== 1) {
      continue;
    }

    const matchingRoutines = activeRoutinesByTitle.get(title) ?? [];
    if (matchingRoutines.length !== 1) {
      continue;
    }

    const task = tasks[0];
    const routine = matchingRoutines[0];
    if (!task || !routine || plannedRoutineIds.has(routine.id)) {
      continue;
    }

    plannedRoutineIds.add(routine.id);
    plans.push({
      task,
      routine,
      patch: {
        title: task.title,
        description: task.description,
        ...(task.routineStatus ? { status: task.routineStatus } : {})
      }
    });
  }

  return plans.sort((left, right) =>
    left.task.title.localeCompare(right.task.title, undefined, { sensitivity: "base" })
  );
}

export function removePortableRecurringTaskImports(
  source: {
    type: "inline";
    files: Record<string, PortableCatalogFileEntry>;
  },
  tasks: ImportedRecurringTaskFileDefinition[]
): typeof source {
  if (tasks.length === 0) {
    return source;
  }

  const rootsToRemove = tasks.map((task) => task.rootPath);
  const slugsToRemove = new Set(
    tasks.map((task) => task.slug).filter((slug): slug is string => slug !== null)
  );
  const nextFiles = Object.fromEntries(
    Object.entries(source.files).filter(([filePath]) =>
      !rootsToRemove.some((root) => filePath === root || filePath.startsWith(`${root}/`))
    )
  );

  const extensionPath = findPortablePaperclipExtensionPath(nextFiles);
  if (!extensionPath || slugsToRemove.size === 0) {
    return {
      ...source,
      files: nextFiles
    };
  }

  const extension = nextFiles[extensionPath];
  const parsedExtension = typeof extension === "string" ? parseYamlObject(extension) : null;
  if (!parsedExtension || !isRecord(parsedExtension.routines)) {
    return {
      ...source,
      files: nextFiles
    };
  }

  const nextExtension: Record<string, unknown> = {
    ...parsedExtension
  };
  const nextRoutines = Object.fromEntries(
    Object.entries(parsedExtension.routines).filter(([rawSlug]) => {
      const slug = normalizePaperclipSlug(rawSlug);
      return slug === null || !slugsToRemove.has(slug);
    })
  );

  if (Object.keys(nextRoutines).length === 0) {
    delete nextExtension.routines;
  } else {
    nextExtension.routines = nextRoutines;
  }

  if (Object.keys(nextExtension).length === 0 || hasOnlyPaperclipSchema(nextExtension)) {
    delete nextFiles[extensionPath];
  } else {
    nextFiles[extensionPath] = `${stringifyYaml(nextExtension).trimEnd()}\n`;
  }

  return {
    ...source,
    files: nextFiles
  };
}
