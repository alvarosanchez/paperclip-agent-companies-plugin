import { parse as parseYaml } from "yaml";
import type { PortableCatalogFileEntry } from "./catalog.js";

const FRONTMATTER_PATTERN = /^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/u;
const PORTABLE_PAPERCLIP_EXTENSION_PATHS = [".paperclip.yaml", ".paperclip.yml"] as const;

export interface ImportedRecurringTaskDefinition {
  slug: string | null;
  title: string;
  description: string | null;
}

export interface ImportedRoutineSnapshot {
  id: string;
  title: string | null;
  description: string | null;
  status: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
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

function getPortableRoutineSlugs(
  files: Record<string, PortableCatalogFileEntry>
): Set<string> {
  const extensionPath = findPortablePaperclipExtensionPath(files);
  if (!extensionPath) {
    return new Set<string>();
  }

  const extension = files[extensionPath];
  if (typeof extension !== "string") {
    return new Set<string>();
  }

  const parsedExtension = parseYamlObject(extension);
  const routines = parsedExtension && isRecord(parsedExtension.routines) ? parsedExtension.routines : null;
  if (!routines) {
    return new Set<string>();
  }

  const slugs = new Set<string>();
  for (const rawSlug of Object.keys(routines)) {
    const slug = normalizePaperclipSlug(rawSlug);
    if (slug) {
      slugs.add(slug);
    }
  }

  return slugs;
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

export function extractPortableRecurringTaskDefinitions(
  files: Record<string, PortableCatalogFileEntry>
): ImportedRecurringTaskDefinition[] {
  const routineSlugs = getPortableRoutineSlugs(files);
  const definitionsByKey = new Map<string, ImportedRecurringTaskDefinition>();

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

    definitionsByKey.set(key, {
      slug,
      title,
      description
    });
  }

  return [...definitionsByKey.values()].sort((left, right) =>
    left.title.localeCompare(right.title, undefined, { sensitivity: "base" })
  );
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
