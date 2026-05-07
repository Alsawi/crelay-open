import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "dotenv";

export const DEFAULT_GATEWAY_URL = "https://gateway.crelay.dev";
export const DEFAULT_TEST_PATH = "/health";

export interface TargetEntry {
  name?: string;
  origin?: string;
  testPath?: string;
}

export interface CRelayConfigFile {
  gatewayUrl?: string;
  tenantId?: string;
  kid?: string;
  targetOrigin?: string;
  target?: string | { origin?: string; testPath?: string };
  targets?: TargetEntry[];
}

export interface RuntimeConfig {
  baseUrl?: string;
  apiKey?: string;
  tenantId?: string;
  kid?: string;
  keyB64?: string;
  targetOrigin?: string;
  testPath: string;
  config: CRelayConfigFile;
  envFiles: string[];
}

export function getDefaultTargetOrigin(config: CRelayConfigFile): string | undefined {
  if (config.targetOrigin) return config.targetOrigin;
  if (typeof config.target === "string") return config.target;
  if (typeof config.target === "object" && config.target?.origin) return config.target.origin;
  if (config.targets?.[0]?.origin) return config.targets[0].origin;
  return undefined;
}

export async function loadRuntimeConfig(cwd: string, env: NodeJS.ProcessEnv = process.env): Promise<RuntimeConfig> {
  const config = await readConfigFile(cwd);
  const { values: fileEnv, files } = await readEnvFiles(cwd);
  const mergedEnv = {
    ...fileEnv,
    ...env,
  };

  const configTestPath = typeof config.target === "object" ? config.target?.testPath : undefined;

  return {
    baseUrl: firstValue(mergedEnv.CRELAY_BASE_URL, config.gatewayUrl),
    apiKey: firstValue(mergedEnv.CRELAY_API_KEY),
    tenantId: firstValue(mergedEnv.CRELAY_TENANT_ID, config.tenantId),
    kid: firstValue(mergedEnv.CRELAY_KID, config.kid),
    keyB64: firstValue(mergedEnv.CRELAY_KEY_B64),
    targetOrigin: normalizeOrigin(firstValue(mergedEnv.CRELAY_TARGET_ORIGIN, getDefaultTargetOrigin(config))),
    testPath: normalizePath(firstValue(mergedEnv.CRELAY_TEST_PATH, configTestPath, DEFAULT_TEST_PATH) ?? DEFAULT_TEST_PATH),
    config,
    envFiles: files,
  };
}

export async function readConfigFile(cwd: string): Promise<CRelayConfigFile> {
  const file = path.join(cwd, "crelay.config.json");
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse crelay.config.json: ${(err as Error).message}`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("crelay.config.json must contain a JSON object.");
  }

  return parsed as CRelayConfigFile;
}

async function readEnvFiles(cwd: string): Promise<{ values: Record<string, string>; files: string[] }> {
  const values: Record<string, string> = {};
  const files: string[] = [];

  for (const filename of [".env", ".env.local", ".env.crelay"]) {
    const file = path.join(cwd, filename);
    try {
      Object.assign(values, parse(await readFile(file, "utf8")));
      files.push(filename);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        throw err;
      }
    }
  }

  return { values, files };
}

export function normalizePath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_TEST_PATH;
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export function joinTargetUrl(origin: string, requestPath: string): string {
  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) {
    throw new Error("target origin is required.");
  }

  return `${normalizedOrigin}${normalizePath(requestPath)}`;
}

export function validateGatewayUrl(value: string | undefined): { ok: boolean; message: string } {
  if (!value) {
    return { ok: false, message: "missing" };
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { ok: false, message: "must use http or https" };
    }
    return { ok: true, message: url.origin };
  } catch {
    return { ok: false, message: "invalid URL" };
  }
}

function normalizeOrigin(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

function firstValue(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (value !== undefined && value.trim() !== "") {
      return value.trim();
    }
  }
  return undefined;
}
