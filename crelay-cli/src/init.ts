import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import prompts from "prompts";
import pc from "picocolors";
import { DEFAULT_GATEWAY_URL, DEFAULT_TEST_PATH, normalizePath } from "./config.js";
import { type Logger } from "./output.js";

export interface InitOptions {
  cwd?: string;
  gatewayUrl?: string;
  tenantId?: string;
  kid?: string;
  target?: string;
  path?: string;
}

interface InitAnswers {
  gatewayUrl: string;
  tenantId: string;
  kid: string;
  targetOrigin: string;
  testPath: string;
}

export async function runInit(logger: Logger, options: InitOptions = {}): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const provided = normalizeProvidedOptions(options);
  const missingPrompts = buildPrompts(provided);
  const prompted = missingPrompts.length
    ? await prompts(missingPrompts, {
        onCancel: () => {
          throw new Error("init cancelled");
        },
      }) as Partial<InitAnswers>
    : {};

  const answers = {
    ...provided,
    ...prompted,
  } as InitAnswers;

  await writeInitFiles(cwd, normalizeAnswers(answers));
  logger.log(pc.green("Created CRelay integration files:"));
  logger.log("  crelay.config.json");
  logger.log("  .env.crelay.example");
  logger.log("  examples/crelay-test.mjs");
  return 0;
}

function buildPrompts(provided: Partial<InitAnswers>): prompts.PromptObject[] {
  const questions: prompts.PromptObject[] = [
    {
      type: "text",
      name: "gatewayUrl",
      message: "Gateway URL",
      initial: DEFAULT_GATEWAY_URL,
      validate: (value: string) => isValidHttpUrl(value) ? true : "Enter a valid HTTP(S) gateway URL",
    },
    {
      type: "text",
      name: "tenantId",
      message: "Tenant ID",
      validate: (value: string) => value.trim() ? true : "tenantId is required",
    },
    {
      type: "text",
      name: "kid",
      message: "Key ID (kid)",
      validate: (value: string) => value.trim() ? true : "kid is required",
    },
    {
      type: "text",
      name: "targetOrigin",
      message: "Target origin",
      validate: (value: string) => isValidHttpUrl(value) ? true : "Enter a valid origin, for example https://api.example.com",
    },
    {
      type: "text",
      name: "testPath",
      message: "Health/test path",
      initial: DEFAULT_TEST_PATH,
    },
  ];

  return questions.filter((question) => !provided[question.name as keyof InitAnswers]);
}

function normalizeProvidedOptions(options: InitOptions): Partial<InitAnswers> {
  return {
    gatewayUrl: options.gatewayUrl,
    tenantId: options.tenantId,
    kid: options.kid,
    targetOrigin: options.target,
    testPath: options.path,
  };
}

export async function writeInitFiles(cwd: string, answers: InitAnswers): Promise<void> {
  const examplesDir = path.join(cwd, "examples");
  await mkdir(examplesDir, { recursive: true });

  await writeFile(
    path.join(cwd, "crelay.config.json"),
    `${JSON.stringify({
      gatewayUrl: answers.gatewayUrl,
      tenantId: answers.tenantId,
      kid: answers.kid,
      target: {
        origin: answers.targetOrigin,
        testPath: normalizePath(answers.testPath),
      },
    }, null, 2)}\n`,
    "utf8",
  );

  await writeFile(
    path.join(cwd, ".env.crelay.example"),
    [
      `CRELAY_BASE_URL=${answers.gatewayUrl}`,
      "CRELAY_API_KEY=replace_with_your_crelay_api_key",
      `CRELAY_TENANT_ID=${answers.tenantId}`,
      `CRELAY_KID=${answers.kid}`,
      "CRELAY_KEY_B64=replace_with_32_byte_base64_key",
      `CRELAY_TARGET_ORIGIN=${answers.targetOrigin}`,
      `CRELAY_TEST_PATH=${normalizePath(answers.testPath)}`,
      "",
    ].join("\n"),
    "utf8",
  );

  await writeFile(
    path.join(examplesDir, "crelay-test.mjs"),
    exampleScript(),
    "utf8",
  );
}

function normalizeAnswers(answers: InitAnswers): InitAnswers {
  return {
    gatewayUrl: answers.gatewayUrl.trim().replace(/\/+$/, ""),
    tenantId: answers.tenantId.trim(),
    kid: answers.kid.trim(),
    targetOrigin: new URL(answers.targetOrigin.trim()).origin,
    testPath: normalizePath(answers.testPath),
  };
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function exampleScript(): string {
  return `#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { config as loadEnv } from "dotenv";
import { CRelayClient } from "@crelay/sdk";

loadEnv();
loadEnv({ path: ".env.crelay", override: true });

const config = JSON.parse(await readFile("crelay.config.json", "utf8"));
const targetOrigin = process.env.CRELAY_TARGET_ORIGIN ?? config.target.origin;
const testPath = process.env.CRELAY_TEST_PATH ?? config.target.testPath ?? "/health";

const client = new CRelayClient({
  baseUrl: process.env.CRELAY_BASE_URL ?? config.gatewayUrl,
  apiKey: process.env.CRELAY_API_KEY,
  tenantId: process.env.CRELAY_TENANT_ID ?? config.tenantId,
  kid: process.env.CRELAY_KID ?? config.kid,
  keyB64: process.env.CRELAY_KEY_B64,
});

const result = await client.secureRequest({
  targetUrl: new URL(testPath, targetOrigin).toString(),
  method: "GET",
  data: null,
});

console.log(JSON.stringify(result.data, null, 2));
`;
}
