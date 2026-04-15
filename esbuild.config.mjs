import esbuild from "esbuild";
import { fileURLToPath } from "node:url";
import { createPluginBundlerPresets } from "@paperclipai/plugin-sdk/bundlers";

const presets = createPluginBundlerPresets({ uiEntry: "src/ui/index.tsx" });
const watch = process.argv.includes("--watch");
const yamlBrowserEntry = fileURLToPath(new URL("./node_modules/yaml/browser/index.js", import.meta.url));

const catalogCtx = await esbuild.context({
  entryPoints: ["src/catalog.ts"],
  outfile: "dist/catalog.js",
  format: "esm",
  platform: "neutral",
  target: "es2022",
  sourcemap: true,
  bundle: false,
  tsconfig: "./tsconfig.json"
});
const workerCtx = await esbuild.context({
  ...presets.esbuild.worker,
  alias: {
    ...(presets.esbuild.worker.alias ?? {}),
    yaml: yamlBrowserEntry
  }
});
const manifestCtx = await esbuild.context(presets.esbuild.manifest);
const uiCtx = await esbuild.context(presets.esbuild.ui);

if (watch) {
  await Promise.all([catalogCtx.watch(), workerCtx.watch(), manifestCtx.watch(), uiCtx.watch()]);
  console.log("esbuild watch mode enabled for catalog, worker, manifest, and ui");
} else {
  await Promise.all([catalogCtx.rebuild(), workerCtx.rebuild(), manifestCtx.rebuild(), uiCtx.rebuild()]);
  await Promise.all([catalogCtx.dispose(), workerCtx.dispose(), manifestCtx.dispose(), uiCtx.dispose()]);
}
