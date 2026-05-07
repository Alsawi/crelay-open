import crypto from "node:crypto";
import {
  assertEnvelope,
  decrypt,
  encrypt,
  validateTimestamp,
} from "@crelay/sdk";
import pc from "picocolors";
import { calculateAad } from "./aad.js";
import { joinTargetUrl, loadRuntimeConfig, normalizePath } from "./config.js";
import { detectFailureCode, explainFailure, GATEWAY_ERROR_EXPLANATIONS } from "./errors.js";
import { validateKeyB64 } from "./key.js";
import { maskSecret } from "./mask.js";
import { type Logger } from "./output.js";
import { loadPayload } from "./payload.js";
import { explainUpstreamStatus, formatBody, summarizeBody, unwrapResponse } from "./response.js";
import { sanitizeSecrets } from "./safety.js";
import { sendEvent } from "./telemetry.js";
import { normalizeMethod } from "./test-command.js";

const LARGE_PAYLOAD_BYTES = 64 * 1024;

export interface DebugOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  target?: string;
  method?: string;
  body?: string;
  path?: string;
  verbose?: boolean;
  showPayload?: boolean;
}

interface ParsedTarget {
  origin: string;
  path: string;
  targetUrl: string;
  hasQuery: boolean;
}

export async function runDebug(logger: Logger, options: DebugOptions = {}): Promise<number> {
  const startTime = Date.now();
  const cwd = options.cwd ?? process.cwd();
  const fetchImpl = options.fetchImpl ?? fetch;
  const config = await loadRuntimeConfig(cwd, options.env);
  const method = normalizeMethod(options.method ?? "GET");
  const target = parseTarget(options.target, options.path, config.targetOrigin, config.testPath);
  const payload = await loadPayload(options.body, cwd, method);
  const keyValidation = validateKeyB64(config.keyB64);

  logger.log("CRelay debug");
  logger.log(section("Config"));
  logger.log(`gateway URL: ${config.baseUrl ?? "<missing>"}`);
  logger.log(`tenantId: ${config.tenantId ?? "<missing>"}`);
  logger.log(`kid: ${config.kid ?? "<missing>"}`);
  logger.log(`API key: ${maskSecret(config.apiKey)}`);
  logger.log(`keyB64: ${keyValidation.ok ? `valid (${keyValidation.byteLength} bytes)` : keyValidation.message}`);

  logger.log(section("Target"));
  if (target) {
    logger.log(`origin: ${target.origin}`);
    logger.log(`path: ${target.path}`);
    logger.log(`method: ${method}`);
    logger.log(`query string present: ${target.hasQuery ? "yes" : "no"}`);
    if (target.hasQuery) {
      logger.log(pc.yellow("note: query string is not included in v0.1 AAD"));
    }
  } else {
    logger.log(pc.red("target: missing"));
  }

  if (!config.baseUrl || !config.apiKey || !config.tenantId || !config.kid || !config.keyB64 || !target) {
    logger.error(pc.red("Missing required CRelay configuration. Run `crelay doctor` for details."));
    await sendDebugEvent("debug_completed", {
      command: "debug",
      success: false,
      durationMs: Date.now() - startTime,
      method,
      nodeVersionMajor: parseInt(process.versions.node, 10),
      platform: process.platform,
      gatewayHost: config.baseUrl ? new URL(config.baseUrl).host : undefined,
      hasTarget: !!options.target,
      errorCategory: "MISSING_CONFIG",
    });
    return 1;
  }

  const aad = calculateAad(method, target.path, config.tenantId);
  logger.log(section("AAD"));
  logger.log(`request AAD: ${aad.requestAad}`);
  logger.log(`response AAD: ${aad.responseAad}`);

  logger.log(section("Payload"));
  logger.log(`JSON validity: ${payload.jsonValid ? "valid" : "invalid"}`);
  logger.log(`payload size: ${payload.sizeBytes} bytes`);
  if (payload.sizeBytes > LARGE_PAYLOAD_BYTES) {
    logger.log(pc.yellow(`warning: payload is larger than ${LARGE_PAYLOAD_BYTES} bytes`));
  }
  if (options.showPayload) {
    logger.log(pc.yellow("warning: --show-payload prints plaintext payload"));
    logger.log(formatBody(payload.value));
  } else {
    logger.log("plaintext payload: hidden (use --show-payload to print)");
  }

  if (!keyValidation.ok) {
    logger.error(pc.red("Cannot build envelope until CRELAY_KEY_B64 is valid."));
    await sendDebugEvent("debug_completed", {
      command: "debug",
      success: false,
      durationMs: Date.now() - startTime,
      method,
      nodeVersionMajor: parseInt(process.versions.node, 10),
      platform: process.platform,
      gatewayHost: new URL(config.baseUrl).host,
      hasTarget: !!options.target,
      errorCategory: "INVALID_KEY",
    });
    return 1;
  }

  const key = Buffer.from(config.keyB64, "base64");
  const requestId = crypto.randomUUID();
  const envelope = encrypt(payload.value, key, config.kid, aad.requestAad, requestId);

  logger.log(section("Envelope"));
  logger.log(`v: ${envelope.v}`);
  logger.log(`alg: ${envelope.alg}`);
  logger.log(`kid: ${envelope.kid}`);
  logger.log(`nonce length: ${Buffer.from(envelope.nonce, "base64").length} bytes`);
  logger.log(`ciphertext byte size: ${Buffer.from(envelope.ciphertext, "base64").length} bytes`);
  logger.log(`timestamp age: ${Math.max(0, Date.now() - envelope.ts)} ms`);
  logger.log(`requestId: ${requestId}`);
  logger.log(`ciphertext: ${options.verbose ? truncate(envelope.ciphertext) : "hidden"}`);

  logger.log(section("Gateway"));
  await reportHealth(logger, fetchImpl, config.baseUrl);

  try {
    const gatewayResponse = await fetchImpl(`${config.baseUrl.replace(/\/+$/, "")}/secure/forward`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": config.apiKey,
        "x-request-id": requestId,
      },
      body: JSON.stringify({
        targetUrl: target.targetUrl,
        method,
        envelope,
      }),
    });

    logger.log(`secure request status: ${gatewayResponse.status}`);

    if (!gatewayResponse.ok) {
      const text = await gatewayResponse.text().catch(() => "");
      const safeText = sanitizeSecrets(text, [config.apiKey, config.keyB64]);
      const code = detectFailureCode(safeText) ?? codeFromStatus(gatewayResponse.status);
      logger.log(`gateway error code: ${code ?? "UNKNOWN"}`);
      logger.error(pc.red(`gateway failure: ${safeText || gatewayResponse.statusText}`));
      logger.error(pc.yellow(explainFailure(new Error(code ?? safeText)).message));
      await sendDebugEvent("debug_completed", {
        command: "debug",
        success: false,
        durationMs: Date.now() - startTime,
        method,
        nodeVersionMajor: parseInt(process.versions.node, 10),
        platform: process.platform,
        gatewayHost: new URL(config.baseUrl).host,
        hasTarget: !!options.target,
        knownGatewayError: code ?? undefined,
        errorCategory: code ?? "GATEWAY_ERROR",
      });
      return 1;
    }

    let responseJson: unknown;
    try {
      responseJson = await gatewayResponse.json();
    } catch (err) {
      logger.log("response decrypt: failure");
      logger.error(pc.red(`gateway returned invalid JSON: ${(err as Error).message}`));
      await sendDebugEvent("debug_completed", {
        command: "debug",
        success: false,
        durationMs: Date.now() - startTime,
        method,
        nodeVersionMajor: parseInt(process.versions.node, 10),
        platform: process.platform,
        gatewayHost: new URL(config.baseUrl).host,
        hasTarget: !!options.target,
        errorCategory: "INVALID_JSON",
      });
      return 1;
    }

    let decrypted: unknown;
    try {
      const responseEnvelope = assertEnvelope(responseJson);
      validateTimestamp(responseEnvelope.ts);
      decrypted = decrypt(responseEnvelope, key, aad.responseAad);
      logger.log("response decrypt: success");
    } catch (err) {
      const explanation = explainFailure(err);
      logger.log("response decrypt: failure");
      logger.error(pc.red(sanitizeSecrets(err instanceof Error ? err.message : String(err), [config.apiKey, config.keyB64])));
      logger.error(pc.yellow(`${explanation.code} ${explanation.message}`));
      await sendDebugEvent("debug_completed", {
        command: "debug",
        success: false,
        durationMs: Date.now() - startTime,
        method,
        nodeVersionMajor: parseInt(process.versions.node, 10),
        platform: process.platform,
        gatewayHost: new URL(config.baseUrl).host,
        hasTarget: !!options.target,
        knownGatewayError: explanation.code !== "UNKNOWN" ? explanation.code : undefined,
        errorCategory: explanation.code,
      });
      return 1;
    }

    const { upstreamStatus, body } = unwrapResponse(decrypted);
    logger.log(`upstream status: ${upstreamStatus ?? "not provided"}`);
    const upstreamExplanation = explainUpstreamStatus(upstreamStatus);
    if (upstreamExplanation) {
      logger.log(pc.yellow(upstreamExplanation));
    }
    logger.log("decrypted response summary:");
    logger.log(options.verbose ? formatBody(body) : summarizeBody(body));

    const exitCode = upstreamStatus !== undefined && upstreamStatus >= 400 ? 1 : 0;
    await sendDebugEvent("debug_completed", {
      command: "debug",
      success: exitCode === 0,
      durationMs: Date.now() - startTime,
      method,
      nodeVersionMajor: parseInt(process.versions.node, 10),
      platform: process.platform,
      gatewayHost: new URL(config.baseUrl).host,
      hasTarget: !!options.target,
      upstreamStatus,
    });
    return exitCode;
  } catch (err) {
    const explanation = explainFailure(err);
    logger.error(pc.red(`secure request failed: ${sanitizeSecrets(err instanceof Error ? err.message : String(err), [config.apiKey, config.keyB64])}`));
    logger.error(pc.yellow(`${explanation.code} ${explanation.message}`));
    await sendDebugEvent("debug_completed", {
      command: "debug",
      success: false,
      durationMs: Date.now() - startTime,
      method,
      nodeVersionMajor: parseInt(process.versions.node, 10),
      platform: process.platform,
      gatewayHost: new URL(config.baseUrl).host,
      hasTarget: !!options.target,
      knownGatewayError: explanation.code !== "UNKNOWN" ? explanation.code : undefined,
      errorCategory: explanation.code,
    });
    return 1;
  }
}

async function sendDebugEvent(event: string, properties: Record<string, unknown>): Promise<void> {
  await sendEvent(event, properties);
}

function parseTarget(targetInput: string | undefined, pathInput: string | undefined, configOrigin: string | undefined, configPath: string): ParsedTarget | undefined {
  if (targetInput) {
    try {
      const url = new URL(targetInput);
      const path = normalizePath(pathInput ?? url.pathname);
      return {
        origin: url.origin,
        path,
        targetUrl: `${url.origin}${path}${pathInput ? "" : url.search}`,
        hasQuery: pathInput ? false : url.search.length > 0,
      };
    } catch {
      if (!configOrigin) return undefined;
      const path = normalizePath(pathInput ?? configPath);
      return {
        origin: targetInput.replace(/\/+$/, ""),
        path,
        targetUrl: joinTargetUrl(targetInput, path),
        hasQuery: false,
      };
    }
  }

  if (!configOrigin) return undefined;
  const path = normalizePath(pathInput ?? configPath);
  return {
    origin: configOrigin,
    path,
    targetUrl: joinTargetUrl(configOrigin, path),
    hasQuery: false,
  };
}

async function reportHealth(logger: Logger, fetchImpl: typeof fetch, baseUrl: string): Promise<void> {
  try {
    const response = await fetchImpl(new URL("/health", `${baseUrl.replace(/\/+$/, "")}/`), {
      method: "GET",
      signal: AbortSignal.timeout(5_000),
    });
    logger.log(`/health status: ${response.status}`);
  } catch (err) {
    logger.log(`/health status: failed (${(err as Error).message})`);
  }
}

function codeFromStatus(status: number): keyof typeof GATEWAY_ERROR_EXPLANATIONS | undefined {
  if (status === 401) return "AUTH_INVALID_API_KEY";
  if (status === 403) return "TARGET_NOT_ALLOWED";
  if (status === 409) return "REPLAY_DETECTED";
  if (status === 413) return "PAYLOAD_TOO_LARGE";
  if (status === 429) return "RATE_LIMITED";
  if (status === 504) return "UPSTREAM_TIMEOUT";
  if (status === 502) return "UPSTREAM_ERROR";
  return undefined;
}

function section(label: string): string {
  return pc.bold(label);
}

function truncate(value: string): string {
  if (value.length <= 72) return value;
  return `${value.slice(0, 36)}...${value.slice(-12)}`;
}
