import { createRequire } from "node:module";
import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";
import { DEFAULT_AUTO_SYNC_CADENCE_HOURS, PLUGIN_DISPLAY_NAME, PLUGIN_ID } from "./catalog.js";

const require = createRequire(import.meta.url);
const packageJson = require("../package.json") as { version?: unknown };
const MANIFEST_VERSION =
  process.env.PLUGIN_VERSION?.trim() ||
  (typeof packageJson.version === "string" && packageJson.version.trim()) ||
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
  instanceConfigSchema: {
    type: "object",
    properties: {}
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
      }
    ]
  }
};

export default manifest;
