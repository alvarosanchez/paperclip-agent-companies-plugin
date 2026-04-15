import { createRequire } from "node:module";
import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";
import { PLUGIN_DISPLAY_NAME, PLUGIN_ID } from "./catalog.js";

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
    "http.outbound",
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
      displayName: "Daily Agent Company Auto-Sync",
      description: "Checks imported agent companies and syncs any source that is due for its daily update.",
      schedule: "0 3 * * *"
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
