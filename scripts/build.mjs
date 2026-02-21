import fs from "node:fs/promises";
import path from "node:path";
import autoprefixer from "autoprefixer";
import browserslist from "browserslist";
import browserslistToEsbuild from "browserslist-to-esbuild";
import { build as esbuildBuild } from "esbuild";
import postcss from "postcss";

const ROOT_DIR = process.cwd();
const DIST_DIR = path.join(ROOT_DIR, "dist");
const REQUIRED_STATIC_FILES = ["index.html", "restaurants.json"];
const OPTIONAL_STATIC_FILES = ["CNAME"];

async function cleanDist() {
  await fs.rm(DIST_DIR, { recursive: true, force: true });
  await fs.mkdir(DIST_DIR, { recursive: true });
}

function getBrowserTargets() {
  const browserTargets = browserslist(undefined, { path: ROOT_DIR });
  if (browserTargets.length === 0) {
    throw new Error("No browserslist targets resolved. Check browserslist configuration.");
  }
  return browserTargets;
}

async function buildJavaScript(esbuildTargets) {
  await esbuildBuild({
    entryPoints: [path.join(ROOT_DIR, "app.js")],
    outfile: path.join(DIST_DIR, "app.js"),
    bundle: false,
    minify: true,
    target: esbuildTargets,
    legalComments: "none"
  });
}

async function buildStyles(browserTargets) {
  const sourcePath = path.join(ROOT_DIR, "styles.css");
  const outputPath = path.join(DIST_DIR, "styles.css");
  const cssSource = await fs.readFile(sourcePath, "utf8");
  const result = await postcss([
    autoprefixer({
      overrideBrowserslist: browserTargets
    })
  ]).process(cssSource, {
    from: sourcePath,
    to: outputPath,
    map: false
  });
  await fs.writeFile(outputPath, result.css, "utf8");
}

async function copyStaticFiles() {
  for (const fileName of REQUIRED_STATIC_FILES) {
    const sourcePath = path.join(ROOT_DIR, fileName);
    await fs.access(sourcePath);
    await fs.copyFile(sourcePath, path.join(DIST_DIR, fileName));
  }

  for (const fileName of OPTIONAL_STATIC_FILES) {
    const sourcePath = path.join(ROOT_DIR, fileName);
    try {
      await fs.access(sourcePath);
      await fs.copyFile(sourcePath, path.join(DIST_DIR, fileName));
    } catch {
      // Skip optional files that are not present.
    }
  }
}

async function build() {
  const browserTargets = getBrowserTargets();
  const esbuildTargets = browserslistToEsbuild(browserTargets);

  await cleanDist();
  await Promise.all([
    buildJavaScript(esbuildTargets),
    buildStyles(browserTargets)
  ]);
  await copyStaticFiles();

  process.stdout.write(
    `Build complete. Output: dist/\nTargets: ${browserTargets.join(", ")}\n`
  );
}

build().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
