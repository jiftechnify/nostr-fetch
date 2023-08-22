import cp from "child_process";
import { build } from "esbuild";
import fs from "fs-extra";

const DIST_DIR = "./dist";
const BUILD_TS_CONFIG_PATH = "./tsconfig.build.json";

/** @type import("esbuild").BuildOptions */
const sharedBuildOptions = {
  entryPoints: ["src/index.ts"],
  outdir: DIST_DIR,
  bundle: true,
  external: ["rx-nostr", "rxjs"],
  minify: false,
  sourcemap: "linked",
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

/** @type { () => Promise<void> } */
const buildTypes = async () =>
  new Promise((resolve, reject) => {
    const proc = cp.spawn("yarn", ["tsc", "-p", BUILD_TS_CONFIG_PATH], { stdio: "inherit" });
    proc.on("exit", (code) => {
      if (code != null && code !== 0) {
        reject(Error(`tsc exited with code ${code}`));
      } else {
        resolve();
      }
    });
  });

// remove outputs of the last build
fs.rmSync(DIST_DIR, { force: true, recursive: true });

Promise.all([buildCJS(), buildESM(), buildTypes()]).catch((e) => {
  console.error(`failed to build: ${e}`);
  process.exit(1);
});
