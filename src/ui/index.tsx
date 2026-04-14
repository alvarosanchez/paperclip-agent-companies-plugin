import { useEffect, useState, type FormEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  usePluginAction,
  usePluginData,
  type PluginSettingsPageProps
} from "@paperclipai/plugin-sdk/ui";
import {
  type CatalogCompanyContentDetail,
  type CompanyContentKey,
  type CompanyContentItem,
  type CompanyContents,
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
  border-color: color-mix(in oklab, var(--ac-info) 42%, var(--ac-border-strong));
  background: color-mix(in oklab, var(--ac-info) 74%, oklch(0.18 0 0));
  color: oklch(0.985 0 0);
  box-shadow:
    inset 0 1px 0 color-mix(in oklab, oklch(0.985 0 0) 16%, transparent),
    0 1px 2px color-mix(in oklab, var(--ac-bg) 36%, transparent);
}

.agent-companies-settings__button--primary:hover:not(:disabled) {
  border-color: color-mix(in oklab, var(--ac-info) 54%, var(--ac-border-strong));
  background: color-mix(in oklab, var(--ac-info) 80%, oklch(0.16 0 0));
  color: oklch(0.985 0 0);
}

.agent-companies-settings__button--primary:focus-visible {
  outline-color: color-mix(in oklab, var(--ac-info) 58%, oklch(0.985 0 0) 18%);
}

.agent-companies-settings__button--primary:active:not(:disabled) {
  background: color-mix(in oklab, var(--ac-info) 68%, oklch(0.14 0 0));
}

.agent-companies-settings__button--primary:disabled {
  opacity: 1;
  border-color: color-mix(in oklab, var(--ac-border) 78%, var(--ac-info) 22%);
  background: color-mix(in oklab, var(--ac-surface-soft) 82%, var(--ac-info) 18%);
  color: color-mix(in oklab, var(--ac-text-muted) 82%, var(--ac-text) 18%);
  box-shadow: none;
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

.agent-companies-settings__company-actions {
  display: grid;
  gap: 8px;
  justify-items: end;
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

.agent-companies-settings__company-summary {
  margin: 0;
  font-size: 11px;
  line-height: 1.45;
  color: var(--ac-text-muted);
}

.agent-companies-settings__dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: color-mix(in oklab, var(--ac-bg) 72%, transparent);
  backdrop-filter: blur(6px);
}

.agent-companies-settings__dialog {
  width: min(960px, 100%);
  max-height: min(88vh, 920px);
  display: grid;
  grid-template-rows: auto auto auto minmax(0, 1fr);
  gap: 14px;
  padding: 18px;
  border: 1px solid var(--ac-border-strong);
  border-radius: 16px;
  background: color-mix(in oklab, var(--ac-surface) 92%, var(--ac-bg));
  box-shadow: 0 28px 72px color-mix(in oklab, var(--ac-bg) 62%, transparent);
  overflow: hidden;
}

.agent-companies-settings__dialog-head {
  display: grid;
  gap: 12px;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
}

.agent-companies-settings__dialog-title {
  margin: 0;
  font-size: 20px;
  line-height: 1.15;
  font-weight: 700;
}

.agent-companies-settings__dialog-copy {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--ac-text-muted);
}

.agent-companies-settings__dialog-meta {
  display: grid;
  gap: 8px;
}

.agent-companies-settings__dialog-summary {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

.agent-companies-settings__dialog-stat {
  display: grid;
  gap: 2px;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--ac-border);
  border-radius: 10px;
  background: var(--ac-surface-muted);
}

.agent-companies-settings__dialog-stat-value {
  font-size: 18px;
  line-height: 1.1;
  font-weight: 700;
}

.agent-companies-settings__dialog-layout {
  display: grid;
  gap: 10px;
  grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
  align-items: stretch;
  min-height: 0;
}

.agent-companies-settings__dialog-nav,
.agent-companies-settings__dialog-preview {
  display: grid;
  gap: 8px;
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--ac-border);
  border-radius: 12px;
  background: var(--ac-surface-muted);
}

.agent-companies-settings__dialog-nav {
  align-content: start;
  min-height: 0;
  max-height: none;
  overflow: auto;
}

.agent-companies-settings__dialog-nav-group {
  display: grid;
  gap: 8px;
}

.agent-companies-settings__dialog-nav-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.agent-companies-settings__dialog-nav-title {
  margin: 0;
  font-size: 13px;
  line-height: 1.3;
  font-weight: 600;
}

.agent-companies-settings__dialog-nav-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
}

.agent-companies-settings__dialog-nav-button {
  appearance: none;
  width: 100%;
  text-align: left;
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--ac-border);
  border-radius: 10px;
  background: color-mix(in oklab, var(--ac-surface-soft) 72%, transparent);
  color: var(--ac-text);
  cursor: pointer;
  transition:
    background 140ms ease,
    border-color 140ms ease,
    color 140ms ease;
}

.agent-companies-settings__dialog-nav-button:hover {
  border-color: var(--ac-border-strong);
  background: color-mix(in oklab, var(--ac-surface-soft) 52%, var(--ac-text) 6%);
}

.agent-companies-settings__dialog-nav-button[aria-pressed="true"] {
  border-color: color-mix(in oklab, var(--ac-info) 34%, var(--ac-border));
  background: var(--ac-info-soft);
}

.agent-companies-settings__dialog-nav-item-name {
  font-size: 12px;
  line-height: 1.4;
  font-weight: 600;
}

.agent-companies-settings__dialog-nav-item-path,
.agent-companies-settings__dialog-preview-path {
  font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: 11px;
  line-height: 1.45;
  color: var(--ac-text-muted);
  word-break: break-word;
}

.agent-companies-settings__dialog-preview {
  align-content: start;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
}

.agent-companies-settings__dialog-preview-head {
  display: grid;
  gap: 8px;
}

.agent-companies-settings__dialog-preview-title {
  margin: 0;
  font-size: 16px;
  line-height: 1.25;
  font-weight: 700;
}

.agent-companies-settings__dialog-preview-body {
  display: grid;
  gap: 12px;
  min-height: 0;
  overflow: auto;
  padding-right: 4px;
}

.agent-companies-settings__dialog-frontmatter {
  margin: 0;
  padding: 12px;
  border: 1px solid var(--ac-border);
  border-radius: 10px;
  background: color-mix(in oklab, var(--ac-surface-soft) 82%, transparent);
  overflow: auto;
  white-space: pre-wrap;
}

.agent-companies-settings__dialog-markdown {
  font-size: 13px;
  line-height: 1.6;
  color: var(--ac-text);
  word-break: break-word;
}

.agent-companies-settings__dialog-markdown > :first-child {
  margin-top: 0;
}

.agent-companies-settings__dialog-markdown > :last-child {
  margin-bottom: 0;
}

.agent-companies-settings__dialog-markdown p,
.agent-companies-settings__dialog-markdown ul,
.agent-companies-settings__dialog-markdown ol,
.agent-companies-settings__dialog-markdown pre,
.agent-companies-settings__dialog-markdown blockquote,
.agent-companies-settings__dialog-markdown table {
  margin: 0 0 12px;
}

.agent-companies-settings__dialog-markdown ul,
.agent-companies-settings__dialog-markdown ol {
  padding-left: 18px;
}

.agent-companies-settings__dialog-markdown li + li {
  margin-top: 4px;
}

.agent-companies-settings__dialog-markdown a {
  color: var(--ac-info);
  text-decoration-color: color-mix(in oklab, var(--ac-info) 60%, transparent);
}

.agent-companies-settings__dialog-markdown a:hover {
  color: color-mix(in oklab, var(--ac-info) 82%, var(--ac-text));
}

.agent-companies-settings__dialog-markdown strong {
  color: var(--ac-text);
}

.agent-companies-settings__dialog-markdown code {
  padding: 0.1rem 0.35rem;
  border-radius: 6px;
  background: color-mix(in oklab, var(--ac-surface-soft) 72%, transparent);
  font-size: 0.95em;
}

.agent-companies-settings__dialog-markdown pre {
  overflow: auto;
  padding: 12px;
  border: 1px solid var(--ac-border);
  border-radius: 10px;
  background: color-mix(in oklab, var(--ac-surface-soft) 72%, transparent);
}

.agent-companies-settings__dialog-markdown pre code {
  padding: 0;
  background: transparent;
}

.agent-companies-settings__dialog-markdown blockquote {
  padding-left: 12px;
  border-left: 3px solid color-mix(in oklab, var(--ac-info) 36%, var(--ac-border));
  color: var(--ac-text-muted);
}

.agent-companies-settings__dialog-empty,
.agent-companies-settings__dialog-loading,
.agent-companies-settings__dialog-preview-error {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--ac-text-muted);
}

.agent-companies-settings__dialog-loading {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.agent-companies-settings__dialog-preview-error {
  color: var(--ac-danger);
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

  .agent-companies-settings__dialog-summary {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .agent-companies-settings__dialog-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .agent-companies-settings__summary {
    grid-template-columns: 1fr;
  }

  .agent-companies-settings__company-top {
    grid-template-columns: 1fr;
  }

  .agent-companies-settings__company-actions {
    justify-items: start;
  }

  .agent-companies-settings__dialog-backdrop {
    padding: 12px;
  }

  .agent-companies-settings__dialog {
    padding: 14px;
  }

  .agent-companies-settings__dialog-head {
    grid-template-columns: 1fr;
  }

  .agent-companies-settings__dialog-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
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

const COMPANY_CONTENT_SECTIONS: Array<{
  key: CompanyContentKey;
  label: string;
  singular: string;
  plural: string;
}> = [
  {
    key: "agents",
    label: "Agents",
    singular: "agent",
    plural: "agents"
  },
  {
    key: "projects",
    label: "Projects",
    singular: "project",
    plural: "projects"
  },
  {
    key: "tasks",
    label: "Tasks",
    singular: "task",
    plural: "tasks"
  },
  {
    key: "issues",
    label: "Issues",
    singular: "issue",
    plural: "issues"
  },
  {
    key: "skills",
    label: "Skills",
    singular: "skill",
    plural: "skills"
  }
];

interface CompanyContentSelection {
  kind: CompanyContentKey;
  item: CompanyContentItem;
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

function formatContentCount(
  count: number,
  singular: string,
  plural: string
): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function buildCompanyContentSummary(contents: CompanyContents): string {
  const parts = COMPANY_CONTENT_SECTIONS.flatMap((section) => {
    const count = contents[section.key].length;
    return count > 0 ? [formatContentCount(count, section.singular, section.plural)] : [];
  });

  return parts.length > 0 ? parts.join(" • ") : "No structured contents detected";
}

function getCompanyContentSection(
  key: CompanyContentKey
): (typeof COMPANY_CONTENT_SECTIONS)[number] {
  return COMPANY_CONTENT_SECTIONS.find((section) => section.key === key) ?? COMPANY_CONTENT_SECTIONS[0];
}

function getDefaultCompanyContentSelection(
  company: CatalogCompanySummary
): CompanyContentSelection | null {
  for (const section of COMPANY_CONTENT_SECTIONS) {
    const firstItem = company.contents[section.key][0];
    if (firstItem) {
      return {
        kind: section.key,
        item: firstItem
      };
    }
  }

  return null;
}

function findCompanyContentSelection(
  company: CatalogCompanySummary,
  itemPath: string | null
): CompanyContentSelection | null {
  if (!itemPath) {
    return getDefaultCompanyContentSelection(company);
  }

  for (const section of COMPANY_CONTENT_SECTIONS) {
    const item = company.contents[section.key].find((candidate) => candidate.path === itemPath);
    if (item) {
      return {
        kind: section.key,
        item
      };
    }
  }

  return getDefaultCompanyContentSelection(company);
}

function matchesCompanyQuery(company: CatalogCompanySummary, query: string): boolean {
  if (!query) {
    return true;
  }

  const normalizedQuery = query.toLowerCase();
  const contentValues = COMPANY_CONTENT_SECTIONS.flatMap((section) =>
    company.contents[section.key].flatMap((item) => [item.name, item.path])
  );

  return [
    company.name,
    company.slug,
    company.description ?? "",
    company.relativePath,
    company.manifestPath,
    company.repositoryLabel,
    ...contentValues
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

function CompanyCard(props: {
  company: CatalogCompanySummary;
  onOpenContents(companyId: string): void;
}): React.JSX.Element {
  const { company, onOpenContents } = props;

  return (
    <article className="agent-companies-settings__company-card" data-testid="company-card">
      <div className="agent-companies-settings__company-top">
        <div>
          <h3 className="agent-companies-settings__company-title">{company.name}</h3>
          <div className="agent-companies-settings__company-path">Manifest: {company.manifestPath}</div>
        </div>
        <div className="agent-companies-settings__company-actions">
          {company.version ? (
            <div className="agent-companies-settings__badge-row">
              <span className="agent-companies-settings__badge">Version {company.version}</span>
            </div>
          ) : null}
          <button
            className="agent-companies-settings__button"
            data-testid="company-details-trigger"
            onClick={() => onOpenContents(company.id)}
            type="button"
          >
            View contents
          </button>
        </div>
      </div>
      {company.description ? (
        <p className="agent-companies-settings__company-description">{company.description}</p>
      ) : null}
      <p className="agent-companies-settings__company-summary">
        {buildCompanyContentSummary(company.contents)}
      </p>
    </article>
  );
}

function CompanyDetailsDialog(props: {
  company: CatalogCompanySummary;
  onClose(): void;
}): React.JSX.Element {
  const { company, onClose } = props;
  const [selectedItemPath, setSelectedItemPath] = useState<string | null>(
    getDefaultCompanyContentSelection(company)?.item.path ?? null
  );
  const selectedSelection = findCompanyContentSelection(company, selectedItemPath);
  const selectedSection = selectedSelection ? getCompanyContentSection(selectedSelection.kind) : null;
  const detail = usePluginData<CatalogCompanyContentDetail | null>(
    "catalog.company-content.read",
    selectedSelection
      ? {
          companyId: company.id,
          itemPath: selectedSelection.item.path
        }
      : {}
  );
  const detailData =
    detail.data?.companyId === company.id &&
    detail.data?.item.path === selectedSelection?.item.path
      ? detail.data
      : null;

  useEffect(() => {
    setSelectedItemPath(getDefaultCompanyContentSelection(company)?.item.path ?? null);
  }, [company.id]);

  return (
    <div
      className="agent-companies-settings__dialog-backdrop"
      data-testid="company-details-modal"
      onClick={onClose}
      role="presentation"
    >
      <div
        aria-labelledby="agent-companies-details-title"
        aria-modal="true"
        className="agent-companies-settings__dialog"
        data-testid="company-details-dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="agent-companies-settings__dialog-head">
          <div>
            <span className="agent-companies-settings__eyebrow">Company Contents</span>
            <h2 className="agent-companies-settings__dialog-title" id="agent-companies-details-title">
              {company.name}
            </h2>
            <p className="agent-companies-settings__dialog-copy">
              Structured manifests discovered for this company package.
            </p>
          </div>
          <button
            className="agent-companies-settings__button"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>

        <div className="agent-companies-settings__dialog-meta">
          <div className="agent-companies-settings__badge-row">
            <span className="agent-companies-settings__badge agent-companies-settings__badge--accent">
              {company.repositoryLabel}
            </span>
            {company.version ? (
              <span className="agent-companies-settings__badge">Version {company.version}</span>
            ) : null}
            <span className="agent-companies-settings__badge">Manifest: {company.manifestPath}</span>
          </div>
          {company.description ? (
            <div className="agent-companies-settings__notice">{company.description}</div>
          ) : null}
        </div>

        <div className="agent-companies-settings__dialog-summary">
          {COMPANY_CONTENT_SECTIONS.map((section) => {
            const count = company.contents[section.key].length;

            return (
              <div
                className="agent-companies-settings__dialog-stat"
                data-testid={`company-details-count-${section.key}`}
                key={section.key}
              >
                <span className="agent-companies-settings__metric-label">{section.label}</span>
                <strong className="agent-companies-settings__dialog-stat-value">{count}</strong>
                <span className="agent-companies-settings__metric-note">
                  {formatContentCount(count, section.singular, section.plural)}
                </span>
              </div>
            );
          })}
        </div>

        <div className="agent-companies-settings__dialog-layout">
          <nav className="agent-companies-settings__dialog-nav" data-testid="company-details-nav">
            {COMPANY_CONTENT_SECTIONS.map((section) => {
              const items = company.contents[section.key];

              return (
                <section className="agent-companies-settings__dialog-nav-group" key={section.key}>
                  <div className="agent-companies-settings__dialog-nav-head">
                    <h3 className="agent-companies-settings__dialog-nav-title">{section.label}</h3>
                    <span className="agent-companies-settings__badge">
                      {formatContentCount(items.length, section.singular, section.plural)}
                    </span>
                  </div>
                  {items.length > 0 ? (
                    <ul className="agent-companies-settings__dialog-nav-list">
                      {items.map((item) => {
                        const isActive = selectedSelection?.item.path === item.path;

                        return (
                          <li key={item.path}>
                            <button
                              aria-pressed={isActive}
                              className="agent-companies-settings__dialog-nav-button"
                              data-testid="company-details-item"
                              onClick={() => setSelectedItemPath(item.path)}
                              type="button"
                            >
                              <span className="agent-companies-settings__dialog-nav-item-name">
                                {item.name}
                              </span>
                              <span className="agent-companies-settings__dialog-nav-item-path">
                                {item.path}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="agent-companies-settings__dialog-empty">
                      No {section.plural} in this package.
                    </p>
                  )}
                </section>
              );
            })}
          </nav>

          <section
            className="agent-companies-settings__dialog-preview"
            data-testid="company-details-preview"
          >
            {!selectedSelection ? (
              <p className="agent-companies-settings__dialog-empty">
                Select an item to preview its rendered markdown.
              </p>
            ) : detail.loading && !detailData ? (
              <div className="agent-companies-settings__dialog-loading">
                <span className="agent-companies-settings__spinner" />
                Loading item details.
              </div>
            ) : detail.error ? (
              <p className="agent-companies-settings__dialog-preview-error">
                Could not load that file: {detail.error.message}
              </p>
            ) : detailData ? (
              <>
                <div className="agent-companies-settings__dialog-preview-head">
                  <div className="agent-companies-settings__badge-row">
                    <span className="agent-companies-settings__badge agent-companies-settings__badge--accent">
                      {selectedSection?.label ?? "Item"}
                    </span>
                  </div>
                  <div>
                    <h3 className="agent-companies-settings__dialog-preview-title">
                      {detailData.item.name}
                    </h3>
                    <div className="agent-companies-settings__dialog-preview-path">
                      {detailData.item.fullPath}
                    </div>
                  </div>
                </div>

                <div
                  className="agent-companies-settings__dialog-preview-body"
                  data-testid="company-details-preview-body"
                >
                  {detailData.item.frontmatter ? (
                    <details open>
                      <summary className="agent-companies-settings__metric-label">Frontmatter</summary>
                      <pre className="agent-companies-settings__dialog-frontmatter">
                        {detailData.item.frontmatter}
                      </pre>
                    </details>
                  ) : null}

                  {detailData.item.markdown ? (
                    <div
                      className="agent-companies-settings__dialog-markdown"
                      data-testid="company-details-markdown"
                    >
                      <ReactMarkdown
                        components={{
                          a: ({ href, ...anchorProps }) => (
                            <a
                              {...anchorProps}
                              className="agent-companies-settings__external-link"
                              href={href}
                              rel="noreferrer"
                              target="_blank"
                            />
                          )
                        }}
                        remarkPlugins={[remarkGfm]}
                      >
                        {detailData.item.markdown}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <p className="agent-companies-settings__dialog-empty">
                      No markdown body below the frontmatter for this file.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <p className="agent-companies-settings__dialog-empty">
                That file is no longer available in the latest repository snapshot.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function CompanyGroupCard({
  repository,
  companies,
  onOpenContents
}: {
  repository: CatalogRepositorySummary | null;
  companies: CatalogCompanySummary[];
  onOpenContents(companyId: string): void;
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
          <CompanyCard company={company} key={company.id} onOpenContents={onOpenContents} />
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
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const visibleCompanies = catalog.companies.filter((company) =>
    matchesCompanyQuery(company, companyQuery.trim())
  );
  const companyGroups = buildCompanyGroups(catalog.repositories, visibleCompanies);
  const selectedCompany = selectedCompanyId
    ? catalog.companies.find((company) => company.id === selectedCompanyId) ?? null
    : null;

  useEffect(() => {
    if (!selectedCompany) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedCompanyId(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedCompany]);

  useEffect(() => {
    if (!selectedCompanyId) {
      return;
    }

    if (catalog.companies.some((company) => company.id === selectedCompanyId)) {
      return;
    }

    setSelectedCompanyId(null);
  }, [catalog.companies, selectedCompanyId]);

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
              placeholder="owner/repo, https://github.com/owner/repo, or local path"
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
                  onOpenContents={setSelectedCompanyId}
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

      {selectedCompany ? (
        <CompanyDetailsDialog company={selectedCompany} onClose={() => setSelectedCompanyId(null)} />
      ) : null}
    </section>
  );
}
