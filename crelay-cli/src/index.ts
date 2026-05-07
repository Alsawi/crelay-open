#!/usr/bin/env node
import { createCli } from "./cli.js";

try {
  await createCli().parseAsync(process.argv);
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
}
