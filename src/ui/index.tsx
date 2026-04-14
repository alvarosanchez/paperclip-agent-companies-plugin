import { useState, type FormEvent } from "react";
import {
  usePluginAction,
  usePluginData,
  type PluginSettingsPageProps
} from "@paperclipai/plugin-sdk/ui";
import {
  type CatalogCompanySummary,
  type CatalogRepositorySummary,
  type CatalogSnapshot
} from "../catalog.js";

const EMPTY_CATALOG: CatalogSnapshot = {
  repositories: [],
  companies: [],
  summary: {
    repositoryCount: 0,
    scannedRepositoryCount: 0,
    errorRepositoryCount: 0,
    companyCount: 0,
    updatedAt: null
  }
};

const PAGE_STYLES = `
.agent-companies-settings {
  color-scheme: light dark;
  --ac-bg: var(--background, oklch(0.145 0 0));
  --ac-surface: var(--card, oklch(0.205 0 0));
  --ac-surface-muted: color-mix(in oklab, var(--card, oklch(0.205 0 0)) 72%, var(--background, oklch(0.145 0 0)));
  --ac-surface-soft: color-mix(in oklab, var(--muted, oklch(0.269 0 0)) 78%, var(--background, oklch(0.145 0 0)));
  --ac-border: color-mix(in oklab, var(--border, oklch(0.269 0 0)) 92%, transparent);
  --ac-border-strong: color-mix(in oklab, var(--border, oklch(0.269 0 0)) 82%, var(--foreground, oklch(0.985 0 0)) 18%);
  --ac-text: var(--foreground, oklch(0.985 0 0));
  --ac-text-muted: var(--muted-foreground, oklch(0.708 0 0));
  --ac-info: var(--chart-2, oklch(0.696 0.17 162.48));
  --ac-info-soft: color-mix(in oklab, var(--ac-info) 16%, transparent);
  --ac-danger: var(--destructive, oklch(0.637 0.237 25.331));
  --ac-danger-soft: color-mix(in oklab, var(--ac-danger) 16%, transparent);
  --ac-primary: var(--primary, oklch(0.985 0 0));
  --ac-primary-fg: var(--primary-foreground, oklch(0.205 0 0));
  display: grid;
  gap: 12px;
  padding: 0 0 18px;
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: var(--ac-text);
}

.agent-companies-settings * {
  box-sizing: border-box;
}

.agent-companies-settings code {
  font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: 0.95em;
}

.agent-companies-settings__hero {
  display: grid;
  gap: 4px;
}

.agent-companies-settings__eyebrow {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ac-text-muted);
}

.agent-companies-settings__subtitle {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--ac-text-muted);
}

.agent-companies-settings__summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.agent-companies-settings__metric {
  display: grid;
  gap: 2px;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--ac-border);
  border-radius: 10px;
  background: var(--ac-surface);
}

.agent-companies-settings__metric-label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--ac-text-muted);
}

.agent-companies-settings__metric-value {
  display: block;
  font-size: 20px;
  line-height: 1.1;
  font-weight: 700;
}

.agent-companies-settings__metric-note {
  display: block;
  font-size: 11px;
  line-height: 1.35;
  color: var(--ac-text-muted);
}

.agent-companies-settings__layout {
  display: grid;
  gap: 12px;
}

.agent-companies-settings__panel {
  display: grid;
  gap: 12px;
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--ac-border);
  border-radius: 12px;
  background: var(--ac-surface);
}

.agent-companies-settings__panel-head {
  display: grid;
  gap: 10px;
}

.agent-companies-settings__panel-title {
  margin: 0;
  font-size: 16px;
  line-height: 1.2;
  font-weight: 600;
}

.agent-companies-settings__panel-copy {
  margin: 2px 0 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--ac-text-muted);
}

.agent-companies-settings__badge-row,
.agent-companies-settings__company-meta,
.agent-companies-settings__repo-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.agent-companies-settings__badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 100%;
  white-space: normal;
  overflow-wrap: anywhere;
  padding: 4px 8px;
  border-radius: 999px;
  border: 1px solid var(--ac-border);
  background: color-mix(in oklab, var(--ac-surface-soft) 88%, transparent);
  font-size: 11px;
  font-weight: 500;
  line-height: 1.2;
  color: var(--ac-text-muted);
}

.agent-companies-settings__badge--accent {
  border-color: color-mix(in oklab, var(--ac-info) 28%, var(--ac-border));
  background: var(--ac-info-soft);
  color: color-mix(in oklab, var(--ac-info) 78%, var(--ac-text));
}

.agent-companies-settings__badge--danger {
  border-color: color-mix(in oklab, var(--ac-danger) 24%, var(--ac-border));
  background: var(--ac-danger-soft);
  color: var(--ac-danger);
}

.agent-companies-settings__notice {
  padding: 9px 12px;
  border-radius: 10px;
  border: 1px solid var(--ac-border);
  background: var(--ac-surface-soft);
  font-size: 12px;
  line-height: 1.45;
  color: var(--ac-text-muted);
}

.agent-companies-settings__notice[data-tone="success"],
.agent-companies-settings__notice[data-tone="info"] {
  border-color: color-mix(in oklab, var(--ac-info) 24%, var(--ac-border));
  background: var(--ac-info-soft);
  color: color-mix(in oklab, var(--ac-info) 74%, var(--ac-text));
}

.agent-companies-settings__notice[data-tone="error"] {
  border-color: color-mix(in oklab, var(--ac-danger) 24%, var(--ac-border));
  background: var(--ac-danger-soft);
  color: var(--ac-danger);
}

.agent-companies-settings__toolbar {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 8px;
}

.agent-companies-settings__button {
  appearance: none;
  border: 1px solid var(--ac-border);
  border-radius: 8px;
  min-height: 34px;
  padding: 0 12px;
  background: var(--ac-surface-soft);
  color: var(--ac-text);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  transition:
    color 140ms ease,
    border-color 140ms ease,
    background 140ms ease;
}

.agent-companies-settings__button:hover:not(:disabled) {
  background: color-mix(in oklab, var(--ac-surface-soft) 72%, var(--ac-text) 6%);
  border-color: var(--ac-border-strong);
}

.agent-companies-settings__button:focus-visible,
.agent-companies-settings__input:focus-visible {
  outline: 2px solid color-mix(in oklab, var(--ring, var(--ac-primary)) 72%, transparent);
  outline-offset: 2px;
}

.agent-companies-settings__button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.agent-companies-settings__button--primary {
  border-color: transparent;
  background: var(--ac-primary);
  color: var(--ac-primary-fg);
}

.agent-companies-settings__button--danger {
  color: color-mix(in oklab, var(--ac-danger) 76%, var(--ac-text));
}

.agent-companies-settings__form {
  display: grid;
  gap: 8px;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
}

.agent-companies-settings__form label,
.agent-companies-settings__form .agent-companies-settings__notice {
  grid-column: 1 / -1;
}

.agent-companies-settings__input {
  width: 100%;
  border: 1px solid var(--ac-border);
  border-radius: 8px;
  min-height: 36px;
  padding: 0 12px;
  background: var(--ac-bg);
  color: var(--ac-text);
  font-size: 13px;
}

.agent-companies-settings__input::placeholder {
  color: var(--ac-text-muted);
}

.agent-companies-settings__repo-list,
.agent-companies-settings__company-groups {
  display: grid;
  gap: 8px;
}

.agent-companies-settings__repo-card,
.agent-companies-settings__company-group {
  display: grid;
  gap: 8px;
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--ac-border);
  border-radius: 10px;
  background: var(--ac-surface-muted);
}

.agent-companies-settings__company-group {
  padding: 0;
  overflow: hidden;
}

.agent-companies-settings__company-group-head {
  display: grid;
  gap: 6px;
  padding: 12px;
  border-bottom: 1px solid var(--ac-border);
}

.agent-companies-settings__company-group-title {
  margin: 0;
  font-size: 13px;
  line-height: 1.35;
  font-weight: 600;
}

.agent-companies-settings__company-list {
  display: grid;
  gap: 0;
}

.agent-companies-settings__company-card {
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 10px 12px;
  border-top: 1px solid var(--ac-border);
  background: transparent;
}

.agent-companies-settings__company-card:first-child {
  border-top: 0;
}

.agent-companies-settings__repo-top,
.agent-companies-settings__company-top {
  display: grid;
  gap: 6px;
}

.agent-companies-settings__company-top {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
}

.agent-companies-settings__repo-title,
.agent-companies-settings__company-title {
  margin: 0;
  font-size: 14px;
  line-height: 1.35;
  font-weight: 600;
}

.agent-companies-settings__repo-url,
.agent-companies-settings__company-path {
  margin-top: 2px;
  font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: 11px;
  line-height: 1.4;
  color: var(--ac-text-muted);
  word-break: break-word;
}

.agent-companies-settings__repo-actions {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-start;
}

.agent-companies-settings__repo-actions .agent-companies-settings__button {
  flex: 0 0 auto;
}

.agent-companies-settings__search-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.agent-companies-settings__search-row .agent-companies-settings__input {
  flex: 1 1 220px;
}

.agent-companies-settings__error {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid color-mix(in oklab, var(--ac-danger) 24%, var(--ac-border));
  border-radius: 8px;
  background: var(--ac-danger-soft);
  font-size: 12px;
  line-height: 1.5;
  color: var(--ac-danger);
}

.agent-companies-settings__empty {
  padding: 14px;
  border: 1px dashed var(--ac-border-strong);
  border-radius: 10px;
  background: color-mix(in oklab, var(--ac-surface-muted) 88%, transparent);
}

.agent-companies-settings__empty-title {
  margin: 0 0 4px;
  font-size: 14px;
  font-weight: 600;
}

.agent-companies-settings__empty-copy {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
  color: var(--ac-text-muted);
}

.agent-companies-settings__company-description {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--ac-text-muted);
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.agent-companies-settings__loading {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--ac-text-muted);
}

.agent-companies-settings__spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--ac-border);
  border-top-color: var(--ac-primary);
  border-radius: 50%;
  animation: agent-companies-spin 0.9s linear infinite;
}

.agent-companies-settings__external-link {
  color: inherit;
  text-decoration-color: color-mix(in oklab, var(--ac-text-muted) 60%, transparent);
  text-underline-offset: 2px;
}

.agent-companies-settings__external-link:hover {
  color: var(--ac-text);
}

@keyframes agent-companies-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 980px) {
  .agent-companies-settings__summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .agent-companies-settings__form {
    grid-template-columns: 1fr;
  }

  .agent-companies-settings__repo-actions {
    width: 100%;
    justify-content: flex-start;
  }
}

@media (max-width: 640px) {
  .agent-companies-settings__summary {
    grid-template-columns: 1fr;
  }

  .agent-companies-settings__company-top {
    grid-template-columns: 1fr;
  }
}
`;

type NoticeTone = "success" | "info" | "error";

interface NoticeState {
  tone: NoticeTone;
  text: string;
}

interface PendingActionState {
  kind: "adding" | "scanning-all" | "scanning-repository" | "removing";
  repositoryId?: string;
}

interface CatalogCompanyGroup {
  repository: CatalogRepositorySummary | null;
  companies: CatalogCompanySummary[];
}

function getErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }

  return "Something went wrong.";
}

function formatTimestamp(timestamp: string | null): string {
  if (!timestamp) {
    return "Not scanned yet";
  }

  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(timestamp));
  } catch {
    return timestamp;
  }
}

function getRepositoryStatusBadge(repository: CatalogRepositorySummary): {
  label: string;
  tone: "accent" | "danger" | "neutral";
} {
  if (repository.status === "error") {
    return {
      label: "Needs attention",
      tone: "danger"
    };
  }

  if (repository.lastScannedAt) {
    return {
      label: repository.companyCount > 0 ? "Ready" : "Scanned",
      tone: "accent"
    };
  }

  return {
    label: "Queued",
    tone: "neutral"
  };
}

function formatCompanyCount(count: number): string {
  return `${count} ${count === 1 ? "company" : "companies"}`;
}

function matchesCompanyQuery(company: CatalogCompanySummary, query: string): boolean {
  if (!query) {
    return true;
  }

  const normalizedQuery = query.toLowerCase();

  return [
    company.name,
    company.slug,
    company.description ?? "",
    company.relativePath,
    company.manifestPath,
    company.repositoryLabel
  ].some((value) => value.toLowerCase().includes(normalizedQuery));
}

function buildCompanyGroups(
  repositories: CatalogRepositorySummary[],
  companies: CatalogCompanySummary[]
): CatalogCompanyGroup[] {
  const repositoryById = new Map(repositories.map((repository) => [repository.id, repository]));
  const groupedCompanies = new Map<string, CatalogCompanySummary[]>();

  for (const company of companies) {
    const existingCompanies = groupedCompanies.get(company.repositoryId) ?? [];
    existingCompanies.push(company);
    groupedCompanies.set(company.repositoryId, existingCompanies);
  }

  return [...groupedCompanies.entries()]
    .map(([repositoryId, repositoryCompanies]) => ({
      repository: repositoryById.get(repositoryId) ?? null,
      companies: repositoryCompanies
    }))
    .sort((left, right) => {
      const leftLabel = left.repository?.label ?? left.companies[0]?.repositoryLabel ?? "";
      const rightLabel = right.repository?.label ?? right.companies[0]?.repositoryLabel ?? "";
      return leftLabel.localeCompare(rightLabel, undefined, { sensitivity: "base" });
    });
}

function isWebUrl(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
}

function renderRepositoryUrl(repository: CatalogRepositorySummary): React.JSX.Element {
  if (!isWebUrl(repository.url)) {
    return <span>{repository.url}</span>;
  }

  return (
    <a
      className="agent-companies-settings__external-link"
      href={repository.url}
      rel="noreferrer"
      target="_blank"
    >
      {repository.url}
    </a>
  );
}

function RepositoryCard(props: {
  repository: CatalogRepositorySummary;
  pendingAction: PendingActionState | null;
  onRemove(repositoryId: string): Promise<void>;
  onScan(repositoryId: string): Promise<void>;
}): React.JSX.Element {
  const { repository, pendingAction, onRemove, onScan } = props;
  const statusBadge = getRepositoryStatusBadge(repository);
  const isScanning =
    pendingAction?.kind === "scanning-repository" && pendingAction.repositoryId === repository.id;
  const isRemoving =
    pendingAction?.kind === "removing" && pendingAction.repositoryId === repository.id;

  return (
    <article className="agent-companies-settings__repo-card" data-testid="repo-card">
      <div className="agent-companies-settings__repo-top">
        <div>
          <h3 className="agent-companies-settings__repo-title">{repository.label}</h3>
          <div className="agent-companies-settings__repo-url">{renderRepositoryUrl(repository)}</div>
        </div>
      </div>
      <div className="agent-companies-settings__badge-row">
        <span
          className={[
            "agent-companies-settings__badge",
            statusBadge.tone === "accent" ? "agent-companies-settings__badge--accent" : "",
            statusBadge.tone === "danger" ? "agent-companies-settings__badge--danger" : ""
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {statusBadge.label}
        </span>
        {repository.isDefault ? (
          <span className="agent-companies-settings__badge">Preloaded default source</span>
        ) : null}
        <span className="agent-companies-settings__badge">
          {formatCompanyCount(repository.companyCount)}
        </span>
      </div>
      <div className="agent-companies-settings__repo-meta">
        <span className="agent-companies-settings__badge">
          Last checked: {formatTimestamp(repository.lastScannedAt)}
        </span>
      </div>
      <div className="agent-companies-settings__repo-actions">
        <button
          className="agent-companies-settings__button"
          disabled={Boolean(pendingAction)}
          onClick={() => void onScan(repository.id)}
          type="button"
        >
          {isScanning ? "Scanning..." : repository.lastScannedAt ? "Rescan" : "Scan"}
        </button>
        <button
          className="agent-companies-settings__button agent-companies-settings__button--danger"
          disabled={Boolean(pendingAction)}
          onClick={() => void onRemove(repository.id)}
          type="button"
        >
          {isRemoving ? "Removing..." : "Remove"}
        </button>
      </div>
      {repository.lastScanError ? (
        <p className="agent-companies-settings__error">{repository.lastScanError}</p>
      ) : null}
    </article>
  );
}

function CompanyCard({ company }: { company: CatalogCompanySummary }): React.JSX.Element {
  return (
    <article className="agent-companies-settings__company-card" data-testid="company-card">
      <div className="agent-companies-settings__company-top">
        <div>
          <h3 className="agent-companies-settings__company-title">{company.name}</h3>
          <div className="agent-companies-settings__company-path">Manifest: {company.manifestPath}</div>
        </div>
        {company.version ? (
          <div className="agent-companies-settings__badge-row">
            <span className="agent-companies-settings__badge">Version {company.version}</span>
          </div>
        ) : null}
      </div>
      {company.description ? (
        <p className="agent-companies-settings__company-description">{company.description}</p>
      ) : null}
    </article>
  );
}

function CompanyGroupCard({
  repository,
  companies
}: {
  repository: CatalogRepositorySummary | null;
  companies: CatalogCompanySummary[];
}): React.JSX.Element {
  const repositoryLabel = repository?.label ?? companies[0]?.repositoryLabel ?? "Unknown source";
  const repositoryUrl = repository?.url ?? companies[0]?.repositoryUrl ?? "";

  return (
    <section className="agent-companies-settings__company-group">
      <div className="agent-companies-settings__company-group-head">
        <div>
          <h3 className="agent-companies-settings__company-group-title">{repositoryLabel}</h3>
          <div className="agent-companies-settings__repo-url">
            {repositoryUrl ? (
              isWebUrl(repositoryUrl) ? (
                <a
                  className="agent-companies-settings__external-link"
                  href={repositoryUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  {repositoryUrl}
                </a>
              ) : (
                repositoryUrl
              )
            ) : null}
          </div>
        </div>
        <div className="agent-companies-settings__badge-row">
          <span className="agent-companies-settings__badge agent-companies-settings__badge--accent">
            {formatCompanyCount(companies.length)}
          </span>
          {repository?.isDefault ? (
            <span className="agent-companies-settings__badge">Default source</span>
          ) : null}
        </div>
      </div>

      <div className="agent-companies-settings__company-list">
        {companies.map((company) => (
          <CompanyCard company={company} key={company.id} />
        ))}
      </div>
    </section>
  );
}

export function AgentCompaniesSettingsPage({
  context
}: PluginSettingsPageProps): React.JSX.Element {
  const { data, error, loading, refresh } = usePluginData<CatalogSnapshot>("catalog.read", {
    companyId: context.companyId ?? ""
  });
  const addRepository = usePluginAction("catalog.add-repository");
  const removeRepository = usePluginAction("catalog.remove-repository");
  const scanRepository = usePluginAction("catalog.scan-repository");
  const scanAllRepositories = usePluginAction("catalog.scan-all-repositories");
  const catalog = data ?? EMPTY_CATALOG;
  const [repositoryInput, setRepositoryInput] = useState("");
  const [companyQuery, setCompanyQuery] = useState("");
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingActionState | null>(null);
  const visibleCompanies = catalog.companies.filter((company) =>
    matchesCompanyQuery(company, companyQuery.trim())
  );
  const companyGroups = buildCompanyGroups(catalog.repositories, visibleCompanies);

  async function refreshCatalog(noticeState: NoticeState | null = null): Promise<void> {
    if (noticeState) {
      setNotice(noticeState);
    }

    refresh();
  }

  async function handleAddRepository(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const nextInput = repositoryInput.trim();
    if (!nextInput) {
      setNotice({
        tone: "error",
        text: "Add a git repository URL or a local git checkout path first."
      });
      return;
    }

    setPendingAction({ kind: "adding" });
    setNotice(null);

    try {
      await addRepository({ url: nextInput });
      setRepositoryInput("");
      await refreshCatalog({
        tone: "info",
        text: "Repository saved and scanned. Use Rescan later when you want to pull updates."
      });
    } catch (actionError) {
      setNotice({
        tone: "error",
        text: getErrorMessage(actionError)
      });
    } finally {
      setPendingAction(null);
    }
  }

  async function handleRemoveRepository(repositoryId: string): Promise<void> {
    setPendingAction({
      kind: "removing",
      repositoryId
    });
    setNotice(null);

    try {
      await removeRepository({ repositoryId });
      await refreshCatalog({
        tone: "success",
        text: "Repository removed from the shared instance catalog."
      });
    } catch (actionError) {
      setNotice({
        tone: "error",
        text: getErrorMessage(actionError)
      });
    } finally {
      setPendingAction(null);
    }
  }

  async function handleScanRepository(repositoryId: string): Promise<void> {
    setPendingAction({
      kind: "scanning-repository",
      repositoryId
    });
    setNotice(null);

    try {
      await scanRepository({ repositoryId });
      await refreshCatalog({
        tone: "info",
        text: "Scan finished. Any source-specific issues stay attached to the repository card."
      });
    } catch (actionError) {
      setNotice({
        tone: "error",
        text: getErrorMessage(actionError)
      });
    } finally {
      setPendingAction(null);
    }
  }

  async function handleScanAllRepositories(): Promise<void> {
    setPendingAction({
      kind: "scanning-all"
    });
    setNotice(null);

    try {
      await scanAllRepositories();
      await refreshCatalog({
        tone: "info",
        text: "All repositories were rescanned. Check the company list and any inline repository errors below."
      });
    } catch (actionError) {
      setNotice({
        tone: "error",
        text: getErrorMessage(actionError)
      });
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <section className="agent-companies-settings" data-testid="catalog-page">
      <style>{PAGE_STYLES}</style>

      <header className="agent-companies-settings__hero">
        <span className="agent-companies-settings__eyebrow">Instance-Wide Discovery</span>
        <p className="agent-companies-settings__subtitle">
          Shared repository sources and discovered companies for this Paperclip instance.
        </p>
      </header>

      <div className="agent-companies-settings__summary">
        <div className="agent-companies-settings__metric">
          <span className="agent-companies-settings__metric-label">Repositories</span>
          <strong className="agent-companies-settings__metric-value">
            {catalog.summary.repositoryCount}
          </strong>
          <span className="agent-companies-settings__metric-note">
            Shared catalog
          </span>
        </div>
        <div className="agent-companies-settings__metric">
          <span className="agent-companies-settings__metric-label">Scanned Sources</span>
          <strong className="agent-companies-settings__metric-value">
            {catalog.summary.scannedRepositoryCount}
          </strong>
          <span className="agent-companies-settings__metric-note">
            Updated {formatTimestamp(catalog.summary.updatedAt)}
          </span>
        </div>
        <div className="agent-companies-settings__metric">
          <span className="agent-companies-settings__metric-label">Discovered Companies</span>
          <strong className="agent-companies-settings__metric-value">
            {catalog.summary.companyCount}
          </strong>
          <span className="agent-companies-settings__metric-note">
            Grouped below
          </span>
        </div>
        <div className="agent-companies-settings__metric">
          <span className="agent-companies-settings__metric-label">Repo Errors</span>
          <strong className="agent-companies-settings__metric-value">
            {catalog.summary.errorRepositoryCount}
          </strong>
          <span className="agent-companies-settings__metric-note">
            Inline on sources
          </span>
        </div>
      </div>

      {notice ? (
        <div
          aria-live="polite"
          className="agent-companies-settings__notice"
          data-tone={notice.tone}
        >
          {notice.text}
        </div>
      ) : null}

      {error && !loading ? (
        <div className="agent-companies-settings__notice" data-tone="error">
          Could not load the repository catalog: {error.message}
        </div>
      ) : null}

      <div className="agent-companies-settings__layout">
        <section className="agent-companies-settings__panel">
          <div className="agent-companies-settings__panel-head">
            <div>
              <h2 className="agent-companies-settings__panel-title">Repository Sources</h2>
              <p className="agent-companies-settings__panel-copy">
                Paperclip keeps this catalog across restarts. Use Scan or Scan all when you want to pull updates.
              </p>
            </div>
            <div className="agent-companies-settings__toolbar">
              <button
                className="agent-companies-settings__button"
                disabled={pendingAction !== null || catalog.repositories.length === 0}
                onClick={() => void handleScanAllRepositories()}
                type="button"
              >
                {pendingAction?.kind === "scanning-all" ? "Scanning all..." : "Scan all"}
              </button>
            </div>
          </div>

          <form className="agent-companies-settings__form" onSubmit={(event) => void handleAddRepository(event)}>
            <label htmlFor="agent-companies-repository-input">
              <span className="agent-companies-settings__metric-label">Add another repository</span>
            </label>
            <input
              className="agent-companies-settings__input"
              disabled={pendingAction !== null}
              id="agent-companies-repository-input"
              onChange={(event) => setRepositoryInput(event.target.value)}
              placeholder="https://github.com/owner/repo or /path/to/repo"
              type="text"
              value={repositoryInput}
            />
            <button
              className="agent-companies-settings__button agent-companies-settings__button--primary"
              disabled={pendingAction !== null}
              type="submit"
            >
              {pendingAction?.kind === "adding" ? "Adding..." : "Add repository"}
            </button>
          </form>

          {loading && !data ? (
            <div className="agent-companies-settings__loading">
              <span className="agent-companies-settings__spinner" />
              Loading the repository catalog.
            </div>
          ) : null}

          <div className="agent-companies-settings__repo-list">
            {catalog.repositories.map((repository) => (
              <RepositoryCard
                key={repository.id}
                onRemove={handleRemoveRepository}
                onScan={handleScanRepository}
                pendingAction={pendingAction}
                repository={repository}
              />
            ))}
          </div>

          {catalog.repositories.length === 0 ? (
            <div className="agent-companies-settings__empty">
              <h3 className="agent-companies-settings__empty-title">No sources yet</h3>
              <p className="agent-companies-settings__empty-copy">
                Add a repo above whenever you want to discover more Agent Companies packages.
              </p>
            </div>
          ) : null}
        </section>

        <section className="agent-companies-settings__panel">
          <div className="agent-companies-settings__panel-head">
            <div>
              <h2 className="agent-companies-settings__panel-title">Discovered Companies</h2>
              <p className="agent-companies-settings__panel-copy">
                Grouped by source and trimmed for quick scanning in the Paperclip settings host.
              </p>
            </div>
            <div className="agent-companies-settings__badge-row">
              <span className="agent-companies-settings__badge agent-companies-settings__badge--accent">
                {visibleCompanies.length} shown
              </span>
            </div>
          </div>

          <div className="agent-companies-settings__search-row">
            <input
              aria-label="Filter discovered companies"
              className="agent-companies-settings__input"
              onChange={(event) => setCompanyQuery(event.target.value)}
              placeholder="Filter by company, source, or path"
              type="text"
              value={companyQuery}
            />
            {companyQuery.trim() ? (
              <button
                className="agent-companies-settings__button"
                onClick={() => setCompanyQuery("")}
                type="button"
              >
                Clear
              </button>
            ) : null}
          </div>

          {catalog.companies.length > 0 && companyGroups.length > 0 ? (
            <div className="agent-companies-settings__company-groups">
              {companyGroups.map((group) => (
                <CompanyGroupCard
                  companies={group.companies}
                  key={group.repository?.id ?? group.companies[0]?.repositoryId ?? "unknown-repo"}
                  repository={group.repository}
                />
              ))}
            </div>
          ) : catalog.companies.length === 0 ? (
            <div className="agent-companies-settings__empty">
              <h3 className="agent-companies-settings__empty-title">Nothing discovered yet</h3>
              <p className="agent-companies-settings__empty-copy">
                Add or rescan a source to populate this catalog.
              </p>
            </div>
          ) : (
            <div className="agent-companies-settings__empty">
              <h3 className="agent-companies-settings__empty-title">No matching companies</h3>
              <p className="agent-companies-settings__empty-copy">
                Try a different filter or clear the search input.
              </p>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
