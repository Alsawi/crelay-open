import { loadRuntimeConfig, validateGatewayUrl, type RuntimeConfig } from "./config.js";
import { validateKeyB64 } from "./key.js";
import { maskSecret } from "./mask.js";
import { fail, info, pass, type Logger } from "./output.js";

export interface DoctorOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}

interface CheckResult {
  ok: boolean;
  line: string;
}

export async function runDoctor(logger: Logger, options: DoctorOptions = {}): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const fetchImpl = options.fetchImpl ?? fetch;
  const config = await loadRuntimeConfig(cwd, options.env);

  logger.log("CRelay doctor");
  logger.log(info("config", `env files: ${config.envFiles.length ? config.envFiles.join(", ") : "none"}, crelay.config.json: ${Object.keys(config.config).length ? "found" : "not found"}`));

  const checks = await collectDoctorChecks(config, fetchImpl);
  for (const check of checks) {
    logger.log(check.line);
  }

  return checks.every((check) => check.ok) ? 0 : 1;
}

async function collectDoctorChecks(config: RuntimeConfig, fetchImpl: typeof fetch): Promise<CheckResult[]> {
  const checks: CheckResult[] = [];

  checks.push(gatewayUrlCheck(config.baseUrl));
  checks.push(requiredCheck("CRELAY_API_KEY", config.apiKey, maskSecret));
  checks.push(requiredCheck("CRELAY_TENANT_ID", config.tenantId));
  checks.push(requiredCheck("CRELAY_KID", config.kid));

  const keyResult = validateKeyB64(config.keyB64);
  checks.push({
    ok: keyResult.ok,
    line: keyResult.ok
      ? pass("CRELAY_KEY_B64", `${maskSecret(config.keyB64)} (${keyResult.byteLength} bytes)`)
      : fail("CRELAY_KEY_B64", keyResult.message),
  });

  checks.push(requiredCheck("target origin", config.targetOrigin));
  checks.push(await gatewayHealthCheck(config.baseUrl, fetchImpl));

  return checks;
}

function gatewayUrlCheck(value: string | undefined): CheckResult {
  const result = validateGatewayUrl(value);
  return {
    ok: result.ok,
    line: result.ok ? pass("CRELAY_BASE_URL", result.message) : fail("CRELAY_BASE_URL", result.message),
  };
}

function requiredCheck(label: string, value: string | undefined, display: (value: string) => string = (v) => v): CheckResult {
  if (!value) {
    return {
      ok: false,
      line: fail(label, "missing"),
    };
  }

  return {
    ok: true,
    line: pass(label, display(value)),
  };
}

async function gatewayHealthCheck(baseUrl: string | undefined, fetchImpl: typeof fetch): Promise<CheckResult> {
  if (!baseUrl) {
    return {
      ok: false,
      line: fail("gateway /health", "CRELAY_BASE_URL is missing"),
    };
  }

  let url: URL;
  try {
    url = new URL("/health", `${baseUrl.replace(/\/+$/, "")}/`);
  } catch {
    return {
      ok: false,
      line: fail("gateway /health", `invalid CRELAY_BASE_URL: ${baseUrl}`),
    };
  }

  try {
    const response = await fetchImpl(url, {
      method: "GET",
      signal: AbortSignal.timeout(5_000),
    });
    if (response.ok) {
      return {
        ok: true,
        line: pass("gateway /health", `${response.status} ${response.statusText}`.trim()),
      };
    }

    return {
      ok: false,
      line: fail("gateway /health", `${response.status} ${response.statusText}`.trim()),
    };
  } catch (err) {
    return {
      ok: false,
      line: fail("gateway /health", (err as Error).message),
    };
  }
}
