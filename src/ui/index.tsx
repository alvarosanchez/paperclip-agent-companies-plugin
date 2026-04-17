import { useEffect, useRef, useState, type FormEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Atom,
  Bot,
  Brain,
  Bug,
  CircuitBoard,
  CircleHelp,
  ClipboardCheck,
  Code,
  Cog,
  Compass,
  Cpu,
  Crown,
  Database,
  Eye,
  FileCode,
  FileText,
  Fingerprint,
  Flame,
  Gem,
  GitBranch,
  Globe,
  Hammer,
  Heart,
  Hexagon,
  Lightbulb,
  Lock,
  Mail,
  MessageSquare,
  Microscope,
  Package,
  Pentagon,
  Puzzle,
  Radar,
  Rocket,
  Search,
  SearchCheck,
  Shield,
  ShieldCheck,
  Sparkles,
  Star,
  Swords,
  Target,
  Telescope,
  Terminal,
  Wand,
  Wrench
} from "lucide-react";
import {
  usePluginAction,
  usePluginData,
  type PluginSettingsPageProps
} from "@paperclipai/plugin-sdk/ui";
import {
  type CatalogCompanyContentDetail,
  type CatalogPreparedCompanyImport,
  type CatalogCompanySyncResult,
  type CompanyContentKey,
  type CompanyContentItem,
  type CompanyContents,
  type CatalogCompanySummary,
  type CatalogRepositorySummary,
  type CatalogSnapshot,
  type PaperclipCompanyImportResult
} from "../catalog.js";
import {
  normalizePaperclipHealthResponse,
  requiresPaperclipBoardAccess,
  type PaperclipHealthResponse
} from "../paperclip-health.js";

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

.agent-companies-settings__status-grid {
  display: grid;
  gap: 12px;
}

.agent-companies-settings__status-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 12px;
  border: 1px solid var(--ac-border);
  border-radius: 10px;
  background: var(--ac-surface-soft);
}

.agent-companies-settings__status-copy {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.agent-companies-settings__status-title {
  margin: 0;
  font-size: 13px;
  line-height: 1.35;
  font-weight: 700;
  color: var(--ac-text);
}

.agent-companies-settings__status-body {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
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
  display: grid;
  gap: 8px;
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

.agent-companies-settings__notice-title {
  font-size: 13px;
  line-height: 1.35;
  font-weight: 700;
}

.agent-companies-settings__notice-body {
  margin: 0;
}

.agent-companies-settings__notice-list {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 4px;
}

.agent-companies-settings__notice-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.agent-companies-settings__toolbar {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 8px;
}

.agent-companies-settings__button {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--ac-border);
  border-radius: 8px;
  min-height: 34px;
  padding: 0 12px;
  background: var(--ac-surface-soft);
  color: var(--ac-text);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  text-decoration: none;
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
  white-space: pre-wrap;
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

.agent-companies-settings__company-sync {
  display: grid;
  gap: 6px;
}

.agent-companies-settings__company-sync-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.agent-companies-settings__checkbox {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--ac-text-muted);
}

.agent-companies-settings__checkbox input {
  margin: 0;
  accent-color: var(--ac-info);
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

.agent-companies-settings__dialog-actions {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

.agent-companies-settings__dialog-title {
  margin: 0;
  font-size: 20px;
  line-height: 1.15;
  font-weight: 700;
}

.agent-companies-settings__dialog--compact {
  width: min(560px, 100%);
  grid-template-rows: auto auto auto;
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

.agent-companies-settings__dialog-nav-item-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.agent-companies-settings__dialog-nav-item-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  color: color-mix(in oklab, var(--ac-text-muted) 72%, var(--ac-text));
}

.agent-companies-settings__dialog-nav-item-icon svg {
  display: block;
  width: 100%;
  height: 100%;
}

.agent-companies-settings__dialog-nav-button[aria-pressed="true"] .agent-companies-settings__dialog-nav-item-icon {
  color: color-mix(in oklab, var(--ac-info) 70%, var(--ac-text));
}

.agent-companies-settings__dialog-nav-item-name {
  min-width: 0;
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

.agent-companies-settings__dialog-form {
  display: grid;
  gap: 12px;
}

.agent-companies-settings__dialog-form-actions {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
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

  .agent-companies-settings__status-row {
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
  title?: string;
  text: string;
  details?: string[];
  action?: {
    href: string;
    label: string;
  };
}

interface PendingActionState {
  kind: "adding" | "scanning-all" | "scanning-repository" | "removing" | "toggling-auto-sync";
  repositoryId?: string;
  companyId?: string;
}

interface ImportState {
  kind: "preparing" | "importing";
  companyId: string;
}

interface SyncState {
  kind: "syncing";
  companyId: string;
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

type PaperclipAgentIconComponent = typeof Bot;

const PAPERCLIP_AGENT_ICON_COMPONENTS: Record<string, PaperclipAgentIconComponent> = {
  atom: Atom,
  bot: Bot,
  brain: Brain,
  bug: Bug,
  "circuit-board": CircuitBoard,
  "clipboard-check": ClipboardCheck,
  code: Code,
  cog: Cog,
  compass: Compass,
  cpu: Cpu,
  crown: Crown,
  database: Database,
  eye: Eye,
  "file-code": FileCode,
  "file-text": FileText,
  fingerprint: Fingerprint,
  flame: Flame,
  gem: Gem,
  "git-branch": GitBranch,
  globe: Globe,
  hammer: Hammer,
  heart: Heart,
  hexagon: Hexagon,
  lightbulb: Lightbulb,
  lock: Lock,
  mail: Mail,
  "message-square": MessageSquare,
  microscope: Microscope,
  package: Package,
  pentagon: Pentagon,
  puzzle: Puzzle,
  radar: Radar,
  rocket: Rocket,
  search: Search,
  "search-check": SearchCheck,
  shield: Shield,
  "shield-check": ShieldCheck,
  sparkles: Sparkles,
  star: Star,
  swords: Swords,
  target: Target,
  telescope: Telescope,
  terminal: Terminal,
  wand: Wand,
  wrench: Wrench
};

interface CompanyContentSelection {
  kind: CompanyContentKey;
  item: CompanyContentItem;
}

interface PaperclipCompanyRecord {
  id?: string;
  name?: string;
  issuePrefix?: string | null;
}

interface BoardAccessRegistration {
  companyId: string | null;
  configured: boolean;
  identity: string | null;
  updatedAt: string | null;
}

interface CliAuthChallengeResponse {
  token?: string;
  boardApiToken?: string;
  approvalUrl?: string;
  approvalPath?: string;
  pollUrl?: string;
  pollPath?: string;
  expiresAt?: string;
  suggestedPollIntervalMs?: number;
}

interface CliAuthChallengePollResponse {
  status?: string;
  boardApiToken?: string;
}

interface CliAuthIdentityResponse {
  login?: string | null;
  email?: string | null;
  displayName?: string | null;
  name?: string | null;
  user?: {
    login?: string | null;
    email?: string | null;
    displayName?: string | null;
    name?: string | null;
  } | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }

  return "Something went wrong.";
}

function getApiErrorMessage(payload: unknown): string | null {
  if (!isRecord(payload)) {
    return null;
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

  return null;
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

function normalizeImportAction(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized === "create" || normalized === "created") {
    return "created";
  }

  if (normalized === "update" || normalized === "updated") {
    return "updated";
  }

  if (normalized === "skip" || normalized === "skipped") {
    return "skipped";
  }

  if (normalized === "unchanged") {
    return "unchanged";
  }

  return normalized;
}

function formatImportResultSummary(
  label: string,
  results: Array<{
    action?: string;
  }> | null | undefined
): string | null {
  if (!Array.isArray(results) || results.length === 0) {
    return null;
  }

  const counts = new Map<string, number>();

  for (const result of results) {
    const action = normalizeImportAction(result.action) ?? "processed";
    counts.set(action, (counts.get(action) ?? 0) + 1);
  }

  const orderedActions = ["created", "updated", "skipped", "unchanged", "processed"];
  const parts = orderedActions.flatMap((action) => {
    const count = counts.get(action);
    return count ? [`${count} ${action}`] : [];
  });

  return parts.length > 0 ? `${label}: ${parts.join(", ")}` : null;
}

async function fetchHostJson<T>(input: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");

  if (typeof init.body === "string" && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(input, {
    ...init,
    headers,
    credentials: init.credentials ?? "same-origin"
  });
  const contentType = response.headers.get("content-type") ?? "";
  const rawBody = await response.text();
  const normalizedBody = rawBody.trim();

  if (
    contentType.includes("text/html") ||
    normalizedBody.startsWith("<!DOCTYPE html") ||
    normalizedBody.startsWith("<html")
  ) {
    throw new Error(
      "Paperclip returned HTML instead of JSON. This usually means the API served the app shell or a sign-in page instead of the expected endpoint."
    );
  }

  let payload: unknown = null;
  if (normalizedBody) {
    try {
      payload = JSON.parse(normalizedBody);
    } catch {
      throw new Error("Paperclip returned an unexpected response.");
    }
  }

  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload) ?? `Request failed with status ${response.status}.`);
  }

  return payload as T;
}

async function fetchPaperclipHealth(): Promise<PaperclipHealthResponse | null> {
  try {
    return normalizePaperclipHealthResponse(await fetchHostJson("/api/health", {
      headers: {
        accept: "application/json"
      }
    }));
  } catch {
    return null;
  }
}

async function resolveOrCreateCompanySecret(
  companyId: string,
  name: string,
  value: string
): Promise<{ id: string; name: string }> {
  const existingSecrets = await fetchHostJson<Array<{ id: string; name: string }>>(
    `/api/companies/${encodeURIComponent(companyId)}/secrets`
  );
  const existing = existingSecrets.find(
    (secret) => secret.name.trim().toLowerCase() === name.trim().toLowerCase()
  );

  if (existing) {
    return fetchHostJson<{ id: string; name: string }>(
      `/api/secrets/${encodeURIComponent(existing.id)}/rotate`,
      {
        method: "POST",
        body: JSON.stringify({ value })
      }
    );
  }

  return fetchHostJson<{ id: string; name: string }>(
    `/api/companies/${encodeURIComponent(companyId)}/secrets`,
    {
      method: "POST",
      body: JSON.stringify({ name, value })
    }
  );
}

function resolveBrowserOrigin(): string | null {
  if (typeof window === "undefined" || typeof window.location?.origin !== "string") {
    return null;
  }

  const origin = window.location.origin.trim();
  if (!origin || origin === "null") {
    return null;
  }

  try {
    const normalizedOrigin = new URL(origin);
    if (normalizedOrigin.protocol !== "http:" && normalizedOrigin.protocol !== "https:") {
      return null;
    }

    return normalizedOrigin.origin;
  } catch {
    return null;
  }
}

function isTrustedSameOriginHttpUrl(candidate: URL, expectedOrigin: string): boolean {
  return (
    (candidate.protocol === "http:" || candidate.protocol === "https:")
    && candidate.origin === expectedOrigin
  );
}

function buildPaperclipUrl(input: string): string | null {
  const origin = resolveBrowserOrigin();
  const trimmed = input.trim();
  if (!origin || !trimmed || trimmed.startsWith("//")) {
    return null;
  }

  let candidate: URL;
  try {
    candidate = new URL(trimmed, origin);
  } catch {
    return null;
  }

  return isTrustedSameOriginHttpUrl(candidate, origin) ? candidate.toString() : null;
}

function resolveCliAuthUrl(url?: string, path?: string): string | null {
  if (typeof url === "string" && url.trim()) {
    return buildPaperclipUrl(url.trim());
  }

  if (typeof path !== "string" || !path.trim()) {
    return null;
  }

  return buildPaperclipUrl(path.trim());
}

function resolveCliAuthPollUrl(urlOrPath?: string): string | null {
  if (typeof urlOrPath !== "string" || !urlOrPath.trim()) {
    return null;
  }

  const trimmed = urlOrPath.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//iu.test(trimmed)) {
    return buildPaperclipUrl(trimmed);
  }

  const normalizedPath = trimmed.startsWith("/api/")
    ? trimmed
    : `/api${trimmed.startsWith("/") ? "" : "/"}${trimmed}`;

  return buildPaperclipUrl(normalizedPath);
}

function normalizeCliAuthPollIntervalMs(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return 1500;
  }

  return Math.min(5000, Math.max(750, Math.floor(value)));
}

function waitForDuration(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, durationMs);
  });
}

async function requestBoardAccessChallenge(companyId: string): Promise<CliAuthChallengeResponse> {
  return fetchHostJson<CliAuthChallengeResponse>("/api/cli-auth/challenges", {
    method: "POST",
    body: JSON.stringify({
      command: "paperclip plugin agent-companies settings",
      clientName: "Agent Companies plugin",
      requestedAccess: "board",
      requestedCompanyId: companyId
    })
  });
}

async function waitForBoardAccessApproval(challenge: CliAuthChallengeResponse): Promise<string> {
  const challengeToken = typeof challenge.token === "string" ? challenge.token.trim() : "";
  const pollUrl = resolveCliAuthPollUrl(challenge.pollUrl ?? challenge.pollPath);
  if (!challengeToken || !pollUrl) {
    throw new Error("Paperclip did not return a trusted board access challenge.");
  }

  const expiresAtTimeMs =
    typeof challenge.expiresAt === "string" ? Date.parse(challenge.expiresAt) : Number.NaN;
  const pollIntervalMs = normalizeCliAuthPollIntervalMs(challenge.suggestedPollIntervalMs);

  while (true) {
    const pollUrlWithToken = new URL(pollUrl);
    pollUrlWithToken.searchParams.set("token", challengeToken);
    const pollResult = await fetchHostJson<CliAuthChallengePollResponse>(pollUrlWithToken.toString(), {
      headers: {
        accept: "application/json"
      }
    });
    const status = typeof pollResult.status === "string" ? pollResult.status.trim().toLowerCase() : "pending";

    if (status === "approved") {
      const boardApiToken =
        typeof pollResult.boardApiToken === "string" && pollResult.boardApiToken.trim()
          ? pollResult.boardApiToken.trim()
          : typeof challenge.boardApiToken === "string" && challenge.boardApiToken.trim()
            ? challenge.boardApiToken.trim()
            : "";
      if (!boardApiToken) {
        throw new Error("Paperclip approved board access but did not return a usable API token.");
      }

      return boardApiToken;
    }

    if (status === "cancelled") {
      throw new Error("Board access approval was cancelled.");
    }

    if (status === "expired") {
      throw new Error("Board access approval expired. Start the connection flow again.");
    }

    if (Number.isFinite(expiresAtTimeMs) && Date.now() >= expiresAtTimeMs) {
      throw new Error("Board access approval expired. Start the connection flow again.");
    }

    await waitForDuration(pollIntervalMs);
  }
}

function getCliAuthIdentityLabel(identity: CliAuthIdentityResponse): string | null {
  const candidates = [
    identity.user?.displayName,
    identity.user?.name,
    identity.user?.login,
    identity.user?.email,
    identity.displayName,
    identity.name,
    identity.login,
    identity.email
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

async function fetchBoardAccessIdentity(boardApiToken: string): Promise<string | null> {
  const identity = await fetchHostJson<CliAuthIdentityResponse>("/api/cli-auth/me", {
    headers: {
      authorization: `Bearer ${boardApiToken.trim()}`
    }
  });

  return getCliAuthIdentityLabel(identity);
}

function usePaperclipBoardAccessRequirement(): {
  status: "loading" | "required" | "not_required" | "unknown";
  required: boolean;
} {
  const [status, setStatus] = useState<"loading" | "required" | "not_required" | "unknown">("loading");

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const health = await fetchPaperclipHealth();
      if (cancelled) {
        return;
      }

      if (!health) {
        setStatus("unknown");
        return;
      }

      setStatus(requiresPaperclipBoardAccess(health) ? "required" : "not_required");
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    status,
    required: status === "required"
  };
}

function isBoardAccessRequiredError(error: unknown): boolean {
  return getErrorMessage(error).toLowerCase().includes("board access required");
}

function getImportedCompanyLabel(company: CatalogCompanySummary): string | null {
  if (!company.importedCompany) {
    return null;
  }

  return company.importedCompany.issuePrefix?.trim() || company.importedCompany.name.trim();
}

function getImportButtonLabel(
  importState: ImportState | null,
  company: CatalogCompanySummary
): string {
  if (importState?.companyId !== company.id) {
    return "Import";
  }

  return importState.kind === "preparing" ? "Preparing..." : "Importing...";
}

function getSyncButtonLabel(
  syncState: SyncState | null,
  company: CatalogCompanySummary
): string {
  if (company.importedCompany && !company.importedCompany.isSyncAvailable) {
    return "Up to date";
  }

  return syncState?.companyId === company.id ? "Syncing..." : "Sync now";
}

function formatTimestamp(timestamp: string | null, emptyLabel = "Not scanned yet"): string {
  if (!timestamp) {
    return emptyLabel;
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

function getCompanySyncSummary(company: CatalogCompanySummary): string | null {
  if (!company.importedCompany) {
    return null;
  }

  const { importedCompany } = company;
  const parts: string[] = [];

  if (importedCompany.syncStatus === "running") {
    parts.push(`Syncing since ${formatTimestamp(importedCompany.syncRunningSince, "just now")}`);
  } else if (importedCompany.syncStatus === "failed") {
    parts.push(`Last sync failed ${formatTimestamp(importedCompany.lastSyncAttemptAt, "recently")}`);
  } else if (importedCompany.isUpToDate) {
    parts.push(
      importedCompany.latestSourceVersion
        ? `Up to date with ${importedCompany.latestSourceVersion}`
        : "Up to date"
    );
  } else {
    parts.push(`Last synced ${formatTimestamp(importedCompany.lastSyncedAt, "not yet")}`);
  }

  if (importedCompany.autoSyncEnabled) {
    parts.push(
      importedCompany.isUpToDate
        ? "Daily auto-sync watching for new versions"
        : importedCompany.isAutoSyncDue
          ? "Daily auto-sync due now"
          : `Next auto-sync ${formatTimestamp(importedCompany.nextAutoSyncAt, "pending")}`
    );
  } else {
    parts.push("Daily auto-sync paused");
  }

  parts.push(
    importedCompany.syncCollisionStrategy === "replace"
      ? "Overwrite mode"
      : `${importedCompany.syncCollisionStrategy} mode`
  );

  return parts.join(" • ");
}

function getCompanySyncError(company: CatalogCompanySummary): string | null {
  if (!company.importedCompany || company.importedCompany.syncStatus !== "failed") {
    return null;
  }

  return company.importedCompany.lastSyncError;
}

function isExpectedOverwriteWarning(detail: string): boolean {
  return /will be overwritten by import\.?$/iu.test(detail.trim());
}

function getVisibleSyncWarningDetails(syncResult: CatalogCompanySyncResult): string[] {
  return getStructuredMessageLines(syncResult.warnings, 20).filter(
    (detail) =>
      !(syncResult.collisionStrategy === "replace" && isExpectedOverwriteWarning(detail))
  );
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

function getRecurringTaskCount(contents: CompanyContents): number {
  return contents.tasks.filter((item) => item.recurring).length;
}

function formatRoutineTriggerCount(count: number): string {
  return `${count} ${count === 1 ? "routine trigger" : "routine triggers"}`;
}

function getRecurringTaskImportHint(contents: CompanyContents): string | null {
  const recurringTaskCount = getRecurringTaskCount(contents);
  if (recurringTaskCount === 0) {
    return null;
  }

  const hasPaperclipRoutineMetadata = contents.tasks.some(
    (item) =>
      item.recurring
      && (
        typeof item.paperclipRoutineTriggerCount === "number"
        || Boolean(item.paperclipRoutineStatus)
      )
  );

  const routineLabel = recurringTaskCount === 1 ? "routine" : "routines";
  const recurringTaskLabel = formatContentCount(
    recurringTaskCount,
    "recurring task",
    "recurring tasks"
  );

  return hasPaperclipRoutineMetadata
    ? `${recurringTaskLabel} will import as Paperclip ${routineLabel}; .paperclip.yaml routine metadata is preserved.`
    : `${recurringTaskLabel} will import as Paperclip ${routineLabel}.`;
}

function getCompanyContentStatNote(
  section: (typeof COMPANY_CONTENT_SECTIONS)[number],
  contents: CompanyContents
): string {
  const count = contents[section.key].length;
  if (section.key === "tasks") {
    const recurringTaskCount = getRecurringTaskCount(contents);
    if (recurringTaskCount > 0) {
      return formatContentCount(recurringTaskCount, "recurring task", "recurring tasks");
    }
  }

  return formatContentCount(count, section.singular, section.plural);
}

function getCompanyContentItemBadges(
  item: CompanyContentItem,
  kind: CompanyContentKey
): Array<{ label: string; tone?: "accent" }> {
  const badges: Array<{ label: string; tone?: "accent" }> = [];

  if (kind === "tasks" && item.recurring) {
    badges.push({
      label: "Recurring task",
      tone: "accent"
    });
  }

  if (item.paperclipRoutineStatus) {
    badges.push({
      label: `Routine: ${item.paperclipRoutineStatus}`
    });
  }

  if (typeof item.paperclipRoutineTriggerCount === "number") {
    badges.push({
      label: formatRoutineTriggerCount(item.paperclipRoutineTriggerCount)
    });
  }

  return badges;
}

function buildCompanyContentSummary(contents: CompanyContents): string {
  const parts = COMPANY_CONTENT_SECTIONS.flatMap((section) => {
    const count = contents[section.key].length;
    if (count === 0) {
      return [];
    }

    if (section.key !== "tasks") {
      return [formatContentCount(count, section.singular, section.plural)];
    }

    const recurringTaskCount = getRecurringTaskCount(contents);
    const oneTimeTaskCount = count - recurringTaskCount;
    const taskParts: string[] = [];

    if (oneTimeTaskCount > 0) {
      taskParts.push(formatContentCount(oneTimeTaskCount, "task", "tasks"));
    }

    if (recurringTaskCount > 0) {
      taskParts.push(formatContentCount(recurringTaskCount, "recurring task", "recurring tasks"));
    }

    return taskParts.length > 0
      ? taskParts
      : [formatContentCount(count, section.singular, section.plural)];
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

function renderCompanyContentItemIcon(
  item: CompanyContentItem,
  kind: CompanyContentKey
): React.JSX.Element | null {
  if (kind !== "agents") {
    return null;
  }

  const iconName = item.paperclipAgentIcon?.trim().toLowerCase();
  if (!iconName) {
    return null;
  }

  const Icon = PAPERCLIP_AGENT_ICON_COMPONENTS[iconName] ?? CircleHelp;

  return (
    <span
      aria-hidden="true"
      className="agent-companies-settings__dialog-nav-item-icon"
      data-icon-name={iconName}
      data-supported={PAPERCLIP_AGENT_ICON_COMPONENTS[iconName] ? "true" : "false"}
      data-testid="company-details-item-icon"
      title={iconName}
    >
      <Icon aria-hidden="true" size={16} strokeWidth={1.9} />
    </span>
  );
}

function matchesCompanyQuery(company: CatalogCompanySummary, query: string): boolean {
  if (!query) {
    return true;
  }

  const normalizedQuery = query.toLowerCase();
  const contentValues = COMPANY_CONTENT_SECTIONS.flatMap((section) =>
    company.contents[section.key].flatMap((item) => [
      item.name,
      item.path,
      item.recurring ? "recurring task paperclip routine" : "",
      item.paperclipRoutineStatus ?? "",
      typeof item.paperclipRoutineTriggerCount === "number"
        ? formatRoutineTriggerCount(item.paperclipRoutineTriggerCount)
        : ""
    ])
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

function ImportedCompanySyncControls(props: {
  company: CatalogCompanySummary;
  isBusy: boolean;
  showSyncButton?: boolean;
  syncState: SyncState | null;
  onSync(companyId: string): void;
  onToggleAutoSync(companyId: string, enabled: boolean): void;
}): React.JSX.Element | null {
  const { company, isBusy, showSyncButton = true, syncState, onSync, onToggleAutoSync } = props;
  if (!company.importedCompany) {
    return null;
  }

  const syncSummary = getCompanySyncSummary(company);
  const syncError = getCompanySyncError(company);
  const isSyncAvailable = company.importedCompany.isSyncAvailable;
  const isSyncButtonDisabled = isBusy || !isSyncAvailable;

  return (
    <div className="agent-companies-settings__company-sync">
      <div className="agent-companies-settings__company-sync-row">
        {showSyncButton ? (
          <button
            className="agent-companies-settings__button agent-companies-settings__button--primary"
            data-testid="company-sync-trigger"
            disabled={isSyncButtonDisabled}
            onClick={() => void onSync(company.id)}
            type="button"
          >
            {getSyncButtonLabel(syncState, company)}
          </button>
        ) : null}
        <label className="agent-companies-settings__checkbox">
          <input
            checked={company.importedCompany.autoSyncEnabled}
            data-testid="company-auto-sync-toggle"
            disabled={isBusy}
            onChange={(event) => void onToggleAutoSync(company.id, event.target.checked)}
            type="checkbox"
          />
          Daily auto-sync
        </label>
        {company.importedCompany.syncStatus === "running" ? (
          <span className="agent-companies-settings__badge agent-companies-settings__badge--accent">
            Syncing
          </span>
        ) : null}
        {company.importedCompany.isUpToDate ? (
          <span className="agent-companies-settings__badge agent-companies-settings__badge--accent">
            Up to date
          </span>
        ) : company.importedCompany.isAutoSyncDue ? (
          <span className="agent-companies-settings__badge">Due now</span>
        ) : null}
      </div>
      {syncSummary ? (
        <p className="agent-companies-settings__company-summary">{syncSummary}</p>
      ) : null}
      {syncError ? (
        <p className="agent-companies-settings__error">{syncError}</p>
      ) : null}
    </div>
  );
}

function CompanyCard(props: {
  company: CatalogCompanySummary;
  importState: ImportState | null;
  isImportDisabled: boolean;
  isSyncDisabled: boolean;
  syncState: SyncState | null;
  onOpenContents(companyId: string): void;
  onOpenImport(companyId: string): void;
  onSync(companyId: string): void;
  onToggleAutoSync(companyId: string, enabled: boolean): void;
}): React.JSX.Element {
  const {
    company,
    importState,
    isImportDisabled,
    isSyncDisabled,
    syncState,
    onOpenContents,
    onOpenImport,
    onSync,
    onToggleAutoSync
  } = props;
  const importedCompanyLabel = getImportedCompanyLabel(company);

  return (
    <article className="agent-companies-settings__company-card" data-testid="company-card">
      <div className="agent-companies-settings__company-top">
        <div>
          <h3 className="agent-companies-settings__company-title">{company.name}</h3>
          <div className="agent-companies-settings__company-path">Manifest: {company.manifestPath}</div>
        </div>
        <div className="agent-companies-settings__company-actions">
          {company.version || importedCompanyLabel ? (
            <div className="agent-companies-settings__badge-row">
              {company.version ? (
                <span className="agent-companies-settings__badge">Version {company.version}</span>
              ) : null}
              {importedCompanyLabel ? (
                <span className="agent-companies-settings__badge agent-companies-settings__badge--accent">
                  Imported as {importedCompanyLabel}
                </span>
              ) : null}
            </div>
          ) : null}
          {!company.importedCompany ? (
            <button
              className="agent-companies-settings__button agent-companies-settings__button--primary"
              data-testid="company-import-trigger"
              disabled={isImportDisabled}
              onClick={() => onOpenImport(company.id)}
              type="button"
            >
              {getImportButtonLabel(importState, company)}
            </button>
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
      <ImportedCompanySyncControls
        company={company}
        isBusy={isSyncDisabled}
        onSync={onSync}
        onToggleAutoSync={onToggleAutoSync}
        syncState={syncState}
      />
    </article>
  );
}

function CompanyDetailsDialog(props: {
  company: CatalogCompanySummary;
  importState: ImportState | null;
  isImportDisabled: boolean;
  isSyncDisabled: boolean;
  syncState: SyncState | null;
  onClose(): void;
  onOpenImport(companyId: string): void;
  onSync(companyId: string): void;
  onToggleAutoSync(companyId: string, enabled: boolean): void;
}): React.JSX.Element {
  const {
    company,
    importState,
    isImportDisabled,
    isSyncDisabled,
    syncState,
    onClose,
    onOpenImport,
    onSync,
    onToggleAutoSync
  } = props;
  const importedCompanyLabel = getImportedCompanyLabel(company);
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
          <div className="agent-companies-settings__dialog-actions">
            {!company.importedCompany ? (
              <button
                className="agent-companies-settings__button agent-companies-settings__button--primary"
                data-testid="company-details-import-trigger"
                disabled={isImportDisabled}
                onClick={() => onOpenImport(company.id)}
                type="button"
              >
                {getImportButtonLabel(importState, company)}
              </button>
            ) : (
              <button
                className="agent-companies-settings__button agent-companies-settings__button--primary"
                data-testid="company-details-sync-trigger"
                disabled={isSyncDisabled || !company.importedCompany.isSyncAvailable}
                onClick={() => void onSync(company.id)}
                type="button"
              >
                {getSyncButtonLabel(syncState, company)}
              </button>
            )}
            <button
              className="agent-companies-settings__button"
              onClick={onClose}
              type="button"
            >
              Close
            </button>
          </div>
        </div>

        <div className="agent-companies-settings__dialog-meta">
          <div className="agent-companies-settings__badge-row">
            <span className="agent-companies-settings__badge agent-companies-settings__badge--accent">
              {company.repositoryLabel}
            </span>
            {company.version ? (
              <span className="agent-companies-settings__badge">Version {company.version}</span>
            ) : null}
            {importedCompanyLabel ? (
              <span className="agent-companies-settings__badge">Imported as {importedCompanyLabel}</span>
            ) : null}
            <span className="agent-companies-settings__badge">Manifest: {company.manifestPath}</span>
          </div>
          {company.description ? (
            <div className="agent-companies-settings__notice">{company.description}</div>
          ) : null}
          <ImportedCompanySyncControls
            company={company}
            isBusy={isSyncDisabled}
            onSync={onSync}
            onToggleAutoSync={onToggleAutoSync}
            showSyncButton={false}
            syncState={syncState}
          />
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
                  {getCompanyContentStatNote(section, company.contents)}
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
                        const badges = getCompanyContentItemBadges(item, section.key);

                        return (
                          <li key={item.path}>
                            <button
                              aria-pressed={isActive}
                              className="agent-companies-settings__dialog-nav-button"
                              data-testid="company-details-item"
                              onClick={() => setSelectedItemPath(item.path)}
                              type="button"
                            >
                              <div className="agent-companies-settings__dialog-nav-item-head">
                                {renderCompanyContentItemIcon(item, section.key)}
                                <span className="agent-companies-settings__dialog-nav-item-name">
                                  {item.name}
                                </span>
                              </div>
                              {badges.length > 0 ? (
                                <div className="agent-companies-settings__badge-row">
                                  {badges.map((badge) => (
                                    <span
                                      className={[
                                        "agent-companies-settings__badge",
                                        badge.tone === "accent"
                                          ? "agent-companies-settings__badge--accent"
                                          : ""
                                      ]
                                        .filter(Boolean)
                                        .join(" ")}
                                      key={badge.label}
                                    >
                                      {badge.label}
                                    </span>
                                  ))}
                                </div>
                              ) : null}
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
                    {getCompanyContentItemBadges(detailData.item, detailData.item.kind).map((badge) => (
                      <span
                        className={[
                          "agent-companies-settings__badge",
                          badge.tone === "accent"
                            ? "agent-companies-settings__badge--accent"
                            : ""
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        key={badge.label}
                      >
                        {badge.label}
                      </span>
                    ))}
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

function ImportCompanyDialog(props: {
  company: CatalogCompanySummary;
  companyName: string;
  errorText: string | null;
  importState: ImportState | null;
  onChangeCompanyName(value: string): void;
  onClose(): void;
  onSubmit(event: FormEvent<HTMLFormElement>): Promise<void>;
}): React.JSX.Element {
  const { company, companyName, errorText, importState, onChangeCompanyName, onClose, onSubmit } = props;
  const isBusy = importState !== null;

  return (
    <div
      className="agent-companies-settings__dialog-backdrop"
      data-testid="company-import-modal"
      onClick={onClose}
      role="presentation"
    >
      <div
        aria-labelledby="agent-companies-import-title"
        aria-modal="true"
        className="agent-companies-settings__dialog agent-companies-settings__dialog--compact"
        data-testid="company-import-dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="agent-companies-settings__dialog-head">
          <div>
            <span className="agent-companies-settings__eyebrow">Import Company</span>
            <h2 className="agent-companies-settings__dialog-title" id="agent-companies-import-title">
              {company.name}
            </h2>
            <p className="agent-companies-settings__dialog-copy">
              Create a new Paperclip company from this discovered package. The imported company name can be adjusted below.
            </p>
          </div>
          <button
            className="agent-companies-settings__button"
            disabled={isBusy}
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
        </div>

        <div className="agent-companies-settings__dialog-meta">
          <div className="agent-companies-settings__badge-row">
            <span className="agent-companies-settings__badge agent-companies-settings__badge--accent">
              {company.repositoryLabel}
            </span>
            <span className="agent-companies-settings__badge">Manifest: {company.manifestPath}</span>
          </div>
          <div className="agent-companies-settings__notice">
            {buildCompanyContentSummary(company.contents)}
          </div>
        </div>

        <form className="agent-companies-settings__dialog-form" onSubmit={(event) => void onSubmit(event)}>
          <label htmlFor="agent-companies-import-name">
            <span className="agent-companies-settings__metric-label">New company name</span>
          </label>
          <input
            autoFocus
            className="agent-companies-settings__input"
            data-testid="company-import-name-input"
            disabled={isBusy}
            id="agent-companies-import-name"
            onChange={(event) => onChangeCompanyName(event.target.value)}
            placeholder="Imported company name"
            type="text"
            value={companyName}
          />

          {errorText ? (
            <p className="agent-companies-settings__error">{errorText}</p>
          ) : null}

          <div className="agent-companies-settings__dialog-form-actions">
            <button
              className="agent-companies-settings__button"
              disabled={isBusy}
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button
              className="agent-companies-settings__button agent-companies-settings__button--primary"
              data-testid="company-import-submit"
              disabled={isBusy || !companyName.trim()}
              type="submit"
            >
              {importState?.kind === "preparing"
                ? "Preparing..."
                : importState?.kind === "importing"
                  ? "Importing..."
                  : "Import company"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CompanyGroupCard({
  repository,
  companies,
  importState,
  isImportDisabled,
  isSyncDisabled,
  syncState,
  onOpenContents,
  onOpenImport,
  onSync,
  onToggleAutoSync
}: {
  repository: CatalogRepositorySummary | null;
  companies: CatalogCompanySummary[];
  importState: ImportState | null;
  isImportDisabled: boolean;
  isSyncDisabled: boolean;
  syncState: SyncState | null;
  onOpenContents(companyId: string): void;
  onOpenImport(companyId: string): void;
  onSync(companyId: string): void;
  onToggleAutoSync(companyId: string, enabled: boolean): void;
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
          <CompanyCard
            company={company}
            importState={importState}
            isImportDisabled={isImportDisabled}
            isSyncDisabled={isSyncDisabled}
            key={company.id}
            onOpenContents={onOpenContents}
            onOpenImport={onOpenImport}
            onSync={onSync}
            onToggleAutoSync={onToggleAutoSync}
            syncState={syncState}
          />
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
  const boardAccess = usePluginData<BoardAccessRegistration>("board-access.read", {
    companyId: context.companyId ?? ""
  });
  const prepareCompanyImport = usePluginAction("catalog.prepare-company-import");
  const recordCompanyImport = usePluginAction("catalog.record-company-import");
  const syncCompany = usePluginAction("catalog.sync-company");
  const setCompanyAutoSync = usePluginAction("catalog.set-company-auto-sync");
  const addRepository = usePluginAction("catalog.add-repository");
  const removeRepository = usePluginAction("catalog.remove-repository");
  const scanRepository = usePluginAction("catalog.scan-repository");
  const scanAllRepositories = usePluginAction("catalog.scan-all-repositories");
  const updateBoardAccess = usePluginAction("board-access.update");
  const setPaperclipApiBase = usePluginAction("paperclip-runtime.set-api-base");
  const catalog = data ?? EMPTY_CATALOG;
  const boardAccessRequirement = usePaperclipBoardAccessRequirement();
  const [repositoryInput, setRepositoryInput] = useState("");
  const [companyQuery, setCompanyQuery] = useState("");
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingActionState | null>(null);
  const [importState, setImportState] = useState<ImportState | null>(null);
  const [syncState, setSyncState] = useState<SyncState | null>(null);
  const [connectingBoardAccess, setConnectingBoardAccess] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importCompanyId, setImportCompanyId] = useState<string | null>(null);
  const [importCompanyName, setImportCompanyName] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const hasCompanyContext = Boolean(context.companyId);
  const boardAccessConfigured = Boolean(boardAccess.data?.configured);
  const boardAccessIdentity = boardAccess.data?.identity?.trim() || null;
  const boardAccessRequired = boardAccessRequirement.required;
  const currentCompanyLabel = context.companyPrefix?.trim() || "this company";
  const boardAccessBadgeLabel = connectingBoardAccess
    ? "Connecting"
    : boardAccessConfigured
      ? "Connected"
      : boardAccessRequired
        ? "Required"
        : boardAccessRequirement.status === "loading"
          ? "Checking"
          : "Optional";
  const boardAccessBadgeClass =
    boardAccessRequired && !boardAccessConfigured
      ? "agent-companies-settings__badge agent-companies-settings__badge--danger"
      : "agent-companies-settings__badge agent-companies-settings__badge--accent";
  const visibleCompanies = catalog.companies.filter((company) =>
    matchesCompanyQuery(company, companyQuery.trim())
  );
  const companyGroups = buildCompanyGroups(catalog.repositories, visibleCompanies);
  const isImportDisabled = pendingAction !== null || importState !== null || syncState !== null;
  const isSyncDisabled = pendingAction !== null || importState !== null || syncState !== null;
  const importCompany = importCompanyId
    ? catalog.companies.find((company) => company.id === importCompanyId) ?? null
    : null;
  const selectedCompany = selectedCompanyId
    ? catalog.companies.find((company) => company.id === selectedCompanyId) ?? null
    : null;
  const registeredApiBaseRef = useRef<string | null>(null);

  async function ensurePaperclipApiBaseRegistered(): Promise<void> {
    const apiBase = resolveBrowserOrigin();

    if (!apiBase || registeredApiBaseRef.current === apiBase) {
      return;
    }

    await setPaperclipApiBase({
      apiBase
    });
    registeredApiBaseRef.current = apiBase;
  }

  useEffect(() => {
    if (!selectedCompany && !importCompany) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      if (importCompany) {
        if (!importState) {
          setImportCompanyId(null);
          setImportError(null);
        }
        return;
      }

      setSelectedCompanyId(null);
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [importCompany, importState, selectedCompany]);

  useEffect(() => {
    if (selectedCompanyId && !catalog.companies.some((company) => company.id === selectedCompanyId)) {
      setSelectedCompanyId(null);
    }

    if (importCompanyId && !catalog.companies.some((company) => company.id === importCompanyId)) {
      setImportCompanyId(null);
      setImportError(null);
    }
  }, [catalog.companies, importCompanyId, selectedCompanyId]);

  useEffect(() => {
    if (!catalog.companies.some((company) => company.importedCompany?.syncStatus === "running")) {
      return;
    }

    const intervalId = window.setInterval(() => {
      refresh();
    }, 2000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [catalog.companies, refresh]);

  useEffect(() => {
    void ensurePaperclipApiBaseRegistered();
  }, [setPaperclipApiBase]);

  useEffect(() => {
    if (!hasCompanyContext) {
      return;
    }

    const refreshBoardAccess = () => {
      try {
        boardAccess.refresh();
      } catch {
        return;
      }
    };

    const handleWindowFocus = () => {
      refreshBoardAccess();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshBoardAccess();
      }
    };

    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [boardAccess.refresh, hasCompanyContext]);

  async function refreshCatalog(noticeState: NoticeState | null = null): Promise<void> {
    if (noticeState) {
      setNotice(noticeState);
    }

    refresh();
  }

  function openImportDialog(companyId: string): void {
    const company = catalog.companies.find((candidate) => candidate.id === companyId);
    if (!company) {
      setNotice({
        tone: "error",
        text: "That company is no longer available in the current catalog snapshot."
      });
      return;
    }

    if (company.importedCompany) {
      const importedCompanyLabel = getImportedCompanyLabel(company);
      setNotice({
        tone: "info",
        text: importedCompanyLabel
          ? `"${company.name}" is already imported as "${importedCompanyLabel}". Use Sync now to update it.`
          : `"${company.name}" is already imported. Use Sync now to update it.`
      });
      return;
    }

    setSelectedCompanyId(null);
    setImportCompanyId(company.id);
    setImportCompanyName(company.name);
    setImportError(null);
  }

  async function handleImportCompany(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!importCompany) {
      setImportError("That company is no longer available in the current catalog snapshot.");
      return;
    }

    if (importCompany.importedCompany) {
      const importedCompanyLabel = getImportedCompanyLabel(importCompany);
      setImportError(
        importedCompanyLabel
          ? `"${importCompany.name}" is already imported as "${importedCompanyLabel}". Use Sync now to update it.`
          : `"${importCompany.name}" is already imported. Use Sync now to update it.`
      );
      return;
    }

    const nextCompanyName = importCompanyName.trim();
    if (!nextCompanyName) {
      setImportError("Enter the new Paperclip company name before importing.");
      return;
    }

    setImportError(null);
    setNotice(null);
    setImportState({
      kind: "preparing",
      companyId: importCompany.id
    });

    try {
      await ensurePaperclipApiBaseRegistered();
      const preparedImport = await prepareCompanyImport({
        companyId: importCompany.id
      }) as CatalogPreparedCompanyImport;

      setImportState({
        kind: "importing",
        companyId: importCompany.id
      });

      const importedCompany = await fetchHostJson<PaperclipCompanyImportResult>("/api/companies/import", {
        method: "POST",
        body: JSON.stringify({
          source: preparedImport.source,
          include: {
            company: true,
            agents: true,
            projects: true,
            issues: true,
            skills: true
          },
          target: {
            mode: "new_company",
            newCompanyName: nextCompanyName
          },
          collisionStrategy: "rename"
        })
      });
      const importedCompanyName = importedCompany.company?.name?.trim() || nextCompanyName;
      const importedCompanyId = importedCompany.company?.id?.trim() || null;
      const postImportDetails: string[] = [];
      let importedCompanyIssuePrefix: string | null = null;

      if (importedCompanyId) {
        try {
          const importedCompanyRecord = await fetchHostJson<PaperclipCompanyRecord>(
            `/api/companies/${encodeURIComponent(importedCompanyId)}`
          );
          importedCompanyIssuePrefix = importedCompanyRecord.issuePrefix?.trim() || null;
        } catch (lookupError) {
          postImportDetails.push(
            `Dashboard link unavailable: ${getErrorMessage(lookupError)}`
          );
        }

        try {
          await recordCompanyImport({
            sourceCompanyId: importCompany.id,
            importedCompanyId,
            importedCompanyName,
            importedCompanyIssuePrefix
          });
          refresh();
        } catch (recordError) {
          postImportDetails.push(
            `Import tracking could not be saved: ${getErrorMessage(recordError)}`
          );
        }
      } else {
        postImportDetails.push(
          "Import tracking could not be saved because Paperclip did not return a company id."
        );
      }

      const warningDetails = getStructuredMessageLines(importedCompany.warnings, 3);
      const warningCount = Array.isArray(importedCompany.warnings)
        ? importedCompany.warnings.length
        : warningDetails.length;
      const importDetails = [
        `Package contents: ${buildCompanyContentSummary(importCompany.contents)}`,
        getRecurringTaskImportHint(importCompany.contents),
        "Auto-sync: enabled daily by default after import.",
        "Default sync mode after import: overwrite existing content.",
        (() => {
          const companyAction = normalizeImportAction(importedCompany.company?.action);
          return companyAction ? `Company record: ${companyAction}` : null;
        })(),
        formatImportResultSummary("Agents", importedCompany.agents),
        formatImportResultSummary("Projects", importedCompany.projects),
        formatImportResultSummary("Issues", importedCompany.issues),
        formatImportResultSummary("Skills", importedCompany.skills),
        warningCount > 0
          ? `Warnings: ${warningCount} returned during import.`
          : null,
        ...warningDetails.map((detail) => `Warning detail: ${detail}`),
        ...postImportDetails
      ].filter((detail): detail is string => Boolean(detail));

      setImportCompanyId(null);
      setImportCompanyName("");
      setImportError(null);
      setNotice({
        tone: "success",
        title: "Company imported",
        text:
          warningCount > 0
            ? `Imported "${importCompany.name}" as "${importedCompanyName}" with ${warningCount} warning${warningCount === 1 ? "" : "s"}.`
            : `Imported "${importCompany.name}" as "${importedCompanyName}".`,
        details: importDetails,
        action: importedCompanyIssuePrefix
          ? {
              href: `/${encodeURIComponent(importedCompanyIssuePrefix)}/dashboard`,
              label: "Open dashboard"
            }
          : undefined
      });
    } catch (actionError) {
      setImportError(getErrorMessage(actionError));
    } finally {
      setImportState(null);
    }
  }

  async function handleSetCompanyAutoSync(companyId: string, enabled: boolean): Promise<void> {
    const company = catalog.companies.find((candidate) => candidate.id === companyId);
    if (!company?.importedCompany) {
      setNotice({
        tone: "error",
        text: "That company must be imported before auto-sync can be changed."
      });
      return;
    }

    setPendingAction({
      kind: "toggling-auto-sync",
      companyId
    });
    setNotice(null);

    try {
      await setCompanyAutoSync({
        sourceCompanyId: companyId,
        enabled
      });
      await refreshCatalog({
        tone: "info",
        text: enabled
          ? `Daily auto-sync enabled for "${company.name}".`
          : `Daily auto-sync paused for "${company.name}".`
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

  async function handleSyncCompany(companyId: string): Promise<void> {
    const company = catalog.companies.find((candidate) => candidate.id === companyId);
    if (!company?.importedCompany) {
      setNotice({
        tone: "error",
        text: "That company must be imported before it can be synced."
      });
      return;
    }

    if (!company.importedCompany.isSyncAvailable) {
      setNotice({
        tone: "info",
        text: company.importedCompany.latestSourceVersion
          ? `"${company.name}" is already up to date with ${company.importedCompany.latestSourceVersion}.`
          : `"${company.name}" is already up to date.`
      });
      return;
    }

    setSyncState({
      kind: "syncing",
      companyId
    });
    setNotice(null);

    try {
      await ensurePaperclipApiBaseRegistered();
      const syncResult = await syncCompany({
        companyId
      }) as CatalogCompanySyncResult;
      const visibleWarningDetails = getVisibleSyncWarningDetails(syncResult);
      const warningCount = visibleWarningDetails.length;
      const warningDetails = visibleWarningDetails.slice(0, 3);
      const syncDetails = [
        `Package contents: ${buildCompanyContentSummary(company.contents)}`,
        getRecurringTaskImportHint(company.contents),
        syncResult.collisionStrategy === "replace"
          ? "Sync mode: overwrite existing content."
          : `Sync mode: ${syncResult.collisionStrategy}.`,
        syncResult.latestSourceVersion
          ? `Source version: ${syncResult.latestSourceVersion}`
          : null,
        (() => {
          const companyAction = normalizeImportAction(syncResult.company?.action);
          return companyAction ? `Company record: ${companyAction}` : null;
        })(),
        formatImportResultSummary("Agents", syncResult.agents),
        formatImportResultSummary("Projects", syncResult.projects),
        formatImportResultSummary("Issues", syncResult.issues),
        formatImportResultSummary("Skills", syncResult.skills),
        warningCount > 0
          ? `Warnings: ${warningCount} returned during sync.`
          : null,
        ...warningDetails.map((detail) => `Warning detail: ${detail}`)
      ].filter((detail): detail is string => Boolean(detail));

      await refreshCatalog();
      if (syncResult.upToDate) {
        setNotice({
          tone: "info",
          title: "Already up to date",
          text: syncResult.latestSourceVersion
            ? `"${company.name}" is already up to date with ${syncResult.latestSourceVersion}.`
            : `"${company.name}" is already up to date.`
        });
        return;
      }

      setNotice({
        tone: warningCount > 0 ? "info" : "success",
        title: "Company synced",
        text:
          warningCount > 0
            ? `Synced "${company.name}" into "${syncResult.importedCompanyName}" with ${warningCount} warning${warningCount === 1 ? "" : "s"}.`
            : `Synced "${company.name}" into "${syncResult.importedCompanyName}".`,
        details: syncDetails,
        action: syncResult.importedCompanyIssuePrefix
          ? {
              href: `/${encodeURIComponent(syncResult.importedCompanyIssuePrefix)}/dashboard`,
              label: "Open dashboard"
            }
          : undefined
      });
    } catch (actionError) {
      if (isBoardAccessRequiredError(actionError)) {
        const importedCompanyLabel = getImportedCompanyLabel(company) ?? company.importedCompany.name;
        setNotice({
          tone: "error",
          title: "Board access required",
          text:
            hasCompanyContext && context.companyId === company.importedCompany.id
              ? `Connect board access for ${currentCompanyLabel} in the section above, then retry sync for "${company.name}".`
              : `Open Agent Companies Plugin settings inside "${importedCompanyLabel}", connect board access, and retry sync for "${company.name}".`
        });
      } else {
        setNotice({
          tone: "error",
          text: getErrorMessage(actionError)
        });
      }
    } finally {
      setSyncState(null);
      refresh();
    }
  }

  async function handleConnectBoardAccess(): Promise<void> {
    if (!context.companyId) {
      setNotice({
        tone: "error",
        text: "Open this settings page inside an imported company before connecting board access."
      });
      return;
    }

    setConnectingBoardAccess(true);
    let approvalWindow: Window | null = null;

    try {
      if (typeof window !== "undefined") {
        approvalWindow = window.open("about:blank", "_blank");
      }

      const challenge = await requestBoardAccessChallenge(context.companyId);
      const approvalUrl = resolveCliAuthUrl(challenge.approvalUrl, challenge.approvalPath);
      if (!approvalUrl) {
        throw new Error("Paperclip did not return a trusted board approval URL.");
      }

      if (!approvalWindow && typeof window !== "undefined") {
        approvalWindow = window.open(approvalUrl, "_blank");
      } else {
        approvalWindow?.location.replace(approvalUrl);
      }

      if (!approvalWindow) {
        throw new Error("Allow pop-ups for Paperclip, then try connecting board access again.");
      }

      const boardApiToken = await waitForBoardAccessApproval(challenge);
      const identity = await fetchBoardAccessIdentity(boardApiToken);
      const secretName = `agent_companies_board_api_${context.companyId.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`;
      const secret = await resolveOrCreateCompanySecret(context.companyId, secretName, boardApiToken);

      await updateBoardAccess({
        companyId: context.companyId,
        paperclipBoardApiTokenRef: secret.id,
        identity
      });
      await boardAccess.refresh();

      setNotice({
        tone: "success",
        title: identity ? `Board access connected as ${identity}` : "Board access connected",
        text: `Worker-side sync can now authenticate against ${currentCompanyLabel}.`
      });
    } catch (actionError) {
      setNotice({
        tone: "error",
        title: "Board access could not be connected",
        text: getErrorMessage(actionError)
      });
    } finally {
      setConnectingBoardAccess(false);
      try {
        approvalWindow?.close();
      } catch {
        return;
      }
    }
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
          {notice.title ? (
            <strong className="agent-companies-settings__notice-title">{notice.title}</strong>
          ) : null}
          <p className="agent-companies-settings__notice-body">{notice.text}</p>
          {notice.details && notice.details.length > 0 ? (
            <ul className="agent-companies-settings__notice-list">
              {notice.details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          ) : null}
          {notice.action ? (
            <div className="agent-companies-settings__notice-actions">
              <a
                className="agent-companies-settings__button agent-companies-settings__button--primary"
                data-testid="import-success-dashboard-link"
                href={notice.action.href}
              >
                {notice.action.label}
              </a>
            </div>
          ) : null}
        </div>
      ) : null}

      {error && !loading ? (
        <div className="agent-companies-settings__notice" data-tone="error">
          Could not load the repository catalog: {error.message}
        </div>
      ) : null}

      <section className="agent-companies-settings__panel">
        <div className="agent-companies-settings__panel-head">
          <div>
            <h2 className="agent-companies-settings__panel-title">Board Access Connection</h2>
            <p className="agent-companies-settings__panel-copy">
              Sync needs a board access connection on authenticated Paperclip deployments because the worker cannot reuse your browser session.
            </p>
          </div>
          <div className="agent-companies-settings__badge-row">
            <span className={boardAccessBadgeClass}>{boardAccessBadgeLabel}</span>
          </div>
        </div>

        <div className="agent-companies-settings__status-grid">
          <div className="agent-companies-settings__status-row">
            <div className="agent-companies-settings__status-copy">
              <p className="agent-companies-settings__status-title">
                {!hasCompanyContext
                  ? "Open settings inside an imported company"
                  : boardAccessConfigured
                    ? boardAccessIdentity
                      ? `Connected as ${boardAccessIdentity}`
                      : `Connected for ${currentCompanyLabel}`
                    : boardAccessRequired
                      ? `Board access is required for ${currentCompanyLabel}`
                      : `Board access is optional for ${currentCompanyLabel}`}
              </p>
              <p className="agent-companies-settings__status-body">
                {!hasCompanyContext
                  ? "Pick the imported company you want to sync, then open this settings page from that company to save a board access connection."
                  : boardAccessConfigured
                    ? "This saved connection is used for worker-side sync calls to the Paperclip import API."
                    : boardAccessRequired
                      ? "Connect board access once for this company so future syncs can authenticate."
                      : boardAccessRequirement.status === "loading"
                        ? "Checking whether this Paperclip deployment requires board access for worker-side API calls."
                        : "You only need to connect board access if sync later reports that the deployment requires authentication."}
              </p>
            </div>
            <button
              className="agent-companies-settings__button agent-companies-settings__button--primary"
              disabled={!hasCompanyContext || connectingBoardAccess || pendingAction !== null || importState !== null || syncState !== null}
              onClick={() => {
                void handleConnectBoardAccess();
              }}
              type="button"
            >
              {connectingBoardAccess
                ? "Waiting for approval..."
                : boardAccessConfigured
                  ? "Reconnect board access"
                  : "Connect board access"}
            </button>
          </div>
        </div>
      </section>

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
                  importState={importState}
                  isImportDisabled={isImportDisabled}
                  isSyncDisabled={isSyncDisabled}
                  key={group.repository?.id ?? group.companies[0]?.repositoryId ?? "unknown-repo"}
                  onOpenContents={setSelectedCompanyId}
                  onOpenImport={openImportDialog}
                  onSync={handleSyncCompany}
                  onToggleAutoSync={handleSetCompanyAutoSync}
                  repository={group.repository}
                  syncState={syncState}
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
        <CompanyDetailsDialog
          company={selectedCompany}
          importState={importState}
          isImportDisabled={isImportDisabled}
          isSyncDisabled={isSyncDisabled}
          onClose={() => setSelectedCompanyId(null)}
          onOpenImport={openImportDialog}
          onSync={handleSyncCompany}
          onToggleAutoSync={handleSetCompanyAutoSync}
          syncState={syncState}
        />
      ) : null}

      {importCompany ? (
        <ImportCompanyDialog
          company={importCompany}
          companyName={importCompanyName}
          errorText={importError}
          importState={importState}
          onChangeCompanyName={setImportCompanyName}
          onClose={() => {
            if (importState) {
              return;
            }

            setImportCompanyId(null);
            setImportError(null);
          }}
          onSubmit={handleImportCompany}
        />
      ) : null}
    </section>
  );
}
