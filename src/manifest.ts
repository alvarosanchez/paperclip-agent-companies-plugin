import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";
import {
  BOARD_ACCESS_TOKEN_CONFIG_PATH,
  DEFAULT_AUTO_SYNC_CADENCE_HOURS,
  PLUGIN_DISPLAY_NAME,
  PLUGIN_ID
} from "./plugin-constants.js";

declare const __PACKAGE_VERSION__: string | undefined;

const BUILD_PACKAGE_VERSION =
  typeof __PACKAGE_VERSION__ === "string" ? __PACKAGE_VERSION__.trim() : "";
const MANIFEST_VERSION =
  process.env.PLUGIN_VERSION?.trim() ||
  BUILD_PACKAGE_VERSION ||
  process.env.npm_package_version?.trim() ||
  "0.0.0-dev";

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: MANIFEST_VERSION,
  displayName: PLUGIN_DISPLAY_NAME,
  description: "Discover Agent Companies packages inside git repositories and import selected companies into Paperclip.",
  author: "Alvaro Sanchez-Mariscal",
  categories: ["automation"],
  capabilities: [
    "instance.settings.register",
    "plugin.state.read",
    "plugin.state.write",
    "jobs.schedule",
    "issues.read",
    "issues.wakeup",
    "http.outbound",
    "secrets.read-ref",
    "ui.page.register"
  ],
  // Plugin config is company-scoped on Paperclip 2026.831+. The only field is the
  // board access token secret_ref binding: saving it registers the secret binding
  // that `ctx.secrets.resolve` requires and enrolls the company in the worker's
  // proactive (scheduled auto-sync) company scopes. The catalog itself stays in
  // instance-scoped plugin state.
  instanceConfigSchema: {
    type: "object",
    properties: {
      [BOARD_ACCESS_TOKEN_CONFIG_PATH]: {
        type: ["object", "string"],
        format: "secret-ref",
        title: "Board access token",
        description:
          "Company secret holding the Paperclip board API token used for worker-side imports and syncs. Saved automatically when board access is connected from the Agent Companies page."
      }
    }
  },
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui"
  },
  jobs: [
    {
      jobKey: "catalog-auto-sync",
      displayName: "Agent Company Auto-Sync",
      description: `Checks tracked agent companies every hour and syncs any source due for its configured auto-sync cadence (${DEFAULT_AUTO_SYNC_CADENCE_HOURS} hours by default).`,
      schedule: "0 * * * *"
    }
  ],
  ui: {
    slots: [
      {
        type: "settingsPage",
        id: "agent-companies-settings",
        displayName: "Repository Catalog",
        exportName: "AgentCompaniesSettingsPage"
      },
      {
        type: "page",
        id: "agent-companies-company-page",
        displayName: "Agent Companies",
        exportName: "AgentCompaniesSettingsPage",
        routePath: "agent-companies"
      }
    ]
  }
};

export default manifest;
