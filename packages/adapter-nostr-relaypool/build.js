import { build } from "esbuild";
import fs from "fs-extra";

const DIST_DIR = "./dist";

/** @type import("esbuild").BuildOptions */
const sharedBuildOptions = {
  entryPoints: ["src/index.ts"],
  outdir: DIST_DIR,
  bundle: true,
  minify: false,
  sourcemap: "external",
};

const buildCJS = async () =>
  build({
    ...sharedBuildOptions,
    format: "cjs",
    outExtension: { ".js": ".cjs" },
  });

const buildESM = async () =>
  build({
    ...sharedBuildOptions,
    format: "esm",
    outExtension: { ".js": ".mjs" },
  });

// remove outputs of the last build
fs.rmSync(DIST_DIR, { force: true, recursive: true });

Promise.all([buildCJS(), buildESM()]).catch((e) => {
  console.error(`failed to build: ${e}`);
  process.exit(1);
});
