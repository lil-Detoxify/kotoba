import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = join(packageRoot, "src");
const outputRoot = join(packageRoot, "dist", "build", "mp-weixin");
const release = process.argv.includes("--release");
const maxMainPackageBytes = 2 * 1024 * 1024;
const audioExtensions = new Set([".mp3", ".m4a", ".wav", ".aac", ".ogg"]);
const codeExtensions = new Set([".ts", ".vue"]);
const forbidden = [
  ["window", /\bwindow\b/],
  ["document", /\bdocument\b/],
  ["localStorage", /\blocalStorage\b/],
  ["sessionStorage", /\bsessionStorage\b/],
  ["HTMLAudioElement", /\bHTMLAudioElement\b/],
  ["indexedDB", /\bindexedDB\b/],
  ["fetch", /\bfetch\s*\(/],
  ["location.href", /\blocation\.href\b/],
  ["vue-router", /["']vue-router["']/],
];

if (!existsSync(outputRoot)) fail("Build output is missing. Run the mini-program build first.");

const outputFiles = walk(outputRoot);
const totalBytes = outputFiles.reduce((sum, path) => sum + statSync(path).size, 0);
const bundledAudio = outputFiles.filter((path) => audioExtensions.has(extname(path).toLowerCase()));
if (totalBytes >= maxMainPackageBytes) fail(`Main package is ${totalBytes} bytes; limit is ${maxMainPackageBytes}.`);
if (bundledAudio.length) fail(`Bundled audio is forbidden: ${bundledAudio.map((path) => relative(outputRoot, path)).join(", ")}`);

const sourceHits = [];
for (const path of walk(sourceRoot).filter((candidate) => codeExtensions.has(extname(candidate).toLowerCase()))) {
  const source = readFileSync(path, "utf8");
  for (const [name, pattern] of forbidden) {
    if (pattern.test(source)) sourceHits.push(`${relative(sourceRoot, path)}: ${name}`);
  }
}
if (sourceHits.length) fail(`Browser-only API scan failed:\n${sourceHits.join("\n")}`);

const projectConfigPath = join(outputRoot, "project.config.json");
const projectConfig = JSON.parse(readFileSync(projectConfigPath, "utf8"));
const appConfig = JSON.parse(readFileSync(join(outputRoot, "app.json"), "utf8"));
if (appConfig.__usePrivacyCheck__ !== true) fail("Compiled app.json must enable __usePrivacyCheck__.");
if (appConfig.window?.pageOrientation !== "portrait") fail("Compiled app.json must lock portrait orientation.");
if (!Array.isArray(appConfig.pages) || !appConfig.pages.includes("pages/privacy/privacy")) {
  fail("Compiled app.json must register the local privacy notice page.");
}
const appid = typeof projectConfig.appid === "string" ? projectConfig.appid : "";
if (release && !/^wx[0-9a-zA-Z]{16}$/.test(appid)) {
  fail("Release verification requires a real 18-character WeChat AppID; touristappid is not accepted.");
}
if (release && projectConfig.setting?.urlCheck !== true) {
  fail("Release verification requires WeChat legal-domain checking to be enabled.");
}

console.log(JSON.stringify({
  files: outputFiles.length,
  bytes: totalBytes,
  mib: Number((totalBytes / 1024 / 1024).toFixed(3)),
  bundledAudio: bundledAudio.length,
  appid: appid || "missing",
  releaseReady: /^wx[0-9a-zA-Z]{16}$/.test(appid),
}, null, 2));

function walk(root) {
  const result = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) result.push(...walk(path));
    else if (entry.isFile()) result.push(path);
  }
  return result;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
