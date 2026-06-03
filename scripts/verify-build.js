const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const rootDir = path.resolve(__dirname, "..");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function exists(relativePath) {
  return fs.existsSync(path.join(rootDir, relativePath));
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, relativePath), "utf8"));
}

function filesEqual(left, right) {
  const leftPath = path.join(rootDir, left);
  const rightPath = path.join(rootDir, right);
  return fs.readFileSync(leftPath).equals(fs.readFileSync(rightPath));
}

function collectJsFiles(relativeDir) {
  const dir = path.join(rootDir, relativeDir);
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) return collectJsFiles(relativePath);
    return entry.isFile() && entry.name.endsWith(".js") ? [relativePath] : [];
  });
}

function collectApiFunctionFiles(relativeDir = "api") {
  const dir = path.join(rootDir, relativeDir);
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (entry.name.startsWith("_") || entry.name.startsWith(".")) return [];
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) return collectApiFunctionFiles(relativePath);
    if (!entry.isFile() || entry.name.endsWith(".d.ts")) return [];
    return /\.(js|mjs|cjs|ts)$/.test(entry.name) ? [relativePath] : [];
  });
}

const packageJson = readJson("package.json");
const vercelJson = readJson("vercel.json");

assert(packageJson.scripts && packageJson.scripts.build === "node scripts/build-static.js", "package.json build script is not configured correctly.");
assert(vercelJson.buildCommand === "npm run build", "vercel.json buildCommand must be npm run build.");
assert(vercelJson.outputDirectory === "public", "vercel.json outputDirectory must be public.");

const staticFiles = [
  "index.html",
  "PVMS_Portal V4.html",
  "assests/favicon.png",
  "assests/onepws-dark-logo-scaled.png",
  "assests/onepws-logo-black.webp",
  "assests/onepws-logo-transparent.png",
];

for (const file of staticFiles) {
  assert(exists(file), `Missing source file: ${file}`);
  assert(exists(path.join("public", file)), `Missing public build file: public/${file}`);
  assert(filesEqual(file, path.join("public", file)), `Public file is out of sync: public/${file}`);
}

assert(filesEqual("index.html", "PVMS_Portal V4.html"), "index.html and PVMS_Portal V4.html must stay identical.");

const indexHtml = fs.readFileSync(path.join(rootDir, "index.html"), "utf8");
assert(indexHtml.includes('<div id="root"></div>'), "index.html is missing the React root element.");
assert(indexHtml.includes('script type="text/babel"'), "index.html is missing the Babel React script.");
assert(indexHtml.includes("ReactDOM.createRoot"), "index.html is missing the React mount call.");
assert(indexHtml.includes("/api/sync"), "index.html is missing the sync API integration.");

const apiFunctions = collectApiFunctionFiles();
assert(apiFunctions.length <= 12, `Vercel Hobby supports 12 serverless functions; found ${apiFunctions.length}: ${apiFunctions.join(", ")}`);

for (const file of [...collectJsFiles("api"), ...collectJsFiles("scripts")]) {
  execFileSync(process.execPath, ["--check", path.join(rootDir, file)], { stdio: "pipe" });
}

console.log("Build verification passed.");
