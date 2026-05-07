import { Command } from "commander";
import { runDebug } from "./debug.js";
import { runDoctor } from "./doctor.js";
import { runInit } from "./init.js";
import { runTest } from "./test-command.js";
import { consoleLogger } from "./output.js";

export function createCli(): Command {
  const program = new Command();

  program
    .name("crelay")
    .description("Developer integration CLI for CRelay")
    .version("0.1.0");

  program
    .command("init")
    .description("Create CRelay integration config and example files")
    .option("--gateway-url <url>", "CRelay gateway URL")
    .option("--tenant-id <id>", "CRelay tenant ID")
    .option("--kid <kid>", "CRelay key ID")
    .option("--target <origin>", "Target API origin")
    .option("--path <path>", "Health/test path")
    .action(async (options: { gatewayUrl?: string; tenantId?: string; kid?: string; target?: string; path?: string }) => {
      process.exitCode = await runInit(consoleLogger, options);
    });

  program
    .command("doctor")
    .description("Validate local CRelay configuration and gateway reachability")
    .action(async () => {
      process.exitCode = await runDoctor(consoleLogger);
    });

  program
    .command("test")
    .description("Send a secure test request through the CRelay gateway")
    .option("--method <method>", "HTTP method, GET or POST", "GET")
    .option("--path <path>", "Target path to request")
    .option("--target <origin>", "Target origin override")
    .option("--body <jsonOrFile>", "Inline JSON or path to a JSON body file")
    .option("--show-response", "Print the full decrypted response body")
    .action(async (options: { method?: string; path?: string; target?: string; body?: string; showResponse?: boolean }) => {
      process.exitCode = await runTest(consoleLogger, options);
    });

  program
    .command("debug")
    .description("Inspect CRelay request configuration, AAD, payload, envelope, and gateway result")
    .option("--target <url>", "Full target URL or target origin")
    .option("--method <method>", "HTTP method, GET or POST", "GET")
    .option("--body <jsonOrFile>", "Inline JSON or path to a JSON body file")
    .option("--json <inline>", "Inline JSON body (shorthand for --body)")
    .option("--path <path>", "AAD/test path override")
    .option("--verbose", "Print additional diagnostics with truncated ciphertext")
    .option("--show-payload", "Print plaintext payload")
    .action(async (options: { target?: string; method?: string; body?: string; json?: string; path?: string; verbose?: boolean; showPayload?: boolean }) => {
      const body = options.json ?? options.body;
      process.exitCode = await runDebug(consoleLogger, { ...options, body });
    });

  return program;
}
