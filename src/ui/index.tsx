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
  type AdapterPreset,
  type CatalogCompanyContentDetail,
  type CatalogPreparedCompanyImport,
  type CatalogCompanySyncResult,
  type CatalogSyncCollisionStrategy,
  type CompanyContentKey,
  type CompanyContentSectionDefinition,
  type CompanyImportPartSelection,
  type CompanyImportSelection,
  type ImportAdapterPresetSelection,
  type CompanyContentItem,
  type CompanyContents,
  type CatalogCompanySummary,
  type CatalogImportedCompanySummary,
  type CatalogRepositorySummary,
  type CatalogSnapshot,
  DEFAULT_AUTO_SYNC_CADENCE_HOURS,
  MIN_AUTO_SYNC_CADENCE_HOURS,
  type PaperclipCompanyImportResult,
  buildStagedPaperclipImportSource,
  createDefaultCompanyImportSelection,
  getCompanyContentItemRequirementLookup,
  getCompanyContentSectionForKey,
  getCompanyContentSectionItemCount,
  getVisibleCompanyContentSections,
  listCompanyContentSectionItems,
  resolveCompanyImportSelection
} from "../catalog.js";
import {
  normalizePaperclipHealthResponse,
  requiresPaperclipBoardAccess,
  type PaperclipHealthResponse
} from "../paperclip-health.js";
import {
  extractPortableRecurringTaskDefinitions,
  findArchivableImportedRoutineIds,
  type ImportedRoutineSnapshot
} from "../portable-routines.js";
import { getImportedCompanyVersionInfo } from "./version-status.js";

const EMPTY_CATALOG: CatalogSnapshot = {
  autoSyncCadenceHours: DEFAULT_AUTO_SYNC_CADENCE_HOURS,
  adapterPresets: [],
  repositories: [],
  companies: [],
  importedCompanies: [],
  summary: {
    repositoryCount: 0,
    scannedRepositoryCount: 0,
    errorRepositoryCount: 0,
    companyCount: 0,
    importedCompanyCount: 0,
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
  grid-template-columns: repeat(5, minmax(0, 1fr));
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
.agent-companies-settings__input:focus-visible,
.agent-companies-settings__textarea:focus-visible {
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

.agent-companies-settings__menu-shell {
  position: relative;
}

.agent-companies-settings__menu {
  position: fixed;
  z-index: 70;
  display: grid;
  gap: 6px;
  padding: 8px;
  border: 1px solid var(--ac-border-strong);
  border-radius: 12px;
  background: color-mix(in oklab, var(--ac-surface) 94%, var(--ac-bg));
  box-shadow: 0 18px 36px color-mix(in oklab, var(--ac-bg) 44%, transparent);
}

.agent-companies-settings__menu-item {
  appearance: none;
  display: grid;
  gap: 2px;
  width: 100%;
  text-align: left;
  padding: 10px 12px;
  border: 1px solid var(--ac-border);
  border-radius: 10px;
  background: color-mix(in oklab, var(--ac-surface-soft) 78%, transparent);
  color: var(--ac-text);
  cursor: pointer;
  transition:
    background 140ms ease,
    border-color 140ms ease,
    color 140ms ease;
}

.agent-companies-settings__menu-item:hover {
  border-color: var(--ac-border-strong);
  background: color-mix(in oklab, var(--ac-surface-soft) 58%, var(--ac-text) 6%);
}

.agent-companies-settings__menu-item-title {
  font-size: 12px;
  line-height: 1.35;
  font-weight: 600;
}

.agent-companies-settings__menu-item-meta {
  font-size: 11px;
  line-height: 1.35;
  color: var(--ac-text-muted);
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

.agent-companies-settings__textarea {
  width: 100%;
  min-height: 160px;
  resize: vertical;
  border: 1px solid var(--ac-border);
  border-radius: 8px;
  padding: 9px 10px;
  background: var(--ac-bg);
  color: var(--ac-text);
  font: 12px/1.45 ui-monospace, SFMono-Regular, SF Mono, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
}

.agent-companies-settings__adapter-grid {
  display: grid;
  gap: 8px;
}

.agent-companies-settings__adapter-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(180px, 240px);
  gap: 10px;
  align-items: center;
  padding: 10px;
  border: 1px solid var(--ac-border);
  border-radius: 8px;
  background: var(--ac-surface-soft);
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

.agent-companies-settings__switch-field {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 154px;
  padding: 6px 10px;
  border: 1px solid var(--ac-border);
  border-radius: 999px;
  background: color-mix(in oklab, var(--ac-surface-soft) 76%, transparent);
  font-size: 11px;
  line-height: 1.4;
  color: var(--ac-text-muted);
}

.agent-companies-settings__switch-input {
  appearance: none;
  position: relative;
  width: 34px;
  height: 20px;
  margin: 0;
  flex: 0 0 auto;
  border: 1px solid var(--ac-border-strong);
  border-radius: 999px;
  background: color-mix(in oklab, var(--ac-surface-soft) 86%, var(--ac-bg));
  cursor: pointer;
  transition:
    background 140ms ease,
    border-color 140ms ease,
    box-shadow 140ms ease,
    opacity 140ms ease;
}

.agent-companies-settings__switch-input::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 999px;
  background: var(--ac-primary);
  box-shadow: 0 1px 3px color-mix(in oklab, var(--ac-bg) 52%, transparent);
  transition:
    transform 140ms ease,
    background 140ms ease;
}

.agent-companies-settings__switch-input:checked {
  border-color: color-mix(in oklab, var(--ac-info) 52%, var(--ac-border-strong));
  background: color-mix(in oklab, var(--ac-info) 82%, var(--ac-surface));
}

.agent-companies-settings__switch-input:checked::after {
  transform: translateX(16px);
}

.agent-companies-settings__switch-input:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--ac-info) 24%, transparent);
}

.agent-companies-settings__switch-input:disabled {
  cursor: not-allowed;
  opacity: 0.58;
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
  width: min(640px, 100%);
  grid-template-rows: auto auto minmax(0, 1fr);
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
  min-height: 0;
}

.agent-companies-settings__dialog--compact .agent-companies-settings__dialog-form {
  grid-template-rows: minmax(0, 1fr) auto;
}

.agent-companies-settings__dialog-form-scroll {
  display: grid;
  gap: 12px;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  padding-right: 4px;
  scrollbar-gutter: stable;
}

.agent-companies-settings__dialog-form fieldset {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
  display: grid;
  gap: 10px;
}

.agent-companies-settings__selection-list {
  display: grid;
  gap: 10px;
}

.agent-companies-settings__selection-group {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--ac-border);
  border-radius: 12px;
  background: color-mix(in oklab, var(--ac-surface-muted) 78%, transparent);
}

.agent-companies-settings__selection-part,
.agent-companies-settings__selection-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  min-width: 0;
  cursor: pointer;
}

.agent-companies-settings__selection-part--readonly,
.agent-companies-settings__selection-item--readonly {
  cursor: default;
}

.agent-companies-settings__selection-part {
  padding: 12px;
  border: 1px solid var(--ac-border-strong);
  border-radius: 12px;
  background: color-mix(in oklab, var(--ac-surface) 88%, var(--ac-bg));
}

.agent-companies-settings__selection-part-copy,
.agent-companies-settings__selection-item-copy {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.agent-companies-settings__selection-item-head {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.agent-companies-settings__selection-part-title {
  font-size: 14px;
  line-height: 1.35;
  font-weight: 700;
  color: var(--ac-text);
}

.agent-companies-settings__selection-part-summary {
  font-size: 12px;
  line-height: 1.5;
  color: var(--ac-text-muted);
}

.agent-companies-settings__selection-items {
  display: grid;
  gap: 8px;
  min-width: 0;
  margin-left: 8px;
  padding-left: 14px;
  border-left: 1px solid color-mix(in oklab, var(--ac-border-strong) 68%, transparent);
}

.agent-companies-settings__selection-items-label {
  font-size: 11px;
  line-height: 1.35;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ac-text-muted);
}

.agent-companies-settings__selection-item {
  padding: 10px 12px;
  border: 1px solid var(--ac-border);
  border-radius: 10px;
  background: color-mix(in oklab, var(--ac-surface-soft) 84%, transparent);
}

.agent-companies-settings__selection-item--readonly {
  border-color: color-mix(in oklab, var(--ac-info) 20%, var(--ac-border));
  background: color-mix(in oklab, var(--ac-info-soft) 38%, var(--ac-surface-soft));
}

.agent-companies-settings__selection-item-title {
  font-size: 12px;
  line-height: 1.4;
  font-weight: 600;
  color: var(--ac-text);
}

.agent-companies-settings__selection-item-path {
  font-size: 11px;
  line-height: 1.45;
  color: var(--ac-text-muted);
  overflow-wrap: anywhere;
}

.agent-companies-settings__selection-lock,
.agent-companies-settings__selection-item-hint,
.agent-companies-settings__selection-part-hint {
  font-size: 11px;
  line-height: 1.45;
}

.agent-companies-settings__selection-lock {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border: 1px solid color-mix(in oklab, var(--ac-info) 28%, var(--ac-border));
  border-radius: 999px;
  background: color-mix(in oklab, var(--ac-info-soft) 64%, transparent);
  color: var(--ac-info);
  font-weight: 600;
}

.agent-companies-settings__selection-item-hint,
.agent-companies-settings__selection-part-hint {
  color: color-mix(in oklab, var(--ac-info) 88%, var(--ac-text-muted));
}

.agent-companies-settings__selection-items-meta,
.agent-companies-settings__selection-empty {
  font-size: 11px;
  line-height: 1.45;
  color: var(--ac-text-muted);
}

.agent-companies-settings__selection-empty {
  margin-left: 8px;
  padding-left: 14px;
  border-left: 1px solid color-mix(in oklab, var(--ac-border-strong) 68%, transparent);
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
  kind:
    | "adding"
    | "scanning-all"
    | "scanning-repository"
    | "removing"
    | "toggling-auto-sync"
    | "updating-adapter-presets"
    | "updating-cadence";
  repositoryId?: string;
  sourceCompanyId?: string;
  importedCompanyId?: string;
}

interface ImportState {
  kind: "preparing" | "importing";
  companyId: string;
}

type ImportTargetMode = "new_company" | "existing_company" | "existing_import";

interface SyncState {
  kind: "syncing";
  sourceCompanyId: string;
  importedCompanyId: string;
}

interface ImportDialogState {
  sourceCompanyId: string;
  targetMode: ImportTargetMode;
  targetCompanyId: string | null;
  targetCompanyName: string;
  companyName: string;
  selection: CompanyImportSelection;
  adapterPresetSelection: ImportAdapterPresetSelection;
  collisionStrategy: CatalogSyncCollisionStrategy;
}

interface CatalogCompanyGroup {
  repository: CatalogRepositorySummary | null;
  companies: CatalogCompanySummary[];
}

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

function getSectionSelectedItemCount(
  section: CompanyContentSectionDefinition,
  selection: CompanyImportSelection,
  contents: CompanyContents
): number {
  return listCompanyContentSectionItems(contents, section).reduce(
    (count, entry) => count + (isSelectionItemChecked(selection[entry.kind], entry.item.path) ? 1 : 0),
    0
  );
}

function formatImportSelectionItemPath(item: CompanyContentItem, kind: CompanyContentKey): string {
  if (kind === "issues") {
    return `Paperclip issue • ${item.path}`;
  }

  if (kind === "tasks" && item.recurring) {
    return `Recurring task • ${item.path}`;
  }

  return item.path;
}

function formatRequirementSourcesHint(
  sources: Array<{ kind: CompanyContentKey; item: CompanyContentItem }>
): string | null {
  if (sources.length === 0) {
    return null;
  }

  const names = sources.map((source) => `"${source.item.name}"`);
  if (names.length === 1) {
    return `Required by ${names[0]}.`;
  }

  if (names.length === 2) {
    return `Required by ${names[0]} and ${names[1]}.`;
  }

  return `Required by ${names[0]}, ${names[1]}, and ${names.length - 2} other selected items.`;
}

function isSectionDeselectReadOnly(
  section: CompanyContentSectionDefinition,
  selection: CompanyImportSelection,
  contents: CompanyContents
): boolean {
  const currentSelectedCount = getSectionSelectedItemCount(section, selection, contents);
  if (currentSelectedCount === 0) {
    return false;
  }

  const nextSelection = resolveCompanyImportSelection(contents, {
    ...selection,
    ...Object.fromEntries(section.contentKeys.map((key) => [key, { mode: "none" }]))
  });

  return listCompanyContentSectionItems(contents, section).every(({ kind, item }) =>
    isSelectionItemChecked(selection[kind], item.path) ===
    isSelectionItemChecked(nextSelection[kind], item.path)
  );
}

interface PaperclipCompanyRecord {
  id?: string;
  name?: string;
  issuePrefix?: string | null;
}

interface PaperclipIssueSnapshot {
  id?: string;
  identifier?: string | null;
  title?: string | null;
  status?: string | null;
  assigneeAgentId?: string | null;
}

interface PaperclipAgentSnapshot {
  id?: string;
  name?: string | null;
  urlKey?: string | null;
  status?: string | null;
  role?: string | null;
  title?: string | null;
}

interface PaperclipApprovalRecord {
  id?: string;
}

interface PaperclipRoutineSnapshot extends ImportedRoutineSnapshot {}

interface ImportTargetCompany {
  id: string;
  name: string;
  issuePrefix: string | null;
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

function normalizeImportTargetCompanies(value: unknown): ImportTargetCompany[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalizedCompanies: ImportTargetCompany[] = [];
  const seenCompanyIds = new Set<string>();

  for (const candidate of value) {
    if (!isRecord(candidate)) {
      continue;
    }

    const companyId = typeof candidate.id === "string" && candidate.id.trim()
      ? candidate.id.trim()
      : null;
    const companyName = typeof candidate.name === "string" && candidate.name.trim()
      ? candidate.name.trim()
      : null;
    const issuePrefix = typeof candidate.issuePrefix === "string" && candidate.issuePrefix.trim()
      ? candidate.issuePrefix.trim()
      : null;

    if (!companyId || !companyName || seenCompanyIds.has(companyId)) {
      continue;
    }

    seenCompanyIds.add(companyId);
    normalizedCompanies.push({
      id: companyId,
      name: companyName,
      issuePrefix
    });
  }

  return normalizedCompanies.sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { sensitivity: "base" })
  );
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

function hasSelectedImportItems(selection: CompanyImportPartSelection): boolean {
  if (selection.mode === "all") {
    return true;
  }

  if (selection.mode === "selected") {
    return (selection.itemPaths?.length ?? 0) > 0;
  }

  return false;
}

function normalizePaperclipSlug(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || null;
}

function getSelectedCompanyContentSlugs(
  items: CompanyContentItem[],
  selection: CompanyImportPartSelection
): Set<string> {
  const selectedSlugs = new Set<string>();

  if (selection.mode === "all") {
    for (const item of items) {
      const slug = normalizePaperclipSlug(item.path.split("/").filter(Boolean).at(-2));
      if (slug) {
        selectedSlugs.add(slug);
      }
    }

    return selectedSlugs;
  }

  if (selection.mode === "selected") {
    for (const itemPath of selection.itemPaths ?? []) {
      const slug = normalizePaperclipSlug(itemPath.split("/").filter(Boolean).at(-2));
      if (slug) {
        selectedSlugs.add(slug);
      }
    }
  }

  return selectedSlugs;
}

function buildAdapterOverridesFromPresets(
  adapterPresets: AdapterPreset[],
  selectedAgentSlugs: Set<string>,
  selection: ImportAdapterPresetSelection
): Record<string, { adapterType: string; adapterConfig?: Record<string, unknown> }> | undefined {
  const presetsById = new Map(adapterPresets.map((preset) => [preset.id, preset]));
  const overrides: Record<string, { adapterType: string; adapterConfig?: Record<string, unknown> }> = {};

  for (const agentSlug of selectedAgentSlugs) {
    const presetId = Object.prototype.hasOwnProperty.call(selection.agentPresetIds, agentSlug)
      ? selection.agentPresetIds[agentSlug]
      : selection.defaultPresetId;
    if (!presetId) {
      continue;
    }

    const preset = presetsById.get(presetId);
    if (!preset) {
      continue;
    }

    overrides[agentSlug] = {
      adapterType: preset.adapterType,
      ...(Object.keys(preset.adapterConfig).length > 0
        ? { adapterConfig: preset.adapterConfig }
        : {})
    };
  }

  return Object.keys(overrides).length > 0 ? overrides : undefined;
}

function normalizePaperclipAgentSnapshots(value: unknown): Array<{
  id: string;
  name: string;
  urlKey: string | null;
  status: string | null;
  role: string | null;
  title: string | null;
}> {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalizedAgents: Array<{
    id: string;
    name: string;
    urlKey: string | null;
    status: string | null;
    role: string | null;
    title: string | null;
  }> = [];

  for (const candidate of value) {
    if (!isRecord(candidate)) {
      continue;
    }

    const id =
      typeof candidate.id === "string" && candidate.id.trim()
        ? candidate.id.trim()
        : null;
    const name =
      typeof candidate.name === "string" && candidate.name.trim()
        ? candidate.name.trim()
        : null;

    if (!id || !name) {
      continue;
    }

    normalizedAgents.push({
      id,
      name,
      urlKey:
        typeof candidate.urlKey === "string" && candidate.urlKey.trim()
          ? candidate.urlKey.trim()
          : null,
      status:
        typeof candidate.status === "string" && candidate.status.trim()
          ? candidate.status.trim()
          : null,
      role:
        typeof candidate.role === "string" && candidate.role.trim()
          ? candidate.role.trim()
          : null,
      title:
        typeof candidate.title === "string" && candidate.title.trim()
          ? candidate.title.trim()
          : null
    });
  }

  return normalizedAgents;
}

function normalizePaperclipRoutineSnapshots(value: unknown): PaperclipRoutineSnapshot[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalizedRoutines: PaperclipRoutineSnapshot[] = [];

  for (const candidate of value) {
    if (!isRecord(candidate)) {
      continue;
    }

    const id =
      typeof candidate.id === "string" && candidate.id.trim()
        ? candidate.id.trim()
        : null;
    if (!id) {
      continue;
    }

    normalizedRoutines.push({
      id,
      title:
        typeof candidate.title === "string" && candidate.title.trim()
          ? candidate.title.trim()
          : null,
      description:
        typeof candidate.description === "string" && candidate.description.trim()
          ? candidate.description.trim()
          : null,
      status:
        typeof candidate.status === "string" && candidate.status.trim()
          ? candidate.status.trim()
          : null,
      createdAt:
        typeof candidate.createdAt === "string" && candidate.createdAt.trim()
          ? candidate.createdAt.trim()
          : null,
      updatedAt:
        typeof candidate.updatedAt === "string" && candidate.updatedAt.trim()
          ? candidate.updatedAt.trim()
          : null
    });
  }

  return normalizedRoutines;
}

function buildPaperclipImportInclude(
  selection: CompanyImportSelection,
  targetMode: ImportTargetMode,
  includeIssues: boolean
): {
  company: boolean;
  agents: boolean;
  projects: boolean;
  issues: boolean;
  skills: boolean;
} {
  return {
    company: targetMode === "new_company" && !includeIssues,
    agents: !includeIssues && hasSelectedImportItems(selection.agents),
    projects: !includeIssues && hasSelectedImportItems(selection.projects),
    issues:
      includeIssues
      && (
        hasSelectedImportItems(selection.tasks)
        || hasSelectedImportItems(selection.issues)
      ),
    skills: !includeIssues && hasSelectedImportItems(selection.skills)
  };
}

function hasEnabledPaperclipImportStage(include: {
  company: boolean;
  agents: boolean;
  projects: boolean;
  issues: boolean;
  skills: boolean;
}): boolean {
  return include.company || include.agents || include.projects || include.issues || include.skills;
}

function mergePaperclipImportWarnings(...values: unknown[]): string[] {
  const lines: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    for (const line of getStructuredMessageLines(value, 8)) {
      if (seen.has(line)) {
        continue;
      }

      seen.add(line);
      lines.push(line);
    }
  }

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

async function archiveDuplicateImportedRoutines(
  companyId: string,
  source: CatalogPreparedCompanyImport["source"]
): Promise<string[]> {
  const recurringTasks = extractPortableRecurringTaskDefinitions(source.files);
  if (recurringTasks.length === 0) {
    return [];
  }

  const routines = normalizePaperclipRoutineSnapshots(
    await fetchHostJson<unknown>(`/api/companies/${encodeURIComponent(companyId)}/routines`)
  );
  const routineIdsToArchive = findArchivableImportedRoutineIds(recurringTasks, routines);
  const warnings: string[] = [];

  for (const routineId of routineIdsToArchive) {
    try {
      await fetchHostJson(`/api/routines/${encodeURIComponent(routineId)}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "archived"
        })
      });
    } catch (error) {
      warnings.push(
        `Imported routine duplicate cleanup failed for ${routineId}: ${getErrorMessage(error)}`
      );
    }
  }

  return warnings;
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

function getImportedCompanyLabel(company: CatalogImportedCompanySummary): string | null {
  return company.importedCompany.issuePrefix?.trim() || company.importedCompany.name.trim();
}

function getImportButtonLabel(
  importState: ImportState | null,
  companyId: string,
  idleLabel = "Import..."
): string {
  if (importState?.companyId !== companyId) {
    return idleLabel;
  }

  return importState.kind === "preparing" ? "Preparing..." : "Importing...";
}

function cloneCompanyImportSelection(selection: CompanyImportSelection): CompanyImportSelection {
  return {
    agents: {
      mode: selection.agents.mode,
      ...(selection.agents.itemPaths ? { itemPaths: [...selection.agents.itemPaths] } : {})
    },
    projects: {
      mode: selection.projects.mode,
      ...(selection.projects.itemPaths ? { itemPaths: [...selection.projects.itemPaths] } : {})
    },
    tasks: {
      mode: selection.tasks.mode,
      ...(selection.tasks.itemPaths ? { itemPaths: [...selection.tasks.itemPaths] } : {})
    },
    issues: {
      mode: selection.issues.mode,
      ...(selection.issues.itemPaths ? { itemPaths: [...selection.issues.itemPaths] } : {})
    },
    skills: {
      mode: selection.skills.mode,
      ...(selection.skills.itemPaths ? { itemPaths: [...selection.skills.itemPaths] } : {})
    }
  };
}

function createDefaultImportAdapterPresetSelection(): ImportAdapterPresetSelection {
  return {
    defaultPresetId: null,
    agentPresetIds: {}
  };
}

function cloneImportAdapterPresetSelection(
  selection: ImportAdapterPresetSelection | null | undefined
): ImportAdapterPresetSelection {
  if (!selection) {
    return createDefaultImportAdapterPresetSelection();
  }

  return {
    defaultPresetId: selection.defaultPresetId ?? null,
    agentPresetIds: { ...selection.agentPresetIds }
  };
}

function isSelectionItemChecked(
  selection: CompanyImportPartSelection,
  itemPath: string
): boolean {
  if (selection.mode === "all") {
    return true;
  }

  if (selection.mode === "none") {
    return false;
  }

  return selection.itemPaths?.includes(itemPath) ?? false;
}

function normalizeSelectionPartFromItemPaths(
  itemPaths: string[],
  items: CompanyContentItem[]
): CompanyImportPartSelection {
  const normalizedItemPaths = [...new Set(itemPaths)].filter((itemPath) =>
    items.some((item) => item.path === itemPath)
  );

  if (normalizedItemPaths.length === 0) {
    return { mode: "none" };
  }

  return {
    mode: "selected",
    itemPaths: normalizedItemPaths
  };
}

function toggleCompanyImportSelectionPart(
  selection: CompanyImportSelection,
  keys: CompanyContentKey[],
  enabled: boolean,
  contents: CompanyContents
): CompanyImportSelection {
  const nextSelection = {
    ...selection
  };

  for (const key of keys) {
    nextSelection[key] = enabled ? { mode: "all" } : { mode: "none" };
  }

  return resolveCompanyImportSelection(contents, nextSelection);
}

function toggleCompanyImportSelectionItem(
  selection: CompanyImportSelection,
  key: CompanyContentKey,
  itemPath: string,
  checked: boolean,
  items: CompanyContentItem[],
  contents: CompanyContents
): CompanyImportSelection {
  const currentPartSelection = selection[key];
  const currentItemPaths =
    currentPartSelection.mode === "all"
      ? items.map((item) => item.path)
      : currentPartSelection.mode === "selected"
        ? [...(currentPartSelection.itemPaths ?? [])]
        : [];

  const nextItemPaths = checked
    ? [...currentItemPaths, itemPath]
    : currentItemPaths.filter((currentPath) => currentPath !== itemPath);

  return resolveCompanyImportSelection(contents, {
    ...selection,
    [key]: normalizeSelectionPartFromItemPaths(nextItemPaths, items)
  });
}

function buildSelectionPartSummary(
  section: CompanyContentSectionDefinition,
  selection: CompanyImportSelection,
  contents: CompanyContents
): string {
  const itemCount = getCompanyContentSectionItemCount(contents, section);
  const selectedCount = getSectionSelectedItemCount(section, selection, contents);

  if (selectedCount === 0) {
    return `${section.label}: excluded`;
  }

  if (selectedCount === itemCount) {
    return `${section.label}: all ${selectedCount} selected`;
  }

  return `${section.label}: ${selectedCount} of ${itemCount} selected`;
}

function buildCompanyImportSelectionSummary(
  selection: CompanyImportSelection,
  contents: CompanyContents
): string {
  return getVisibleCompanyContentSections(contents)
    .map((section) => buildSelectionPartSummary(section, selection, contents))
    .join(" • ");
}

function ExistingCompanyImportMenu(props: {
  availableTargets: ImportTargetCompany[];
  errorText: string | null;
  isDisabled: boolean;
  isLoading: boolean;
  onSelect(target: ImportTargetCompany): void;
  optionTestId?: string;
  triggerTestId?: string;
}): React.JSX.Element {
  const {
    availableTargets,
    errorText,
    isDisabled,
    isLoading,
    onSelect,
    optionTestId = "company-import-target-option",
    triggerTestId = "company-import-existing-trigger"
  } = props;
  const [isOpen, setIsOpen] = useState(false);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [menuPosition, setMenuPosition] = useState({
    left: 12,
    top: 12,
    minWidth: 240
  });
  const hasTargets = availableTargets.length > 0;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const updateMenuPosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) {
        return;
      }

      const rect = trigger.getBoundingClientRect();
      const minWidth = Math.max(240, Math.round(rect.width));
      const maxLeft = Math.max(12, window.innerWidth - minWidth - 12);
      const left = Math.min(Math.max(12, rect.right - minWidth), maxLeft);
      const top = Math.min(rect.bottom + 6, Math.max(12, window.innerHeight - 12));

      setMenuPosition({
        left,
        top,
        minWidth
      });
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (shellRef.current && event.target instanceof Node && shellRef.current.contains(event.target)) {
        return;
      }

      setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!hasTargets) {
      setIsOpen(false);
    }
  }, [hasTargets]);

  useEffect(() => {
    if (isDisabled || isLoading) {
      setIsOpen(false);
    }
  }, [isDisabled, isLoading]);

  return (
    <div className="agent-companies-settings__menu-shell" ref={shellRef}>
      <button
        aria-expanded={isOpen}
        className="agent-companies-settings__button"
        data-testid={triggerTestId}
        disabled={isDisabled || isLoading || !hasTargets}
        onClick={() => setIsOpen((currentOpen) => !currentOpen)}
        title={
          isLoading
            ? "Loading non-synced companies..."
            : errorText
              ? errorText
              : !hasTargets
                ? "No non-synced companies are available."
                : undefined
        }
        ref={triggerRef}
        type="button"
      >
        Import into...
      </button>
      {isOpen ? (
        <div
          className="agent-companies-settings__menu"
          data-testid="company-import-target-menu"
          role="menu"
          style={{
            left: menuPosition.left,
            minWidth: menuPosition.minWidth,
            top: menuPosition.top
          }}
        >
          {availableTargets.map((target) => (
            <button
              className="agent-companies-settings__menu-item"
              data-testid={optionTestId}
              key={target.id}
              onClick={() => {
                setIsOpen(false);
                onSelect(target);
              }}
              role="menuitem"
              type="button"
            >
              <span className="agent-companies-settings__menu-item-title">{target.name}</span>
              <span className="agent-companies-settings__menu-item-meta">
                {target.issuePrefix ? `Issue prefix ${target.issuePrefix}` : "Existing non-synced company"}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CompanyImportActions(props: {
  availableTargets: ImportTargetCompany[];
  companyId: string;
  errorText: string | null;
  importState: ImportState | null;
  isDisabled: boolean;
  isLoadingTargets: boolean;
  newTriggerTestId?: string;
  onImportAsNew(companyId: string): void;
  onImportInto(companyId: string, target: ImportTargetCompany): void;
  optionTestId?: string;
  triggerTestId?: string;
}): React.JSX.Element {
  const {
    availableTargets,
    companyId,
    errorText,
    importState,
    isDisabled,
    isLoadingTargets,
    newTriggerTestId = "company-import-new-trigger",
    onImportAsNew,
    onImportInto,
    optionTestId,
    triggerTestId
  } = props;

  return (
    <>
      <button
        className="agent-companies-settings__button agent-companies-settings__button--primary"
        data-testid={newTriggerTestId}
        disabled={isDisabled}
        onClick={() => onImportAsNew(companyId)}
        type="button"
      >
        {getImportButtonLabel(importState, companyId, "Import as new company")}
      </button>
      <ExistingCompanyImportMenu
        availableTargets={availableTargets}
        errorText={errorText}
        isDisabled={isDisabled}
        isLoading={isLoadingTargets}
        onSelect={(target) => onImportInto(companyId, target)}
        optionTestId={optionTestId}
        triggerTestId={triggerTestId}
      />
    </>
  );
}

function getSyncButtonLabel(
  syncState: SyncState | null,
  company: CatalogImportedCompanySummary
): string {
  if (!company.importedCompany.isSyncAvailable) {
    return "Up to date";
  }

  return syncState?.sourceCompanyId === company.sourceCompanyId
    && syncState.importedCompanyId === company.importedCompany.id
    ? "Syncing..."
    : "Sync now";
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

function formatAutoSyncCadenceLabel(hours: number): string {
  return hours === 1 ? "every hour" : `every ${hours} hours`;
}

function getCompanySyncSummary(
  company: CatalogImportedCompanySummary,
  autoSyncCadenceHours: number
): string | null {
  const { importedCompany } = company;
  const parts: string[] = [];
  const cadenceLabel = formatAutoSyncCadenceLabel(autoSyncCadenceHours);
  const versionInfo = getImportedCompanyVersionInfo(
    importedCompany.importedSourceVersion,
    importedCompany.latestSourceVersion
  );

  if (versionInfo.summaryText) {
    parts.push(versionInfo.summaryText);
  }

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
        ? `Auto-sync ${cadenceLabel} watching for new versions`
        : importedCompany.isAutoSyncDue
          ? `Auto-sync due now (${cadenceLabel})`
          : `Next auto-sync ${formatTimestamp(importedCompany.nextAutoSyncAt, "pending")} (${cadenceLabel})`
    );
  } else {
    parts.push("Auto-sync paused");
  }

  parts.push(
    importedCompany.syncCollisionStrategy === "replace"
      ? "Overwrite mode"
      : `${importedCompany.syncCollisionStrategy} mode`
  );

  return parts.join(" • ");
}

function getCompanySyncError(company: CatalogImportedCompanySummary): string | null {
  if (company.importedCompany.syncStatus !== "failed") {
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
  section: CompanyContentSectionDefinition,
  contents: CompanyContents
): string {
  const count = getCompanyContentSectionItemCount(contents, section);
  if (section.id === "tasks") {
    const recurringTaskCount = getRecurringTaskCount(contents);
    const issueCount = contents.issues.length;
    const noteParts: string[] = [];
    if (recurringTaskCount > 0) {
      noteParts.push(formatContentCount(recurringTaskCount, "recurring task", "recurring tasks"));
    }
    if (issueCount > 0) {
      noteParts.push(formatContentCount(issueCount, "Paperclip issue", "Paperclip issues"));
    }
    if (noteParts.length > 0) {
      return noteParts.join(" • ");
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

  if (kind === "issues") {
    badges.push({
      label: "Paperclip issue"
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
  const parts = getVisibleCompanyContentSections(contents).flatMap((section) => {
    const count = getCompanyContentSectionItemCount(contents, section);
    if (section.id !== "tasks") {
      return [formatContentCount(count, section.singular, section.plural)];
    }

    const recurringTaskCount = getRecurringTaskCount(contents);
    const issueCount = contents.issues.length;
    const oneTimeTaskCount = contents.tasks.length - recurringTaskCount;
    const taskParts: string[] = [];

    if (oneTimeTaskCount > 0) {
      taskParts.push(formatContentCount(oneTimeTaskCount, "task", "tasks"));
    }

    if (recurringTaskCount > 0) {
      taskParts.push(formatContentCount(recurringTaskCount, "recurring task", "recurring tasks"));
    }

    if (issueCount > 0) {
      taskParts.push(formatContentCount(issueCount, "Paperclip issue", "Paperclip issues"));
    }

    return taskParts.length > 0
      ? taskParts
      : [formatContentCount(count, section.singular, section.plural)];
  });

  return parts.length > 0 ? parts.join(" • ") : "No structured contents detected";
}

function ToggleSwitch(props: {
  ariaLabel?: string;
  checked: boolean;
  disabled?: boolean;
  onChange(checked: boolean): void;
  testId?: string;
}): React.JSX.Element {
  const { ariaLabel, checked, disabled = false, onChange, testId } = props;

  return (
    <input
      aria-label={ariaLabel}
      checked={checked}
      className="agent-companies-settings__switch-input"
      data-testid={testId}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
      type="checkbox"
    />
  );
}

function getDefaultCompanyContentSelection(
  company: CatalogCompanySummary
): CompanyContentSelection | null {
  for (const section of getVisibleCompanyContentSections(company.contents)) {
    const firstItem = listCompanyContentSectionItems(company.contents, section)[0];
    if (firstItem) {
      return {
        kind: firstItem.kind,
        item: firstItem.item
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

  for (const section of getVisibleCompanyContentSections(company.contents)) {
    const match = listCompanyContentSectionItems(company.contents, section).find(
      (candidate) => candidate.item.path === itemPath
    );
    if (match) {
      return {
        kind: match.kind,
        item: match.item
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
  const contentValues = getVisibleCompanyContentSections(company.contents).flatMap((section) =>
    listCompanyContentSectionItems(company.contents, section).flatMap(({ item, kind }) => [
      item.name,
      item.path,
      kind === "issues" ? "paperclip issue" : "",
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
  autoSyncCadenceHours: number;
  company: CatalogImportedCompanySummary;
  isBusy: boolean;
  syncState: SyncState | null;
  onSync(sourceCompanyId: string, importedCompanyId: string): void;
  onToggleAutoSync(sourceCompanyId: string, importedCompanyId: string, enabled: boolean): void;
}): React.JSX.Element {
  const { autoSyncCadenceHours, company, isBusy, syncState, onSync, onToggleAutoSync } = props;
  const syncSummary = getCompanySyncSummary(company, autoSyncCadenceHours);
  const syncError = getCompanySyncError(company);
  const isSyncAvailable = company.importedCompany.isSyncAvailable;
  const isSyncButtonDisabled = isBusy || !isSyncAvailable;

  return (
    <div className="agent-companies-settings__company-sync">
      <div className="agent-companies-settings__company-sync-row">
        <button
          className="agent-companies-settings__button agent-companies-settings__button--primary"
          data-testid="company-sync-trigger"
          disabled={isSyncButtonDisabled}
          onClick={() => void onSync(company.sourceCompanyId, company.importedCompany.id)}
          type="button"
        >
          {getSyncButtonLabel(syncState, company)}
        </button>
        <label className="agent-companies-settings__switch-field">
          <span>Auto-sync</span>
          <ToggleSwitch
            checked={company.importedCompany.autoSyncEnabled}
            disabled={isBusy}
            onChange={(checked) =>
              void onToggleAutoSync(
                company.sourceCompanyId,
                company.importedCompany.id,
                checked
              )}
            testId="company-auto-sync-toggle"
          />
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

function DiscoveredCompanyCard(props: {
  availableImportTargets: ImportTargetCompany[];
  company: CatalogCompanySummary;
  importTargetError: string | null;
  importTargetsLoading: boolean;
  importState: ImportState | null;
  isImportDisabled: boolean;
  onOpenContents(companyId: string): void;
  onOpenImportAsNew(companyId: string): void;
  onOpenImportInto(companyId: string, target: ImportTargetCompany): void;
}): React.JSX.Element {
  const {
    availableImportTargets,
    company,
    importTargetError,
    importTargetsLoading,
    importState,
    isImportDisabled,
    onOpenContents,
    onOpenImportAsNew,
    onOpenImportInto
  } = props;
  const importedCompanyCount = company.importedCompanies.length;

  return (
    <article className="agent-companies-settings__company-card" data-testid="company-card">
      <div className="agent-companies-settings__company-top">
        <div>
          <h3 className="agent-companies-settings__company-title">{company.name}</h3>
          <div className="agent-companies-settings__company-path">Manifest: {company.manifestPath}</div>
        </div>
        <div className="agent-companies-settings__company-actions">
          {company.version || importedCompanyCount > 0 ? (
            <div className="agent-companies-settings__badge-row">
              {company.version ? (
                <span className="agent-companies-settings__badge">Version {company.version}</span>
              ) : null}
              {importedCompanyCount > 0 ? (
                <span className="agent-companies-settings__badge">
                  {importedCompanyCount} imported {importedCompanyCount === 1 ? "company" : "companies"}
                </span>
              ) : null}
            </div>
          ) : null}
          <CompanyImportActions
            availableTargets={availableImportTargets}
            companyId={company.id}
            errorText={importTargetError}
            importState={importState}
            isDisabled={isImportDisabled}
            isLoadingTargets={importTargetsLoading}
            onImportAsNew={onOpenImportAsNew}
            onImportInto={onOpenImportInto}
          />
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

function ImportedCompanyCard(props: {
  autoSyncCadenceHours: number;
  company: CatalogImportedCompanySummary;
  importState: ImportState | null;
  isSyncDisabled: boolean;
  syncState: SyncState | null;
  onOpenContents(companyId: string): void;
  onOpenReimport(sourceCompanyId: string, importedCompanyId: string): void;
  onSync(sourceCompanyId: string, importedCompanyId: string): void;
  onToggleAutoSync(sourceCompanyId: string, importedCompanyId: string, enabled: boolean): void;
}): React.JSX.Element {
  const {
    autoSyncCadenceHours,
    company,
    importState,
    isSyncDisabled,
    syncState,
    onOpenContents,
    onOpenReimport,
    onSync,
    onToggleAutoSync
  } = props;
  const importedCompanyLabel = getImportedCompanyLabel(company);
  const versionInfo = getImportedCompanyVersionInfo(
    company.importedCompany.importedSourceVersion,
    company.importedCompany.latestSourceVersion
  );

  return (
    <article className="agent-companies-settings__company-card" data-testid="imported-company-card">
      <div className="agent-companies-settings__company-top">
        <div>
          <h3 className="agent-companies-settings__company-title">{company.importedCompany.name}</h3>
          <div className="agent-companies-settings__company-path">
            Source: {company.name} • Manifest: {company.manifestPath}
          </div>
        </div>
        <div className="agent-companies-settings__company-actions">
          <div className="agent-companies-settings__badge-row">
            <span className="agent-companies-settings__badge agent-companies-settings__badge--accent">
              {company.repositoryLabel}
            </span>
            {versionInfo.importedBadgeText ? (
              <span className="agent-companies-settings__badge">{versionInfo.importedBadgeText}</span>
            ) : null}
            {versionInfo.latestBadgeText ? (
              <span className="agent-companies-settings__badge">{versionInfo.latestBadgeText}</span>
            ) : null}
            {importedCompanyLabel ? (
              <span className="agent-companies-settings__badge">Target {importedCompanyLabel}</span>
            ) : null}
          </div>
          <button
            className="agent-companies-settings__button agent-companies-settings__button--primary"
            data-testid="imported-company-reimport-trigger"
            disabled={isSyncDisabled}
            onClick={() => onOpenReimport(company.sourceCompanyId, company.importedCompany.id)}
            type="button"
          >
            {getImportButtonLabel(
              importState,
              company.sourceCompanyId,
              "Re-import / Edit selection"
            )}
          </button>
          <button
            className="agent-companies-settings__button"
            data-testid="imported-company-details-trigger"
            onClick={() => onOpenContents(company.sourceCompanyId)}
            type="button"
          >
            View source contents
          </button>
        </div>
      </div>
      {company.description ? (
        <p className="agent-companies-settings__company-description">{company.description}</p>
      ) : null}
      <p className="agent-companies-settings__company-summary">
        {buildCompanyContentSummary(company.contents)}
      </p>
      <p className="agent-companies-settings__company-summary">
        Sync contract: {buildCompanyImportSelectionSummary(company.importedCompany.selection, company.contents)}
      </p>
      <ImportedCompanySyncControls
        autoSyncCadenceHours={autoSyncCadenceHours}
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
  availableImportTargets: ImportTargetCompany[];
  company: CatalogCompanySummary;
  importTargetError: string | null;
  importTargetsLoading: boolean;
  importState: ImportState | null;
  isImportDisabled: boolean;
  onClose(): void;
  onOpenImportAsNew(companyId: string): void;
  onOpenImportInto(companyId: string, target: ImportTargetCompany): void;
}): React.JSX.Element {
  const {
    availableImportTargets,
    company,
    importTargetError,
    importTargetsLoading,
    importState,
    isImportDisabled,
    onClose,
    onOpenImportAsNew,
    onOpenImportInto
  } = props;
  const [selectedItemPath, setSelectedItemPath] = useState<string | null>(
    getDefaultCompanyContentSelection(company)?.item.path ?? null
  );
  const visibleSections = getVisibleCompanyContentSections(company.contents);
  const selectedSelection = findCompanyContentSelection(company, selectedItemPath);
  const selectedSection = selectedSelection
    ? getCompanyContentSectionForKey(selectedSelection.kind)
    : null;
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
            <CompanyImportActions
              availableTargets={availableImportTargets}
              companyId={company.id}
              errorText={importTargetError}
              importState={importState}
              isDisabled={isImportDisabled}
              isLoadingTargets={importTargetsLoading}
              newTriggerTestId="company-details-import-new-trigger"
              onImportAsNew={onOpenImportAsNew}
              onImportInto={onOpenImportInto}
              optionTestId="company-details-import-target-option"
              triggerTestId="company-details-import-existing-trigger"
            />
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
            {company.importedCompanies.length > 0 ? (
              <span className="agent-companies-settings__badge">
                {company.importedCompanies.length} imported {company.importedCompanies.length === 1 ? "company" : "companies"}
              </span>
            ) : null}
            <span className="agent-companies-settings__badge">Manifest: {company.manifestPath}</span>
          </div>
          {company.description ? (
            <div className="agent-companies-settings__notice">{company.description}</div>
          ) : null}
        </div>

        <div className="agent-companies-settings__dialog-summary">
          {visibleSections.map((section) => {
            const count = getCompanyContentSectionItemCount(company.contents, section);

            return (
              <div
                className="agent-companies-settings__dialog-stat"
                data-testid={`company-details-count-${section.id}`}
                key={section.id}
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
            {visibleSections.map((section) => {
              const items = listCompanyContentSectionItems(company.contents, section);

              return (
                <section className="agent-companies-settings__dialog-nav-group" key={section.id}>
                  <div className="agent-companies-settings__dialog-nav-head">
                    <h3 className="agent-companies-settings__dialog-nav-title">{section.label}</h3>
                    <span className="agent-companies-settings__badge">
                      {formatContentCount(items.length, section.singular, section.plural)}
                    </span>
                  </div>
                  {items.length > 0 ? (
                    <ul className="agent-companies-settings__dialog-nav-list">
                      {items.map(({ kind, item }) => {
                        const isActive = selectedSelection?.item.path === item.path;
                        const badges = getCompanyContentItemBadges(item, kind);

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
                                {renderCompanyContentItemIcon(item, kind)}
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
  adapterPresets: AdapterPreset[];
  company: CatalogCompanySummary;
  dialogState: ImportDialogState;
  errorText: string | null;
  importState: ImportState | null;
  onChangeAgentAdapterPreset(agentSlug: string, value: string): void;
  onChangeDefaultAdapterPreset(value: string): void;
  onChangeCollisionStrategy(value: CatalogSyncCollisionStrategy): void;
  onChangeCompanyName(value: string): void;
  onClose(): void;
  onToggleItem(key: CompanyContentKey, itemPath: string, checked: boolean): void;
  onTogglePart(keys: CompanyContentKey[], enabled: boolean): void;
  onSubmit(event: FormEvent<HTMLFormElement>): Promise<void>;
}): React.JSX.Element {
  const {
    adapterPresets,
    company,
    dialogState,
    errorText,
    importState,
    onChangeAgentAdapterPreset,
    onChangeDefaultAdapterPreset,
    onChangeCollisionStrategy,
    onChangeCompanyName,
    onClose,
    onToggleItem,
    onTogglePart,
    onSubmit
  } = props;
  const isBusy = importState !== null;
  const isReimport = dialogState.targetMode === "existing_import";
  const isExistingCompanyImport = dialogState.targetMode === "existing_company";
  const selectionSummary = buildCompanyImportSelectionSummary(dialogState.selection, company.contents);
  const visibleSections = getVisibleCompanyContentSections(company.contents);
  const requirementLookup = getCompanyContentItemRequirementLookup(
    company.contents,
    dialogState.selection
  );
  const selectedAgents = company.contents.agents
    .map((item) => ({
      item,
      slug: normalizePaperclipSlug(item.path.split("/").filter(Boolean).at(-2))
    }))
    .filter((entry): entry is { item: CompanyContentItem; slug: string } =>
      Boolean(entry.slug) && isSelectionItemChecked(dialogState.selection.agents, entry.item.path)
    );

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
              {isReimport
                ? "Update the saved sync contract for this tracked imported company by re-importing the selected contents."
                : isExistingCompanyImport
                  ? `Import the selected contents into "${dialogState.targetCompanyName}" and start tracking it for future sync.`
                  : "Create a new Paperclip company from the selected contents, then pick which contents should be included."}
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
            {isReimport ? (
              <span className="agent-companies-settings__badge">Tracked import</span>
            ) : null}
          </div>
          <div className="agent-companies-settings__notice">
            {buildCompanyContentSummary(company.contents)}
          </div>
        </div>

        <form className="agent-companies-settings__dialog-form" onSubmit={(event) => void onSubmit(event)}>
          <div
            className="agent-companies-settings__dialog-form-scroll"
            data-testid="company-import-form-scroll"
          >
            {dialogState.targetMode !== "new_company" ? (
              <div className="agent-companies-settings__notice">
                Target: {dialogState.targetCompanyName}
              </div>
            ) : null}

            {dialogState.targetMode === "new_company" ? (
              <>
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
                  value={dialogState.companyName}
                />
              </>
            ) : null}

            <fieldset>
              <legend className="agent-companies-settings__metric-label">Contents</legend>
              <p className="agent-companies-settings__metric-note">
                Required agents and projects are included automatically when selected tasks depend on
                them, including Paperclip issue manifests grouped under Tasks.
              </p>
              <div className="agent-companies-settings__selection-list">
                {visibleSections.map((section) => {
                  const items = listCompanyContentSectionItems(company.contents, section);
                  const selectedCount = getSectionSelectedItemCount(
                    section,
                    dialogState.selection,
                    company.contents
                  );
                  const requiredCount = items.reduce(
                    (count, { item }) => count + (requirementLookup.has(item.path) ? 1 : 0),
                    0
                  );
                  const sectionToggleReadOnly =
                    !isBusy && isSectionDeselectReadOnly(section, dialogState.selection, company.contents);
                  const sectionHint =
                    requiredCount > 0
                      ? `${requiredCount} required ${requiredCount === 1 ? "item is" : "items are"} locked in by selected work items.`
                      : null;

                  return (
                    <section className="agent-companies-settings__selection-group" key={section.id}>
                      <label
                        className={[
                          "agent-companies-settings__selection-part",
                          sectionToggleReadOnly
                            ? "agent-companies-settings__selection-part--readonly"
                            : ""
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        <div className="agent-companies-settings__selection-part-copy">
                          <span className="agent-companies-settings__selection-part-title">{section.label}</span>
                          <span className="agent-companies-settings__selection-part-summary">
                            {buildSelectionPartSummary(section, dialogState.selection, company.contents)}
                          </span>
                          {sectionHint ? (
                            <span className="agent-companies-settings__selection-part-hint">
                              {sectionHint}
                            </span>
                          ) : null}
                        </div>
                        <ToggleSwitch
                          checked={selectedCount > 0}
                          disabled={isBusy || sectionToggleReadOnly}
                          onChange={(checked) => onTogglePart(section.contentKeys, checked)}
                        />
                      </label>
                      {selectedCount > 0 && items.length > 0 ? (
                        <div className="agent-companies-settings__selection-items">
                          <div className="agent-companies-settings__selection-items-label">
                            Included {section.plural}
                          </div>
                          {items.map(({ kind, item }) => {
                            const requirementSources = requirementLookup.get(item.path) ?? [];
                            const itemRequired = requirementSources.length > 0;
                            const requirementHint = formatRequirementSourcesHint(requirementSources);

                            return (
                              <label
                                className={[
                                  "agent-companies-settings__selection-item",
                                  itemRequired ? "agent-companies-settings__selection-item--readonly" : ""
                                ]
                                  .filter(Boolean)
                                  .join(" ")}
                                key={item.path}
                              >
                                <div className="agent-companies-settings__selection-item-copy">
                                  <div className="agent-companies-settings__selection-item-head">
                                    <span className="agent-companies-settings__selection-item-title">{item.name}</span>
                                    {itemRequired ? (
                                      <span className="agent-companies-settings__selection-lock">
                                        <Lock aria-hidden="true" size={12} />
                                        Required
                                      </span>
                                    ) : null}
                                  </div>
                                  <span className="agent-companies-settings__selection-item-path">
                                    {formatImportSelectionItemPath(item, kind)}
                                  </span>
                                  {requirementHint ? (
                                    <span className="agent-companies-settings__selection-item-hint">
                                      {requirementHint}
                                    </span>
                                  ) : null}
                                </div>
                                <ToggleSwitch
                                  checked={isSelectionItemChecked(dialogState.selection[kind], item.path)}
                                  disabled={isBusy || itemRequired}
                                  onChange={(checked) => onToggleItem(kind, item.path, checked)}
                                />
                              </label>
                            );
                          })}
                          <div className="agent-companies-settings__selection-items-meta">
                            {selectedCount === items.length
                              ? `All ${items.length} selected.`
                              : `${selectedCount} of ${items.length} selected.`}
                          </div>
                        </div>
                      ) : null}
                    </section>
                  );
                })}
              </div>
            </fieldset>

            <fieldset>
              <legend className="agent-companies-settings__metric-label">Adapter Presets</legend>
              <p className="agent-companies-settings__metric-note">
                Adapter choices are saved with this import so later re-imports and syncs keep the same runtime mapping.
              </p>
              {adapterPresets.length === 0 ? (
                <div className="agent-companies-settings__notice">
                  Add adapter presets in settings before import if you want to override package defaults.
                </div>
              ) : (
                <div className="agent-companies-settings__adapter-grid">
                  <label className="agent-companies-settings__adapter-row">
                    <span className="agent-companies-settings__status-copy">
                      <span className="agent-companies-settings__status-title">Default adapter preset</span>
                      <span className="agent-companies-settings__status-body">Applied to selected agents without a per-agent override.</span>
                    </span>
                    <select
                      className="agent-companies-settings__input"
                      disabled={isBusy}
                      onChange={(event) => onChangeDefaultAdapterPreset(event.target.value)}
                      value={dialogState.adapterPresetSelection.defaultPresetId ?? "__package__"}
                    >
                      <option value="__package__">Keep package adapter</option>
                      {adapterPresets.map((preset) => (
                        <option key={preset.id} value={preset.id}>{preset.name}</option>
                      ))}
                    </select>
                  </label>
                  {selectedAgents.map(({ item, slug }) => {
                    const hasOverride = Object.prototype.hasOwnProperty.call(
                      dialogState.adapterPresetSelection.agentPresetIds,
                      slug
                    );
                    const selectedValue = hasOverride
                      ? dialogState.adapterPresetSelection.agentPresetIds[slug] ?? "__package__"
                      : "__default__";

                    return (
                      <label className="agent-companies-settings__adapter-row" key={slug}>
                        <span className="agent-companies-settings__status-copy">
                          <span className="agent-companies-settings__status-title">{item.name}</span>
                          <span className="agent-companies-settings__status-body">{slug}</span>
                        </span>
                        <select
                          className="agent-companies-settings__input"
                          disabled={isBusy}
                          onChange={(event) => onChangeAgentAdapterPreset(slug, event.target.value)}
                          value={selectedValue}
                        >
                          <option value="__default__">Use default preset</option>
                          <option value="__package__">Keep package adapter</option>
                          {adapterPresets.map((preset) => (
                            <option key={preset.id} value={preset.id}>{preset.name}</option>
                          ))}
                        </select>
                      </label>
                    );
                  })}
                </div>
              )}
            </fieldset>

            <fieldset>
              <legend className="agent-companies-settings__metric-label">Collision Handling</legend>
              <div className="agent-companies-settings__status-grid">
                {[
                  {
                    value: "replace" as const,
                    label: "Overwrite existing content",
                    description: "Preferred default for keeping the linked company aligned with the source."
                  },
                  {
                    value: "skip" as const,
                    label: "Skip collisions",
                    description: "Leave existing content in place when a matching item already exists."
                  },
                  {
                    value: "rename" as const,
                    label: "Rename collisions",
                    description: "Ask Paperclip to keep both copies when names conflict."
                  }
                ].map((option) => (
                  <label className="agent-companies-settings__status-row" key={option.value}>
                    <div className="agent-companies-settings__status-copy">
                      <span className="agent-companies-settings__status-title">{option.label}</span>
                      <span className="agent-companies-settings__status-body">{option.description}</span>
                    </div>
                    <input
                      checked={dialogState.collisionStrategy === option.value}
                      disabled={isBusy}
                      name="agent-companies-collision-strategy"
                      onChange={() => onChangeCollisionStrategy(option.value)}
                      type="radio"
                    />
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="agent-companies-settings__notice">
              Selected contents: {selectionSummary}
            </div>

            {errorText ? (
              <p className="agent-companies-settings__error">{errorText}</p>
            ) : null}
          </div>

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
              disabled={
                isBusy
                || (
                  dialogState.targetMode === "new_company"
                  && !dialogState.companyName.trim()
                )
              }
              type="submit"
            >
              {importState?.kind === "preparing"
                ? "Preparing..."
                : importState?.kind === "importing"
                  ? "Importing..."
                  : isReimport
                    ? "Re-import company"
                    : isExistingCompanyImport
                      ? "Import into company"
                    : "Import company"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CompanyGroupCard({
  availableImportTargets,
  repository,
  companies,
  importTargetError,
  importTargetsLoading,
  importState,
  isImportDisabled,
  onOpenContents,
  onOpenImportAsNew,
  onOpenImportInto
}: {
  availableImportTargets: ImportTargetCompany[];
  repository: CatalogRepositorySummary | null;
  companies: CatalogCompanySummary[];
  importTargetError: string | null;
  importTargetsLoading: boolean;
  importState: ImportState | null;
  isImportDisabled: boolean;
  onOpenContents(companyId: string): void;
  onOpenImportAsNew(companyId: string): void;
  onOpenImportInto(companyId: string, target: ImportTargetCompany): void;
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
          <DiscoveredCompanyCard
            availableImportTargets={availableImportTargets}
            company={company}
            importTargetError={importTargetError}
            importTargetsLoading={importTargetsLoading}
            importState={importState}
            isImportDisabled={isImportDisabled}
            key={company.id}
            onOpenContents={onOpenContents}
            onOpenImportAsNew={onOpenImportAsNew}
            onOpenImportInto={onOpenImportInto}
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
  const setAutoSyncCadence = usePluginAction("catalog.set-auto-sync-cadence");
  const setAdapterPresets = usePluginAction("catalog.set-adapter-presets");
  const addRepository = usePluginAction("catalog.add-repository");
  const removeRepository = usePluginAction("catalog.remove-repository");
  const scanRepository = usePluginAction("catalog.scan-repository");
  const scanAllRepositories = usePluginAction("catalog.scan-all-repositories");
  const updateBoardAccess = usePluginAction("board-access.update");
  const setPaperclipApiBase = usePluginAction("paperclip-runtime.set-api-base");
  const catalog = data ?? EMPTY_CATALOG;
  const boardAccessRequirement = usePaperclipBoardAccessRequirement();
  const [repositoryInput, setRepositoryInput] = useState("");
  const [adapterPresetsInput, setAdapterPresetsInput] = useState("[]");
  const [autoSyncCadenceInput, setAutoSyncCadenceInput] = useState(
    String(DEFAULT_AUTO_SYNC_CADENCE_HOURS)
  );
  const [companyQuery, setCompanyQuery] = useState("");
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingActionState | null>(null);
  const [importState, setImportState] = useState<ImportState | null>(null);
  const [syncState, setSyncState] = useState<SyncState | null>(null);
  const [connectingBoardAccess, setConnectingBoardAccess] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importDialog, setImportDialog] = useState<ImportDialogState | null>(null);
  const [paperclipCompanies, setPaperclipCompanies] = useState<ImportTargetCompany[]>([]);
  const [paperclipCompaniesError, setPaperclipCompaniesError] = useState<string | null>(null);
  const [paperclipCompaniesLoading, setPaperclipCompaniesLoading] = useState(false);
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
  const importedCompanies = catalog.importedCompanies;
  const isImportDisabled = pendingAction !== null || importState !== null || syncState !== null;
  const isSyncDisabled = pendingAction !== null || importState !== null || syncState !== null;
  const trackedImportedCompanyIds = new Set(
    catalog.importedCompanies.map((company) => company.importedCompany.id)
  );
  const availableImportTargets = paperclipCompanies
    .filter((company) => !trackedImportedCompanyIds.has(company.id))
    .sort((left, right) => {
      const leftIsCurrent = context.companyId === left.id;
      const rightIsCurrent = context.companyId === right.id;
      if (leftIsCurrent !== rightIsCurrent) {
        return leftIsCurrent ? -1 : 1;
      }

      return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
    });
  const importCompany = importDialog
    ? catalog.companies.find((company) => company.id === importDialog.sourceCompanyId) ?? null
    : null;
  const importTargetCompany = importDialog?.targetMode === "existing_import" && importDialog.targetCompanyId
    ? catalog.importedCompanies.find(
        (company) =>
          company.sourceCompanyId === importDialog.sourceCompanyId
          && company.importedCompany.id === importDialog.targetCompanyId
      ) ?? null
    : null;
  const selectedCompany = selectedCompanyId
    ? catalog.companies.find((company) => company.id === selectedCompanyId) ?? null
    : null;
  const registeredApiBaseRef = useRef<string | null>(null);
  const autoSyncCadenceValue = Number(autoSyncCadenceInput);
  const isAutoSyncCadenceValid =
    Number.isInteger(autoSyncCadenceValue) && autoSyncCadenceValue >= MIN_AUTO_SYNC_CADENCE_HOURS;
  const isAutoSyncCadenceDirty =
    autoSyncCadenceInput.trim() !== String(catalog.autoSyncCadenceHours);

  useEffect(() => {
    setAutoSyncCadenceInput(String(catalog.autoSyncCadenceHours));
  }, [catalog.autoSyncCadenceHours]);

  useEffect(() => {
    setAdapterPresetsInput(JSON.stringify(
      catalog.adapterPresets.map((preset) => ({
        id: preset.id,
        name: preset.name,
        adapterType: preset.adapterType,
        adapterConfig: preset.adapterConfig
      })),
      null,
      2
    ));
  }, [catalog.adapterPresets]);

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

  async function loadPaperclipCompanies(): Promise<void> {
    setPaperclipCompaniesLoading(true);

    try {
      const companies = normalizeImportTargetCompanies(await fetchHostJson<unknown>("/api/companies"));
      setPaperclipCompanies(companies);
      setPaperclipCompaniesError(null);
    } catch (actionError) {
      setPaperclipCompaniesError(getErrorMessage(actionError));
    } finally {
      setPaperclipCompaniesLoading(false);
    }
  }

  useEffect(() => {
    if (!selectedCompany && !importDialog) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      if (importDialog) {
        if (!importState) {
          setImportDialog(null);
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
  }, [importDialog, importState, selectedCompany]);

  useEffect(() => {
    if (selectedCompanyId && !catalog.companies.some((company) => company.id === selectedCompanyId)) {
      setSelectedCompanyId(null);
    }

    if (importDialog && !catalog.companies.some((company) => company.id === importDialog.sourceCompanyId)) {
      setImportDialog(null);
      setImportError(null);
    }

    if (
      importDialog?.targetMode === "existing_company"
      && importDialog.targetCompanyId
      && !paperclipCompanies.some((company) => company.id === importDialog.targetCompanyId)
    ) {
      setImportDialog(null);
      setImportError(null);
    }
  }, [catalog.companies, importDialog, paperclipCompanies, selectedCompanyId]);

  useEffect(() => {
    if (!catalog.importedCompanies.some((company) => company.importedCompany.syncStatus === "running")) {
      return;
    }

    const intervalId = window.setInterval(() => {
      refresh();
    }, 2000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [catalog.importedCompanies, refresh]);

  useEffect(() => {
    void ensurePaperclipApiBaseRegistered();
  }, [setPaperclipApiBase]);

  useEffect(() => {
    void loadPaperclipCompanies();
  }, []);

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
    void loadPaperclipCompanies();
  }

  function openImportAsNewDialog(companyId: string): void {
    const company = catalog.companies.find((candidate) => candidate.id === companyId);
    if (!company) {
      setNotice({
        tone: "error",
        text: "That company is no longer available in the current catalog snapshot."
      });
      return;
    }

    setSelectedCompanyId(null);
    setImportDialog({
      sourceCompanyId: company.id,
      targetMode: "new_company",
      targetCompanyId: null,
      targetCompanyName: "",
      companyName: company.name,
      selection: resolveCompanyImportSelection(
        company.contents,
        createDefaultCompanyImportSelection()
      ),
      adapterPresetSelection: createDefaultImportAdapterPresetSelection(),
      collisionStrategy: "replace"
    });
    setImportError(null);
  }

  function openImportIntoDialog(sourceCompanyId: string, targetCompany: ImportTargetCompany): void {
    const company = catalog.companies.find((candidate) => candidate.id === sourceCompanyId);
    if (!company) {
      setNotice({
        tone: "error",
        text: "That company is no longer available in the current catalog snapshot."
      });
      return;
    }

    if (trackedImportedCompanyIds.has(targetCompany.id)) {
      setNotice({
        tone: "error",
        text: `"${targetCompany.name}" is already tracked. Use Re-import / Edit selection from the tracked company list instead.`
      });
      return;
    }

    setSelectedCompanyId(null);
    setImportDialog({
      sourceCompanyId: company.id,
      targetMode: "existing_company",
      targetCompanyId: targetCompany.id,
      targetCompanyName: targetCompany.name,
      companyName: company.name,
      selection: resolveCompanyImportSelection(
        company.contents,
        createDefaultCompanyImportSelection()
      ),
      adapterPresetSelection: createDefaultImportAdapterPresetSelection(),
      collisionStrategy: "replace"
    });
    setImportError(null);
  }

  function openReimportDialog(sourceCompanyId: string, importedCompanyId: string): void {
    const company = catalog.importedCompanies.find(
      (candidate) =>
        candidate.sourceCompanyId === sourceCompanyId
        && candidate.importedCompany.id === importedCompanyId
    );
    if (!company) {
      setNotice({
        tone: "error",
        text: "That imported company is no longer available in the current catalog snapshot."
      });
      return;
    }

    setSelectedCompanyId(null);
    setImportDialog({
      sourceCompanyId,
      targetMode: "existing_import",
      targetCompanyId: importedCompanyId,
      targetCompanyName: company.importedCompany.name,
      companyName: company.importedCompany.name,
      selection: resolveCompanyImportSelection(
        company.contents,
        cloneCompanyImportSelection(company.importedCompany.selection)
      ),
      adapterPresetSelection: cloneImportAdapterPresetSelection(
        company.importedCompany.adapterPresetSelection
      ),
      collisionStrategy: company.importedCompany.syncCollisionStrategy
    });
    setImportError(null);
  }

  async function handleImportCompany(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!importCompany || !importDialog) {
      setImportError("That company is no longer available in the current catalog snapshot.");
      return;
    }

    const nextCompanyName = importDialog.companyName.trim();
    if (importDialog.targetMode === "new_company" && !nextCompanyName) {
      setImportError("Enter the new Paperclip company name before importing.");
      return;
    }

    if (importDialog.targetMode !== "new_company" && !importDialog.targetCompanyId) {
      setImportError("Choose an existing Paperclip company before importing.");
      return;
    }

    setImportError(null);
    setNotice(null);
    setImportState({
      kind: "preparing",
      companyId: importDialog.sourceCompanyId
    });

    try {
      await ensurePaperclipApiBaseRegistered();
      const preparedImport = await prepareCompanyImport({
        companyId: importCompany.id,
        selection: importDialog.selection
      }) as CatalogPreparedCompanyImport;
      const postImportDetails: string[] = [];
      const selectedAgentSlugs = getSelectedCompanyContentSlugs(
        importCompany.contents.agents,
        preparedImport.selection.agents
      );
      const adapterOverrides = buildAdapterOverridesFromPresets(
        catalog.adapterPresets,
        selectedAgentSlugs,
        importDialog.adapterPresetSelection
      );
      const preIssueImportInclude = buildPaperclipImportInclude(
        preparedImport.selection,
        importDialog.targetMode,
        false
      );
      const issueOnlyImportInclude = buildPaperclipImportInclude(
        preparedImport.selection,
        importDialog.targetMode,
        true
      );
      const preIssueImportSource = buildStagedPaperclipImportSource(
        preparedImport.source,
        "pre_issues"
      );
      const issueOnlyImportSource = buildStagedPaperclipImportSource(
        preparedImport.source,
        "issues"
      );
      let issuesBeforeImport: PaperclipIssueSnapshot[] | null =
        importDialog.targetMode === "new_company" ? [] : null;

      if (importDialog.targetMode !== "new_company" && importDialog.targetCompanyId) {
        try {
          issuesBeforeImport = await fetchHostJson<PaperclipIssueSnapshot[]>(
            `/api/companies/${encodeURIComponent(importDialog.targetCompanyId)}/issues`
          );
        } catch (snapshotError) {
          issuesBeforeImport = null;
          postImportDetails.push(
            `Assigned issue wake snapshot unavailable before import: ${getErrorMessage(snapshotError)}`
          );
        }
      }

      setImportState({
        kind: "importing",
        companyId: importDialog.sourceCompanyId
      });

      const target =
        importDialog.targetMode === "new_company"
          ? {
              mode: "new_company" as const,
              newCompanyName: nextCompanyName
            }
          : {
              mode: "existing_company" as const,
              companyId: importDialog.targetCompanyId
            };

      let importedPhaseOneResult: PaperclipCompanyImportResult | null = null;
      if (hasEnabledPaperclipImportStage(preIssueImportInclude)) {
        importedPhaseOneResult = await fetchHostJson<PaperclipCompanyImportResult>("/api/companies/import", {
          method: "POST",
          body: JSON.stringify({
            source: preIssueImportSource,
            include: preIssueImportInclude,
            target,
            collisionStrategy: importDialog.collisionStrategy,
            ...(adapterOverrides ? { adapterOverrides } : {})
          })
        });
      }
      const importedCompanyName =
        importDialog.targetMode === "new_company"
          ? importedPhaseOneResult?.company?.name?.trim() || nextCompanyName || "selected company"
          : importDialog.targetCompanyName
            || importTargetCompany?.importedCompany.name
            || importedPhaseOneResult?.company?.name?.trim()
            || "selected company";
      const importedCompanyId =
        importedPhaseOneResult?.company?.id?.trim()
        || importDialog.targetCompanyId
        || null;
      let importedCompanyIssuePrefix: string | null =
        importTargetCompany?.importedCompany.issuePrefix ?? null;

      if (importedCompanyId) {
        if (issueOnlyImportInclude.issues && preIssueImportInclude.agents && selectedAgentSlugs.size > 0) {
          try {
            const importedAgents = normalizePaperclipAgentSnapshots(
              await fetchHostJson<PaperclipAgentSnapshot[]>(
                `/api/companies/${encodeURIComponent(importedCompanyId)}/agents`
              )
            );
            const pendingImportedAgents = importedAgents.filter((agent) => {
              const agentSlug = normalizePaperclipSlug(agent.urlKey ?? agent.name);
              return agent.status === "pending_approval"
                && agentSlug !== null
                && selectedAgentSlugs.has(agentSlug);
            });

            for (const agent of pendingImportedAgents) {
              try {
                const approval = await fetchHostJson<PaperclipApprovalRecord>(
                  `/api/companies/${encodeURIComponent(importedCompanyId)}/approvals`,
                  {
                    method: "POST",
                    body: JSON.stringify({
                      type: "hire_agent",
                      payload: {
                        agentId: agent.id,
                        name: agent.name,
                        role: agent.role,
                        title: agent.title
                      }
                    })
                  }
                );

                if (!approval.id) {
                  throw new Error("Paperclip did not return an approval id.");
                }

                await fetchHostJson(
                  `/api/approvals/${encodeURIComponent(approval.id)}/approve`,
                  {
                    method: "POST",
                    body: JSON.stringify({
                      decisionNote: `Approved automatically after importing "${agent.name}" so assigned tasks can wake the agent immediately.`
                    })
                  }
                );
              } catch (approvalError) {
                postImportDetails.push(
                  `Imported agent "${agent.name}" still needs approval before assigned tasks can wake automatically: ${getErrorMessage(approvalError)}`
                );
              }
            }
          } catch (agentLookupError) {
            postImportDetails.push(
              `Imported agent approval check unavailable: ${getErrorMessage(agentLookupError)}`
            );
          }
        }

        let importedPhaseTwoResult: PaperclipCompanyImportResult | null = null;
        if (hasEnabledPaperclipImportStage(issueOnlyImportInclude)) {
          importedPhaseTwoResult = await fetchHostJson<PaperclipCompanyImportResult>("/api/companies/import", {
            method: "POST",
            body: JSON.stringify({
              source: issueOnlyImportSource,
              include: issueOnlyImportInclude,
              target: {
                mode: "existing_company",
                companyId: importedCompanyId
              },
              collisionStrategy: importDialog.collisionStrategy
            })
          });
        }
        const importedCompany: PaperclipCompanyImportResult = {
          company: importedPhaseTwoResult?.company ?? importedPhaseOneResult?.company ?? null,
          agents: [
            ...(importedPhaseOneResult?.agents ?? []),
            ...(importedPhaseTwoResult?.agents ?? [])
          ],
          projects: [
            ...(importedPhaseOneResult?.projects ?? []),
            ...(importedPhaseTwoResult?.projects ?? [])
          ],
          issues: [
            ...(importedPhaseOneResult?.issues ?? []),
            ...(importedPhaseTwoResult?.issues ?? [])
          ],
          skills: [
            ...(importedPhaseOneResult?.skills ?? []),
            ...(importedPhaseTwoResult?.skills ?? [])
          ],
          warnings: mergePaperclipImportWarnings(
            importedPhaseOneResult?.warnings,
            importedPhaseTwoResult?.warnings
          )
        };

        if (importDialog.collisionStrategy === "replace") {
          try {
            postImportDetails.push(
              ...await archiveDuplicateImportedRoutines(importedCompanyId, preparedImport.source)
            );
          } catch (routineCleanupError) {
            postImportDetails.push(
              `Imported routine duplicate cleanup unavailable: ${getErrorMessage(routineCleanupError)}`
            );
          }
        }

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
            importedCompanyIssuePrefix,
            selection: preparedImport.selection,
            adapterPresetSelection: importDialog.adapterPresetSelection,
            syncCollisionStrategy: importDialog.collisionStrategy,
            issuesBeforeImport
          });
          refresh();
          void loadPaperclipCompanies();
        } catch (recordError) {
          postImportDetails.push(
            `Import tracking could not be saved: ${getErrorMessage(recordError)}`
          );
        }
        const warningDetails = getStructuredMessageLines(importedCompany.warnings, 3);
        const warningCount = Array.isArray(importedCompany.warnings)
          ? importedCompany.warnings.length
          : warningDetails.length;
        const importDetails = [
          `Selected contents: ${buildCompanyImportSelectionSummary(preparedImport.selection, importCompany.contents)}`,
          adapterOverrides
            ? `Adapter overrides: ${Object.keys(adapterOverrides).length} selected agent${Object.keys(adapterOverrides).length === 1 ? "" : "s"}.`
            : "Adapter overrides: package defaults.",
          getRecurringTaskImportHint(importCompany.contents),
          `Auto-sync: enabled ${formatAutoSyncCadenceLabel(catalog.autoSyncCadenceHours)} by default after import.`,
          importDialog.collisionStrategy === "replace"
            ? "Sync mode: overwrite existing content."
            : `Sync mode: ${importDialog.collisionStrategy}.`,
          importDialog.targetMode === "existing_company"
            ? `Existing company adoption: ${importDialog.targetCompanyName} is now tracked for future sync.`
            : importDialog.targetMode === "existing_import"
              ? "Tracked import contract updated for future sync."
              : null,
          (() => {
            const companyAction = normalizeImportAction(importedCompany.company?.action);
            return companyAction ? `Company record: ${companyAction}` : null;
          })(),
          formatImportResultSummary("Agents", importedCompany.agents),
          formatImportResultSummary("Projects", importedCompany.projects),
          formatImportResultSummary("Paperclip issues", importedCompany.issues),
          formatImportResultSummary("Skills", importedCompany.skills),
          warningCount > 0
            ? `Warnings: ${warningCount} returned during import.`
            : null,
          ...warningDetails.map((detail) => `Warning detail: ${detail}`),
          ...postImportDetails
        ].filter((detail): detail is string => Boolean(detail));

        setImportDialog(null);
        setImportError(null);
        setNotice({
          tone: "success",
          title: importDialog.targetMode === "existing_import" ? "Company re-imported" : "Company imported",
          text:
            warningCount > 0
              ? importDialog.targetMode === "existing_import"
                ? `Re-imported "${importCompany.name}" into "${importedCompanyName}" with ${warningCount} warning${warningCount === 1 ? "" : "s"}.`
                : importDialog.targetMode === "existing_company"
                  ? `Imported "${importCompany.name}" into "${importedCompanyName}" with ${warningCount} warning${warningCount === 1 ? "" : "s"}.`
                  : `Imported "${importCompany.name}" as "${importedCompanyName}" with ${warningCount} warning${warningCount === 1 ? "" : "s"}.`
              : importDialog.targetMode === "existing_import"
                ? `Re-imported "${importCompany.name}" into "${importedCompanyName}".`
                : importDialog.targetMode === "existing_company"
                  ? `Imported "${importCompany.name}" into "${importedCompanyName}".`
                  : `Imported "${importCompany.name}" as "${importedCompanyName}".`,
          details: importDetails,
          action: importedCompanyIssuePrefix
            ? {
                href: `/${encodeURIComponent(importedCompanyIssuePrefix)}/dashboard`,
                label: "Open dashboard"
              }
            : undefined
        });
      } else {
        postImportDetails.push(
          "Import tracking could not be saved because Paperclip did not return a company id."
        );
        throw new Error(postImportDetails[postImportDetails.length - 1] ?? "Paperclip did not return a company id.");
      }
    } catch (actionError) {
      setImportError(getErrorMessage(actionError));
    } finally {
      setImportState(null);
    }
  }

  function handleChangeImportCompanyName(companyName: string): void {
    setImportDialog((currentDialog) =>
      currentDialog
        ? {
            ...currentDialog,
            companyName
          }
        : currentDialog
    );
  }

  function handleChangeImportCollisionStrategy(
    collisionStrategy: CatalogSyncCollisionStrategy
  ): void {
    setImportDialog((currentDialog) =>
      currentDialog
        ? {
            ...currentDialog,
            collisionStrategy
          }
        : currentDialog
    );
  }

  function handleChangeDefaultAdapterPreset(value: string): void {
    setImportDialog((currentDialog) =>
      currentDialog
        ? {
            ...currentDialog,
            adapterPresetSelection: {
              ...currentDialog.adapterPresetSelection,
              defaultPresetId: value === "__package__" ? null : value
            }
          }
        : currentDialog
    );
  }

  function handleChangeAgentAdapterPreset(agentSlug: string, value: string): void {
    setImportDialog((currentDialog) => {
      if (!currentDialog) {
        return currentDialog;
      }

      const agentPresetIds = { ...currentDialog.adapterPresetSelection.agentPresetIds };
      if (value === "__default__") {
        delete agentPresetIds[agentSlug];
      } else {
        agentPresetIds[agentSlug] = value === "__package__" ? null : value;
      }

      return {
        ...currentDialog,
        adapterPresetSelection: {
          ...currentDialog.adapterPresetSelection,
          agentPresetIds
        }
      };
    });
  }

  function handleToggleImportSelectionPart(
    keys: CompanyContentKey[],
    enabled: boolean
  ): void {
    const company = importDialog
      ? catalog.companies.find((candidate) => candidate.id === importDialog.sourceCompanyId) ?? null
      : null;
    if (!company) {
      return;
    }

    setImportDialog((currentDialog) =>
      currentDialog
        ? {
            ...currentDialog,
            selection: toggleCompanyImportSelectionPart(
              currentDialog.selection,
              keys,
              enabled,
              company.contents
            )
          }
        : currentDialog
    );
  }

  function handleToggleImportSelectionItem(
    key: CompanyContentKey,
    itemPath: string,
    checked: boolean
  ): void {
    const company = importDialog
      ? catalog.companies.find((candidate) => candidate.id === importDialog.sourceCompanyId) ?? null
      : null;
    if (!company) {
      return;
    }

    setImportDialog((currentDialog) =>
      currentDialog
        ? {
            ...currentDialog,
            selection: toggleCompanyImportSelectionItem(
              currentDialog.selection,
              key,
              itemPath,
              checked,
              company.contents[key],
              company.contents
            )
          }
        : currentDialog
    );
  }

  async function handleSetCompanyAutoSync(
    sourceCompanyId: string,
    importedCompanyId: string,
    enabled: boolean
  ): Promise<void> {
    const company = catalog.importedCompanies.find(
      (candidate) =>
        candidate.sourceCompanyId === sourceCompanyId
        && candidate.importedCompany.id === importedCompanyId
    );
    if (!company) {
      setNotice({
        tone: "error",
        text: "That imported company is no longer available in the current catalog snapshot."
      });
      return;
    }

    setPendingAction({
      kind: "toggling-auto-sync",
      sourceCompanyId,
      importedCompanyId
    });
    setNotice(null);

    try {
      await setCompanyAutoSync({
        sourceCompanyId,
        importedCompanyId,
        enabled
      });
      await refreshCatalog({
        tone: "info",
        text: enabled
          ? `Auto-sync enabled for "${company.importedCompany.name}".`
          : `Auto-sync paused for "${company.importedCompany.name}".`
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

  async function handleSetAutoSyncCadence(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!isAutoSyncCadenceValid) {
      setNotice({
        tone: "error",
        text: `Enter an auto-sync cadence of at least ${MIN_AUTO_SYNC_CADENCE_HOURS} hour${MIN_AUTO_SYNC_CADENCE_HOURS === 1 ? "" : "s"}.`
      });
      return;
    }

    setPendingAction({
      kind: "updating-cadence"
    });
    setNotice(null);

    try {
      await setAutoSyncCadence({
        autoSyncCadenceHours: autoSyncCadenceValue
      });
      await refreshCatalog({
        tone: "info",
        text: `Auto-sync cadence updated to ${formatAutoSyncCadenceLabel(autoSyncCadenceValue)}.`
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

  async function handleSaveAdapterPresets(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    let adapterPresets: unknown;
    try {
      adapterPresets = JSON.parse(adapterPresetsInput);
    } catch (parseError) {
      setNotice({
        tone: "error",
        title: "Adapter presets not saved",
        text: `Preset JSON is invalid: ${getErrorMessage(parseError)}`
      });
      return;
    }

    if (!Array.isArray(adapterPresets)) {
      setNotice({
        tone: "error",
        title: "Adapter presets not saved",
        text: "Preset JSON must be an array."
      });
      return;
    }

    setPendingAction({ kind: "updating-adapter-presets" });
    setNotice(null);

    try {
      await setAdapterPresets({ adapterPresets });
      refresh();
      setNotice({
        tone: "success",
        title: "Adapter presets saved",
        text: "Imports can now use these presets as defaults or per-agent overrides."
      });
    } catch (actionError) {
      setNotice({
        tone: "error",
        title: "Adapter presets not saved",
        text: getErrorMessage(actionError)
      });
    } finally {
      setPendingAction(null);
    }
  }

  async function handleSyncCompany(
    sourceCompanyId: string,
    importedCompanyId: string
  ): Promise<void> {
    const company = catalog.importedCompanies.find(
      (candidate) =>
        candidate.sourceCompanyId === sourceCompanyId
        && candidate.importedCompany.id === importedCompanyId
    );
    if (!company) {
      setNotice({
        tone: "error",
        text: "That imported company is no longer available in the current catalog snapshot."
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
      sourceCompanyId,
      importedCompanyId
    });
    setNotice(null);

    try {
      await ensurePaperclipApiBaseRegistered();
      const syncResult = await syncCompany({
        sourceCompanyId,
        importedCompanyId
      }) as CatalogCompanySyncResult;
      const visibleWarningDetails = getVisibleSyncWarningDetails(syncResult);
      const warningCount = visibleWarningDetails.length;
      const warningDetails = visibleWarningDetails.slice(0, 3);
      const syncDetails = [
        `Selected contents: ${buildCompanyImportSelectionSummary(company.importedCompany.selection, company.contents)}`,
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
        formatImportResultSummary("Paperclip issues", syncResult.issues),
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
      await ensurePaperclipApiBaseRegistered();

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
        paperclipBoardApiToken: boardApiToken,
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
            Source packages
          </span>
        </div>
        <div className="agent-companies-settings__metric">
          <span className="agent-companies-settings__metric-label">Imported Companies</span>
          <strong className="agent-companies-settings__metric-value">
            {catalog.summary.importedCompanyCount}
          </strong>
          <span className="agent-companies-settings__metric-note">
            Sync targets
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

      <section className="agent-companies-settings__panel">
        <div className="agent-companies-settings__panel-head">
          <div>
            <h2 className="agent-companies-settings__panel-title">Adapter Presets</h2>
            <p className="agent-companies-settings__panel-copy">
              Named adapter configurations become import defaults and per-agent overrides. They are stored in plugin state and reused by sync.
            </p>
          </div>
          <div className="agent-companies-settings__badge-row">
            <span className="agent-companies-settings__badge agent-companies-settings__badge--accent">
              {catalog.adapterPresets.length} preset{catalog.adapterPresets.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>
        <form className="agent-companies-settings__status-grid" onSubmit={(event) => void handleSaveAdapterPresets(event)}>
          <label htmlFor="agent-companies-adapter-presets">
            <span className="agent-companies-settings__metric-label">Preset JSON</span>
          </label>
          <textarea
            className="agent-companies-settings__textarea"
            disabled={pendingAction !== null}
            id="agent-companies-adapter-presets"
            onChange={(event) => setAdapterPresetsInput(event.target.value)}
            spellCheck={false}
            value={adapterPresetsInput}
          />
          <div className="agent-companies-settings__dialog-form-actions">
            <button
              className="agent-companies-settings__button agent-companies-settings__button--primary"
              disabled={pendingAction !== null}
              type="submit"
            >
              {pendingAction?.kind === "updating-adapter-presets" ? "Saving..." : "Save presets"}
            </button>
          </div>
        </form>
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
                These are source packages grouped by repository. Import stays available here even after you create one or more Paperclip companies from the same source.
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

          {paperclipCompaniesError ? (
            <div className="agent-companies-settings__notice" data-tone="error">
              Could not load existing-company import targets: {paperclipCompaniesError}
            </div>
          ) : null}

          {catalog.companies.length > 0 && companyGroups.length > 0 ? (
            <div className="agent-companies-settings__company-groups">
              {companyGroups.map((group) => (
                <CompanyGroupCard
                  availableImportTargets={availableImportTargets}
                  companies={group.companies}
                  importTargetError={paperclipCompaniesError}
                  importTargetsLoading={paperclipCompaniesLoading}
                  importState={importState}
                  isImportDisabled={isImportDisabled}
                  key={group.repository?.id ?? group.companies[0]?.repositoryId ?? "unknown-repo"}
                  onOpenContents={setSelectedCompanyId}
                  onOpenImportAsNew={openImportAsNewDialog}
                  onOpenImportInto={openImportIntoDialog}
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

        <section className="agent-companies-settings__panel">
          <div className="agent-companies-settings__panel-head">
            <div>
              <h2 className="agent-companies-settings__panel-title">Imported Companies</h2>
              <p className="agent-companies-settings__panel-copy">
                These are the tracked Paperclip companies created from discovered sources. Sync controls, per-company auto-sync toggles, and the shared cadence live here.
              </p>
            </div>
            <div className="agent-companies-settings__badge-row">
              <span className="agent-companies-settings__badge agent-companies-settings__badge--accent">
                {importedCompanies.length} tracked
              </span>
            </div>
          </div>
          <form
            className="agent-companies-settings__form"
            onSubmit={(event) => void handleSetAutoSyncCadence(event)}
          >
            <label htmlFor="agent-companies-auto-sync-cadence-input">
              Auto-sync cadence (hours)
            </label>
            <input
              className="agent-companies-settings__input"
              data-testid="auto-sync-cadence-input"
              id="agent-companies-auto-sync-cadence-input"
              inputMode="numeric"
              min={MIN_AUTO_SYNC_CADENCE_HOURS}
              onChange={(event) => setAutoSyncCadenceInput(event.target.value)}
              step={1}
              type="number"
              value={autoSyncCadenceInput}
            />
            <button
              className="agent-companies-settings__button"
              data-testid="auto-sync-cadence-submit"
              disabled={
                pendingAction !== null || !isAutoSyncCadenceValid || !isAutoSyncCadenceDirty
              }
              type="submit"
            >
              {pendingAction?.kind === "updating-cadence" ? "Saving..." : "Save cadence"}
            </button>
          </form>

          {importedCompanies.length > 0 ? (
            <div className="agent-companies-settings__company-list">
              {importedCompanies.map((company) => (
                <ImportedCompanyCard
                  autoSyncCadenceHours={catalog.autoSyncCadenceHours}
                  company={company}
                  importState={importState}
                  isSyncDisabled={isSyncDisabled}
                  key={`${company.sourceCompanyId}:${company.importedCompany.id}`}
                  onOpenContents={setSelectedCompanyId}
                  onOpenReimport={openReimportDialog}
                  onSync={handleSyncCompany}
                  onToggleAutoSync={handleSetCompanyAutoSync}
                  syncState={syncState}
                />
              ))}
            </div>
          ) : (
            <div className="agent-companies-settings__empty">
              <h3 className="agent-companies-settings__empty-title">No imported companies yet</h3>
              <p className="agent-companies-settings__empty-copy">
                Import a discovered source package above to start tracking Paperclip companies here.
              </p>
            </div>
          )}
        </section>
      </div>

      {selectedCompany ? (
        <CompanyDetailsDialog
          availableImportTargets={availableImportTargets}
          company={selectedCompany}
          importTargetError={paperclipCompaniesError}
          importTargetsLoading={paperclipCompaniesLoading}
          importState={importState}
          isImportDisabled={isImportDisabled}
          onClose={() => setSelectedCompanyId(null)}
          onOpenImportAsNew={openImportAsNewDialog}
          onOpenImportInto={openImportIntoDialog}
        />
      ) : null}

      {importCompany && importDialog ? (
        <ImportCompanyDialog
          adapterPresets={catalog.adapterPresets}
          company={importCompany}
          dialogState={importDialog}
          errorText={importError}
          importState={importState}
          onChangeAgentAdapterPreset={handleChangeAgentAdapterPreset}
          onChangeCollisionStrategy={handleChangeImportCollisionStrategy}
          onChangeCompanyName={handleChangeImportCompanyName}
          onChangeDefaultAdapterPreset={handleChangeDefaultAdapterPreset}
          onClose={() => {
            if (importState) {
              return;
            }

            setImportDialog(null);
            setImportError(null);
          }}
          onToggleItem={handleToggleImportSelectionItem}
          onTogglePart={handleToggleImportSelectionPart}
          onSubmit={handleImportCompany}
        />
      ) : null}
    </section>
  );
}
