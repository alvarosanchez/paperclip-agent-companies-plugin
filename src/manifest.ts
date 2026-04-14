import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

const manifest: PaperclipPluginManifestV1 = {
  id: "paperclip-agent-companies-plugin",
  apiVersion: 1,
  version: "0.1.0",
  displayName: "Agent Companies Plugin",
  description: "Empty Paperclip plugin scaffold for agent companies workflows.",
  author: "Alvaro Sanchez-Mariscal",
  categories: ["automation"],
  capabilities: ["instance.settings.register"],
  instanceConfigSchema: {
    type: "object",
    properties: {}
  },
  entrypoints: {
    worker: "./dist/worker.js"
  }
};

export default manifest;
