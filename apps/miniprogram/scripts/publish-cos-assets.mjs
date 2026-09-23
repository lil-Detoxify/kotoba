#!/usr/bin/env node
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import https from "node:https";
import { buildManifest, writeManifest } from "./cos-asset-manifest.mjs";

function parseArgs(args) {
  const options = { scope: "books", dryRun: false, verifyOnly: false, concurrency: 4 };
  for (const arg of args) {
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--verify") options.verifyOnly = true;
    else if (arg.startsWith("--scope=")) options.scope = arg.slice("--scope=".length);
    else if (arg.startsWith("--concurrency=")) options.concurrency = Number(arg.slice("--concurrency=".length));
    else throw new Error(`未知参数: ${arg}`);
  }
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 16) {
    throw new Error("--concurrency 必须是 1 到 16 的整数");
  }
  return options;
}

function requiredEnvironment() {
  const values = {
    SecretId: process.env.TENCENT_COS_SECRET_ID,
    SecretKey: process.env.TENCENT_COS_SECRET_KEY,
    SecurityToken: process.env.TENCENT_COS_SESSION_TOKEN,
    Bucket: process.env.TENCENT_COS_BUCKET,
    Region: process.env.TENCENT_COS_REGION,
    PublicBaseUrl: process.env.TENCENT_COS_PUBLIC_BASE_URL,
  };
  const missing = ["SecretId", "SecretKey", "Bucket", "Region", "PublicBaseUrl"].filter((key) => !values[key]);
  if (missing.length) {
    throw new Error(`缺少 COS 环境变量: ${missing.map((key) => ({ SecretId: "TENCENT_COS_SECRET_ID", SecretKey: "TENCENT_COS_SECRET_KEY", Bucket: "TENCENT_COS_BUCKET", Region: "TENCENT_COS_REGION", PublicBaseUrl: "TENCENT_COS_PUBLIC_BASE_URL" })[key]).join(", ")}`);
  }
  if (!/^.+-\d+$/.test(values.Bucket)) throw new Error("TENCENT_COS_BUCKET 必须是包含 APPID 后缀的完整 Bucket 名称");
  if (!/^https:\/\/[a-z0-9.-]+\/?$/i.test(values.PublicBaseUrl)) {
    throw new Error("TENCENT_COS_PUBLIC_BASE_URL 必须是无路径、无参数的公开 HTTPS 域名");
  }
  values.PublicBaseUrl = values.PublicBaseUrl.replace(/\/$/, "");
  return values;
}

function call(cos, method, params) {
  return new Promise((resolve, reject) => cos[method](params, (error, data) => error ? reject(error) : resolve(data)));
}

async function retryTransientRead(operation) {
  for (let attempt = 0; ; attempt += 1) {
    try { return await operation(); }
    catch (error) {
      if (attempt >= 3 || !["ECONNRESET", "ETIMEDOUT", "EPIPE", "EAI_AGAIN"].includes(error?.code)
        && ![429, 500, 502, 503, 504].includes(Number(error?.statusCode))) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
    }
  }
}

async function pooled(items, concurrency, operation) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await operation(items[index], index);
    }
  });
  await Promise.all(workers);
}

function headersOf(response) {
  const source = response?.headers || response?.Headers || {};
  return Object.fromEntries(Object.entries(source).map(([key, value]) => [key.toLowerCase(), String(value)]));
}

function headerMatches(headers, item) {
  return Number(headers["content-length"]) === item.size
    && headers["x-cos-meta-sha256"] === item.sha256
    && headers["content-type"]?.toLowerCase() === item.contentType.toLowerCase()
    && headers["cache-control"] === item.cacheControl;
}

function publicHeadersMatch(headers, item) {
  return Number(headers["content-length"]) === item.size
    && headers["content-type"]?.toLowerCase() === item.contentType.toLowerCase()
    && headers["cache-control"] === item.cacheControl;
}

async function remoteContentHash(cos, target, item) {
  const response = await call(cos, "getObject", { Bucket: target.Bucket, Region: target.Region, Key: item.key });
  if (!Buffer.isBuffer(response.Body)) throw new Error(`无法读取远端对象内容: ${item.key}`);
  return createHash("sha256").update(response.Body).digest("hex");
}

async function inspectRemote(cos, target, item) {
  let response;
  try {
    response = await call(cos, "headObject", { Bucket: target.Bucket, Region: target.Region, Key: item.key });
  } catch (error) {
    if (error?.statusCode === 404) return "missing";
    throw error;
  }
  const headers = headersOf(response);
  const contentHash = await remoteContentHash(cos, target, item);
  if (!headerMatches(headers, item) || contentHash !== item.sha256) {
    throw new Error(`现有 COS 对象与本地清单不一致，已停止且未覆盖: ${item.key}`);
  }
  return "same";
}

function anonymousGet(target, item) {
  const objectPath = item.key.split("/").map(encodeURIComponent).join("/");
  const url = `${target.PublicBaseUrl}/${objectPath}`;
  return new Promise((resolve, reject) => {
    const request = https.request(url, { method: "GET", timeout: 15_000 }, (response) => {
      const headers = Object.fromEntries(Object.entries(response.headers).map(([key, value]) => [key.toLowerCase(), Array.isArray(value) ? value.join(", ") : String(value ?? "")]));
      if (response.statusCode !== 200) {
        response.resume();
        reject(Object.assign(new Error(`匿名读取失败 ${response.statusCode ?? "unknown"}: ${item.key}`), { statusCode: response.statusCode }));
      } else if (!publicHeadersMatch(headers, item)) {
        response.resume();
        reject(new Error(`匿名响应头不符: ${item.key}`));
      } else {
        const hash = createHash("sha256");
        let bytes = 0;
        response.on("data", (chunk) => { bytes += chunk.length; hash.update(chunk); });
        response.on("end", () => {
          if (bytes !== item.size || hash.digest("hex") !== item.sha256) reject(new Error(`匿名下载内容校验失败: ${item.key}`));
          else resolve();
        });
        response.on("error", reject);
      }
    });
    request.on("timeout", () => request.destroy(Object.assign(new Error(`匿名读取超时: ${item.key}`), { code: "ETIMEDOUT" })));
    request.on("error", reject);
    request.end();
  });
}

async function listObjects(cos, target, prefix) {
  const result = new Map();
  let Marker;
  do {
    let page;
    try {
      page = await retryTransientRead(() => call(cos, "getBucket", { Bucket: target.Bucket, Region: target.Region, Prefix: prefix, Marker, MaxKeys: 1000 }));
    } catch (error) {
      if (error?.statusCode === 403) throw new Error(`COS 列目录权限不足: ${prefix}（GetBucket HTTP 403）`);
      throw error;
    }
    for (const object of page.Contents || []) result.set(object.Key, Number(object.Size));
    Marker = page.IsTruncated === "true" || page.IsTruncated === true ? page.NextMarker : undefined;
  } while (Marker);
  return result;
}

async function verify(cos, target, manifest, concurrency) {
  const expected = new Map(manifest.entries.map((item) => [item.key, item]));
  const prefixes = manifest.scope === "books" ? ["data/books/"] : manifest.scope === "audio" ? ["audio/"] : ["data/books/", "audio/"];
  const remote = new Map();
  for (const prefix of prefixes) for (const [key, size] of await listObjects(cos, target, prefix)) remote.set(key, size);
  const errors = [];
  for (const [key, item] of expected) {
    if (!remote.has(key)) errors.push(`缺少对象: ${key}`);
    else if (remote.get(key) !== item.size) errors.push(`大小不符: ${key}`);
  }
  for (const key of remote.keys()) if (!expected.has(key)) errors.push(`存在清单外对象: ${key}`);
  if (errors.length) throw new Error(`COS 清单校验失败\n${errors.slice(0, 20).join("\n")}${errors.length > 20 ? `\n另有 ${errors.length - 20} 项` : ""}`);

  await pooled(manifest.entries, concurrency, async (item) => {
    if (await retryTransientRead(() => inspectRemote(cos, target, item)) !== "same") {
      throw new Error(`远端内容或响应头不符: ${item.key}`);
    }
    await retryTransientRead(() => anonymousGet(target, item));
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const manifest = await buildManifest(options.scope);
  const outputPath = await writeManifest(manifest);
  console.log(`本地清单: ${manifest.objectCount} 个对象, ${manifest.totalBytes} 字节`);
  console.log(`清单文件: ${outputPath}`);
  if (options.dryRun) return;

  const target = requiredEnvironment();
  const module = await import("cos-nodejs-sdk-v5");
  const COS = module.default || module;
  const cos = new COS({ SecretId: target.SecretId, SecretKey: target.SecretKey, SecurityToken: target.SecurityToken });

  if (!options.verifyOnly) {
    // Preflight every key before the first upload so an existing divergent
    // object can never be silently overwritten or discovered mid-batch.
    const statuses = new Map();
    await pooled(manifest.entries, options.concurrency, async (item) => {
      statuses.set(item.key, await retryTransientRead(() => inspectRemote(cos, target, item)));
    });
    let uploaded = 0;
    let skipped = 0;
    await pooled(manifest.entries, options.concurrency, async (item) => {
      if (statuses.get(item.key) === "same") {
        skipped += 1;
        return;
      }
      await call(cos, "putObject", {
        Bucket: target.Bucket,
        Region: target.Region,
        Key: item.key,
        Body: createReadStream(item.localPath),
        ContentLength: item.size,
        ContentType: item.contentType,
        CacheControl: item.cacheControl,
        ACL: "public-read",
        "x-cos-meta-sha256": item.sha256,
      });
      uploaded += 1;
      if ((uploaded + skipped) % 100 === 0) console.log(`进度: ${uploaded} 上传, ${skipped} 跳过`);
    });
    console.log(`上传完成: ${uploaded} 上传, ${skipped} 跳过`);
    await verify(cos, target, manifest, options.concurrency);
  } else {
    await verify(cos, target, manifest, options.concurrency);
  }
  console.log(`远端校验通过: ${manifest.objectCount} 个对象, ${manifest.totalBytes} 字节`);
}

main().catch((error) => {
  // SDK errors can contain request details. Never print raw error objects,
  // URLs, headers or credential-bearing diagnostics to CI or terminal logs.
  const code = typeof error?.code === "string" ? error.code : undefined;
  const status = Number.isInteger(error?.statusCode) ? error.statusCode : undefined;
  const safeLocalMessage = error instanceof Error && /^(现有 COS 对象|COS 清单校验失败|COS 列目录权限不足|远端内容|匿名读取|匿名响应头|匿名下载内容|匿名读取超时|无法读取远端对象内容|缺少 COS 环境变量|TENCENT_COS_|未知参数|--concurrency|不支持的资源范围|教材)/.test(error.message)
    ? error.message : undefined;
  console.error(safeLocalMessage || `COS 操作失败${code ? `: ${code}` : ""}${status ? ` (HTTP ${status})` : ""}`);
  process.exitCode = 1;
});
