import * as cp from "child_process";

if (process.argv.length <= 2) {
  console.error("usage: yarn example <EXAMPLE-NAME> [EXAMPLE-ARGS]...");
  process.exit(1);
}

const target = process.argv[2];
const targetScriptPath = `packages/examples/src/${target}.ts`;

const exampleArgs = process.argv.slice(3);

const proc = cp.spawn(
  "node",
  [
    "--loader",
    "esbuild-register/loader",
    "-r",
    "esbuild-register",
    targetScriptPath,
    ...exampleArgs,
  ],
  { stdio: "inherit" }
);
proc.on("exit", (code) => {
  if (code != null && code !== 0) {
    process.exit(code);
  }
});
