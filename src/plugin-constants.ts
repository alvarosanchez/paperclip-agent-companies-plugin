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
/** Company-scoped plugin config path that carries the board access token secret_ref binding. */
export const BOARD_ACCESS_TOKEN_CONFIG_PATH = "boardAccessTokenRef";
/**
 * Paperclip's `POST /api/companies/import` defaults `pauseAutomations` to false, so imported or
 * updated agents wake immediately. Tracked syncs keep that host default; a fresh "import as new
 * company" opts into pausing so an operator can verify the company before agents start working.
 */
export const DEFAULT_SYNC_PAUSE_AUTOMATIONS = false;
export const DEFAULT_NEW_COMPANY_IMPORT_PAUSE_AUTOMATIONS = true;
