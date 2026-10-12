// Builds the engine into:
//   dist/tour.js      - IIFE, exposes window.Tour, auto-initialises from its <script> tag
//   dist/tour.esm.js  - ES module for bundler users
// and copies the IIFE into the .NET server's wwwroot so the backend can serve it.
import * as esbuild from "esbuild";
import { copyFileSync, mkdirSync } from "node:fs";

const watch = process.argv.includes("--watch");
const common = { entryPoints: ["src/index.ts"], bundle: true, target: "es2019", sourcemap: true, logLevel: "info" };
const serverSdk = "../server/GuidedTours.Api/wwwroot/sdk";

const copyToServer = {
  name: "copy-to-server",
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length) return;
      mkdirSync(serverSdk, { recursive: true });
      copyFileSync("dist/tour.js", `${serverSdk}/tour.js`);
      copyFileSync("dist/tour.js.map", `${serverSdk}/tour.js.map`);
    });
  },
};

const iife = { ...common, format: "iife", globalName: "Tour", footer: { js: "Tour=Tour.default;" }, outfile: "dist/tour.js", minify: !watch, plugins: [copyToServer] };
const esm = { ...common, format: "esm", outfile: "dist/tour.esm.js" };

if (watch) {
  const ctx = await esbuild.context(iife);
  await ctx.watch();
} else {
  await esbuild.build(iife);
  await esbuild.build(esm);
}
