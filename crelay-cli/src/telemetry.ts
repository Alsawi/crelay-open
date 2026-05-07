import crypto from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const TELEMETRY_ENDPOINT = "https://crelay.dev/api/telemetry";

const SENSITIVE_KEYS = new Set([
  "apiKey",
  "keyB64",
  "payload",
  "headers",
  "targetUrl",
]);

export interface TelemetryConfig {
  enabled: boolean;
  anonymousId: string;
}

export interface TelemetryEvent {
  source: "cli";
  event: string;
  anonymousId?: string;
  properties?: Record<string, unknown>;
}

// ── Path helpers ───────────────────────────────────────────────────────

export function getConfigDir(override?: string): string {
  return override ?? path.join(os.homedir(), ".crelay");
}

export function getConfigPath(configDir?: string): string {
  return path.join(getConfigDir(configDir), "config.json");
}

// ── Config read/write ──────────────────────────────────────────────────

export async function readConfig(configDir?: string): Promise<TelemetryConfig | null> {
  try {
    const raw = await readFile(getConfigPath(configDir), "utf8");
    const parsed = JSON.parse(raw);
    if (typeof parsed.enabled !== "boolean" || typeof parsed.anonymousId !== "string") {
      return null;
    }
    return parsed as TelemetryConfig;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw err;
  }
}

export async function writeConfig(config: TelemetryConfig, configDir?: string): Promise<void> {
  const dir = getConfigDir(configDir);
  await mkdir(dir, { recursive: true });
  await writeFile(getConfigPath(configDir), JSON.stringify(config, null, 2) + "\n", "utf8");
}

// ── Anonymous ID ───────────────────────────────────────────────────────

export function generateAnonymousId(): string {
  return "anon_" + crypto.randomUUID();
}

// ── Config commands ────────────────────────────────────────────────────

export async function isTelemetryEnabled(configDir?: string): Promise<boolean> {
  const config = await readConfig(configDir);
  return config?.enabled ?? false;
}

export async function setTelemetryEnabled(enabled: boolean, configDir?: string): Promise<TelemetryConfig> {
  const existing = await readConfig(configDir);
  const updated: TelemetryConfig = {
    enabled,
    anonymousId: existing?.anonymousId ?? generateAnonymousId(),
  };
  await writeConfig(updated, configDir);
  return updated;
}

// ── Property sanitizer ─────────────────────────────────────────────────

export function sanitizeProperties(properties: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (!SENSITIVE_KEYS.has(key)) {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

// ── Send event (fire-and-forget) ───────────────────────────────────────

export async function sendEvent(
  event: string,
  properties?: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
  configDir?: string,
): Promise<void> {
  try {
    const enabled = await isTelemetryEnabled(configDir);
    if (!enabled) return;

    const config = await readConfig(configDir);
    if (!config) return;

    const sanitized = properties ? sanitizeProperties(properties) : undefined;

    const payload: TelemetryEvent = {
      source: "cli",
      event,
      anonymousId: config.anonymousId,
      properties: sanitized,
    };

    await fetchImpl(TELEMETRY_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(2_000),
    });
  } catch {
    // Telemetry failures must never break CLI commands
  }
}
