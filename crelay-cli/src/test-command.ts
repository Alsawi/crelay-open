import { CRelayClient } from "@crelay/sdk";
import pc from "picocolors";
import { joinTargetUrl, loadRuntimeConfig } from "./config.js";
import { explainFailure } from "./errors.js";
import { maskSecret } from "./mask.js";
import { type Logger } from "./output.js";
import { loadPayload } from "./payload.js";
import { explainUpstreamStatus, formatBody, summarizeBody, unwrapResponse } from "./response.js";
import { sanitizeSecrets } from "./safety.js";

export interface TestOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  method?: string;
  path?: string;
  target?: string;
  body?: string;
  showResponse?: boolean;
}

export async function runTest(logger: Logger, options: TestOptions = {}): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const config = await loadRuntimeConfig(cwd, options.env);
  const method = normalizeMethod(options.method ?? "GET");
  const requestPath = options.path ?? config.testPath;
  const targetOrigin = options.target ?? config.targetOrigin;
  const payload = await loadPayload(options.body, cwd, method);

  if (!config.baseUrl || !config.apiKey || !config.tenantId || !config.kid || !config.keyB64 || !targetOrigin) {
    logger.error(pc.red("Missing required CRelay configuration. Run `crelay doctor` for details."));
    return 1;
  }

  const targetUrl = joinTargetUrl(targetOrigin, requestPath);
  logger.log(`Gateway: ${config.baseUrl}`);
  logger.log(`Target: ${targetUrl}`);
  logger.log(`Method: ${method}`);
  logger.log(`API key: ${maskSecret(config.apiKey)}`);
  logger.log(`Key: ${maskSecret(config.keyB64)}`);

  try {
    const client = new CRelayClient({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      tenantId: config.tenantId,
      kid: config.kid,
      keyB64: config.keyB64,
    });

    const result = await client.secureRequest({
      targetUrl,
      method,
      data: payload.value,
    });

    const { upstreamStatus, body } = unwrapResponse(result.data);
    logger.log(`${pc.green("gateway status:")} 200`);
    logger.log(`${pc.green("upstream status:")} ${upstreamStatus ?? "not provided"}`);
    const upstreamExplanation = explainUpstreamStatus(upstreamStatus);
    if (upstreamExplanation) {
      logger.log(pc.yellow(upstreamExplanation));
    }
    logger.log(`${pc.green(options.showResponse ? "decrypted response body:" : "decrypted response summary:")}`);
    logger.log(options.showResponse ? formatBody(body) : summarizeBody(body));
    return 0;
  } catch (err) {
    const explanation = explainFailure(err);
    const safeMessage = sanitizeSecrets(err instanceof Error ? err.message : String(err), [config.apiKey, config.keyB64]);
    logger.error(`${pc.red("secure request failed:")} ${safeMessage}`);
    logger.error(`${pc.yellow(explanation.code)} ${explanation.message}`);
    return 1;
  }
}

export function normalizeMethod(method: string): "GET" | "POST" {
  const normalized = method.toUpperCase();
  if (normalized !== "GET" && normalized !== "POST") {
    throw new Error("--method must be GET or POST.");
  }
  return normalized;
}
