import { nodeResolve } from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import { createPluginBundlerPresets } from "@paperclipai/plugin-sdk/bundlers";

const presets = createPluginBundlerPresets({ uiEntry: "src/ui/index.tsx" });

function withPlugins(config) {
  if (!config) return null;
  return {
    ...config,
    plugins: [
      nodeResolve({
        extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs"]
      }),
      typescript({
        tsconfig: "./tsconfig.json",
        declaration: false,
        declarationMap: false
      })
    ]
  };
}

export default [
  withPlugins({
    input: "src/catalog.ts",
    output: {
      file: "dist/catalog.js",
      format: "es",
      sourcemap: true
    }
  }),
  withPlugins(presets.rollup.manifest),
  withPlugins(presets.rollup.worker),
  withPlugins(presets.rollup.ui)
].filter(Boolean);
