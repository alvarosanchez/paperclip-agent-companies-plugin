import { parse as parseYaml } from "yaml";

const FRONTMATTER_PATTERN = /^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/u;

export type PortableRenameKind = "agent" | "project" | "issue" | "routine" | "skill";

export interface PortableItemIdentity {
  kind: PortableRenameKind;
  path: string;
  name: string;
  slug: string | null;
  sourceId: string | null;
}

export interface GitChangedPath {
  status: "added" | "deleted" | "modified" | "renamed";
  oldPath: string;
  newPath: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeSlug(value: string | null): string | null {
  if (!value) return null;
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/gu, "-")
    .replace(/[^a-z0-9-]/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "");
  return normalized || null;
}

function fallbackName(path: string): string {
  const segments = path.split("/").filter(Boolean);
  const directory = segments.at(-2) ?? path;
  return directory
    .split(/[-_\s]+/u)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function classifyPath(path: string, frontmatter: Record<string, unknown>): PortableRenameKind | null {
  const segments = path.split("/").filter(Boolean);
  const filename = segments.at(-1);
  if (segments[0] === "agents" && filename === "AGENTS.md") return "agent";
  if (segments[0] === "projects" && segments.length === 3 && filename === "PROJECT.md") return "project";
  if (segments[0] === "skills" && filename === "SKILL.md") return "skill";
  if (filename === "ISSUE.md") return "issue";
  if (filename === "TASK.md" && (segments[0] === "tasks" || segments[0] === "projects")) {
    const recurring = frontmatter.recurring === true
      || (typeof frontmatter.recurring === "string" && frontmatter.recurring.trim().toLowerCase() === "true")
      || (isRecord(frontmatter.schedule) && Boolean(asString(frontmatter.schedule.recurrence)));
    return recurring ? "routine" : "issue";
  }
  return null;
}

export function parsePortableItemIdentity(path: string, content: string): PortableItemIdentity | null {
  const match = content.match(FRONTMATTER_PATTERN);
  const parsed = match ? parseYaml(match[1] ?? "") : null;
  const frontmatter = isRecord(parsed) ? parsed : {};
  const kind = classifyPath(path, frontmatter);
  if (!kind) return null;
  const name = asString(frontmatter.name) ?? asString(frontmatter.title) ?? fallbackName(path);
  const metadata = isRecord(frontmatter.metadata) ? frontmatter.metadata : {};
  const agentCompanies = isRecord(metadata.agentCompanies) ? metadata.agentCompanies : {};
  const segments = path.split("/").filter(Boolean);
  const pathSlug = kind === "agent" || kind === "project"
    ? normalizeSlug(segments[1] ?? null)
    : normalizeSlug(segments.at(-2) ?? null);
  return {
    kind,
    path,
    name,
    slug: normalizeSlug(asString(frontmatter.slug)) ?? pathSlug,
    sourceId: asString(agentCompanies.sourceId) ?? asString(agentCompanies.id) ?? asString(frontmatter.sourceId)
  };
}

export function parseGitChangedPaths(output: string): GitChangedPath[] {
  const fields = output.split("\0").filter((field) => field.length > 0);
  const changes: GitChangedPath[] = [];
  for (let index = 0; index < fields.length;) {
    const status = fields[index++] ?? "";
    if (status.startsWith("R")) {
      const oldPath = fields[index++];
      const newPath = fields[index++];
      if (oldPath && newPath) changes.push({ status: "renamed", oldPath, newPath });
      continue;
    }
    const path = fields[index++];
    if (status === "M" && path) changes.push({ status: "modified", oldPath: path, newPath: path });
    if (status === "A" && path) changes.push({ status: "added", oldPath: path, newPath: path });
    if (status === "D" && path) changes.push({ status: "deleted", oldPath: path, newPath: path });
  }
  return changes;
}
