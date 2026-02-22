import fs from "node:fs/promises";
import path from "node:path";
import autoprefixer from "autoprefixer";
import browserslist from "browserslist";
import browserslistToEsbuild from "browserslist-to-esbuild";
import cssnano from "cssnano";
import { build as esbuildBuild } from "esbuild";
import postcss from "postcss";

const ROOT_DIR = process.cwd();
const DIST_DIR = path.join(ROOT_DIR, "dist");
const DATA_DIR = path.join(ROOT_DIR, "data");
const META_FILE_PATH = path.join(DATA_DIR, "meta.json");
const DEFAULT_GUIDE_TITLE = "Restaurants";
const OUTPUT_INDEX_FILE_NAME = "index.json";
const REQUIRED_STATIC_FILES = ["index.html"];
const OPTIONAL_STATIC_FILES = ["CNAME"];

function isAbsoluteUrl(value) {
  return /^(?:[a-z][a-z\d+\-.]*:)?\/\//i.test(value) || /^[a-z][a-z\d+\-.]*:/i.test(value);
}

function toPosixPath(filePath) {
  return filePath.split(path.sep).join("/");
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function ensureFiniteNumber(value, fieldName, itemId) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid '${fieldName}' in data/${itemId}/info.json. Expected a finite number.`);
  }
  return parsed;
}

function ensureStringField(value, fieldName, itemId) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid '${fieldName}' in data/${itemId}/info.json. Expected a non-empty string.`);
  }
  return value.trim();
}

function ensureOptionalBooleanField(value, fieldName, itemId) {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new Error(`Invalid '${fieldName}' in data/${itemId}/info.json. Expected a boolean.`);
  }
  return value;
}

function normalizeLocalImageReference(photoPath, itemId) {
  const normalizedRelativePath = toPosixPath(photoPath).replace(/^\/+/, "");
  if (normalizedRelativePath.length === 0 || normalizedRelativePath.includes("..")) {
    throw new Error(
      `Invalid local photo path '${photoPath}' in data/${itemId}/info.json. Path must stay within images/.`
    );
  }
  return normalizedRelativePath;
}

async function readJsonFile(filePath, contextLabel) {
  let text;
  try {
    text = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      throw new Error(`Missing required file: ${contextLabel} (${filePath})`);
    }
    throw error;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid JSON in ${contextLabel} (${filePath}): ${error.message}`);
  }
}

async function ensureDistDirectory() {
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
    }),
    cssnano({
      preset: "default"
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

async function listFilesRecursively(directoryPath, rootPath = directoryPath) {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  const filePaths = [];

  for (const entry of entries) {
    const absolutePath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      const nested = await listFilesRecursively(absolutePath, rootPath);
      filePaths.push(...nested);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    filePaths.push(toPosixPath(path.relative(rootPath, absolutePath)));
  }

  return filePaths.sort((a, b) => a.localeCompare(b));
}

async function copyDirectoryContents(sourceDir, destinationDir) {
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  if (entries.length === 0) {
    return;
  }

  await fs.mkdir(destinationDir, { recursive: true });

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const destinationPath = path.join(destinationDir, entry.name);
    if (entry.isDirectory()) {
      await copyDirectoryContents(sourcePath, destinationPath);
      continue;
    }
    if (entry.isFile()) {
      await fs.copyFile(sourcePath, destinationPath);
    }
  }
}

async function readGuideMeta() {
  const metaPayload = await readJsonFile(META_FILE_PATH, "data/meta.json");
  const title =
    typeof metaPayload?.title === "string" && metaPayload.title.trim().length > 0
      ? metaPayload.title.trim()
      : DEFAULT_GUIDE_TITLE;
  const categoryConfig = isPlainObject(metaPayload?.categoryConfig)
    ? metaPayload.categoryConfig
    : undefined;

  return {
    title,
    categoryConfig
  };
}

function normalizePhotoEntry(photoEntry, itemId, imageFileSet) {
  if (typeof photoEntry === "string") {
    if (isAbsoluteUrl(photoEntry)) {
      return photoEntry;
    }
    const normalizedLocalPath = normalizeLocalImageReference(photoEntry, itemId);
    if (!imageFileSet.has(normalizedLocalPath)) {
      throw new Error(
        `Photo '${photoEntry}' in data/${itemId}/info.json does not exist in data/${itemId}/images/.`
      );
    }
    return `data/${itemId}/images/${normalizedLocalPath}`;
  }

  if (photoEntry && typeof photoEntry === "object" && !Array.isArray(photoEntry)) {
    if (typeof photoEntry.url !== "string" || photoEntry.url.trim().length === 0) {
      throw new Error(`Invalid photo entry in data/${itemId}/info.json. Each object photo needs a url.`);
    }

    if (isAbsoluteUrl(photoEntry.url)) {
      return {
        ...photoEntry,
        url: photoEntry.url
      };
    }

    const normalizedLocalPath = normalizeLocalImageReference(photoEntry.url, itemId);
    if (!imageFileSet.has(normalizedLocalPath)) {
      throw new Error(
        `Photo '${photoEntry.url}' in data/${itemId}/info.json does not exist in data/${itemId}/images/.`
      );
    }

    return {
      ...photoEntry,
      url: `data/${itemId}/images/${normalizedLocalPath}`
    };
  }

  throw new Error(
    `Invalid photo entry in data/${itemId}/info.json. Expected a URL string or object with a 'url' field.`
  );
}

async function collectRestaurants() {
  const directoryEntries = await fs.readdir(DATA_DIR, { withFileTypes: true });
  const itemIds = directoryEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  if (itemIds.length === 0) {
    throw new Error("No restaurant entries found. Add folders under data/<item-id>/.");
  }

  const restaurants = [];
  const imageCopyTasks = [];

  for (const itemId of itemIds) {
    const infoFilePath = path.join(DATA_DIR, itemId, "info.json");
    const infoPayload = await readJsonFile(infoFilePath, `data/${itemId}/info.json`);

    const id = ensureStringField(infoPayload.id, "id", itemId);
    if (id !== itemId) {
      throw new Error(`data/${itemId}/info.json has id '${id}', but folder name is '${itemId}'.`);
    }

    const restaurant = {
      ...infoPayload,
      id,
      name: ensureStringField(infoPayload.name, "name", itemId),
      category: ensureStringField(infoPayload.category, "category", itemId),
      lat: ensureFiniteNumber(infoPayload.lat, "lat", itemId),
      lng: ensureFiniteNumber(infoPayload.lng, "lng", itemId)
    };

    if (Object.hasOwn(restaurant, "specialRecommendation")) {
      restaurant.specialRecommendation = ensureOptionalBooleanField(
        restaurant.specialRecommendation,
        "specialRecommendation",
        itemId
      );
    }

    const itemImagesSourceDir = path.join(DATA_DIR, itemId, "images");
    let imageFiles = [];
    try {
      imageFiles = await listFilesRecursively(itemImagesSourceDir);
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
        throw error;
      }
    }
    const imageFileSet = new Set(imageFiles);

    const hasPhotosField = Object.hasOwn(restaurant, "photos");
    if (hasPhotosField && !Array.isArray(restaurant.photos)) {
      throw new Error(`Invalid 'photos' in data/${itemId}/info.json. Expected an array.`);
    }

    if (Array.isArray(restaurant.photos) && restaurant.photos.length > 0) {
      restaurant.photos = restaurant.photos.map((entry) =>
        normalizePhotoEntry(entry, itemId, imageFileSet)
      );
    } else if (hasPhotosField) {
      // Keep explicit empty photos array as-is.
      restaurant.photos = [];
    } else if (imageFiles.length > 0) {
      restaurant.photos = imageFiles.map((imagePath) => `data/${itemId}/images/${imagePath}`);
    }

    restaurants.push(restaurant);
    imageCopyTasks.push({
      sourceDir: itemImagesSourceDir,
      distDir: path.join(DIST_DIR, "data", itemId, "images")
    });
  }

  return {
    restaurants,
    imageCopyTasks
  };
}

async function writeOutputIndex(guideMeta, restaurants) {
  const outputPath = path.join(DIST_DIR, OUTPUT_INDEX_FILE_NAME);
  const payload = {
    restaurants
  };

  payload.title = guideMeta.title;
  if (guideMeta.categoryConfig !== undefined) {
    payload.categoryConfig = guideMeta.categoryConfig;
  }

  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function copyRestaurantImages(imageCopyTasks) {
  for (const task of imageCopyTasks) {
    try {
      await fs.access(task.sourceDir);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        continue;
      }
      throw error;
    }
    await copyDirectoryContents(task.sourceDir, task.distDir);
  }
}

async function build() {
  const guideMeta = await readGuideMeta();
  const { restaurants, imageCopyTasks } = await collectRestaurants();

  const browserTargets = getBrowserTargets();
  const esbuildTargets = browserslistToEsbuild(browserTargets);

  await ensureDistDirectory();
  await Promise.all([buildJavaScript(esbuildTargets), buildStyles(browserTargets)]);
  await copyStaticFiles();
  await copyRestaurantImages(imageCopyTasks);
  await writeOutputIndex(guideMeta, restaurants);

  process.stdout.write(
    `Build complete. Output: dist/\nData index: dist/${OUTPUT_INDEX_FILE_NAME}\nRestaurants: ${restaurants.length}\nTargets: ${browserTargets.join(", ")}\n`
  );
}

build().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
