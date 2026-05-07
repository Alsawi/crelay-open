import { stat, readFile } from "node:fs/promises";
import path from "node:path";

export interface LoadedPayload {
  value: unknown;
  source: "default" | "inline" | "file";
  jsonValid: boolean;
  sizeBytes: number;
}

export async function loadPayload(input: string | undefined, cwd: string, method: string): Promise<LoadedPayload> {
  if (!input) {
    const value = method.toUpperCase() === "GET" ? null : {};
    return {
      value,
      source: "default",
      jsonValid: true,
      sizeBytes: Buffer.byteLength(JSON.stringify(value), "utf8"),
    };
  }

  const raw = await readBodyInput(input, cwd);
  try {
    return {
      value: JSON.parse(raw),
      source: isInlineJson(input) ? "inline" : "file",
      jsonValid: true,
      sizeBytes: Buffer.byteLength(raw, "utf8"),
    };
  } catch (err) {
    throw new Error(`Body must be valid JSON: ${(err as Error).message}`);
  }
}

async function readBodyInput(input: string, cwd: string): Promise<string> {
  if (isInlineJson(input)) {
    return input;
  }

  const file = path.resolve(cwd, input);
  try {
    const fileStat = await stat(file);
    if (!fileStat.isFile()) {
      throw new Error(`Body path is not a file: ${input}`);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Body file not found: ${input}`);
    }
    throw err;
  }

  return readFile(file, "utf8");
}

function isInlineJson(input: string): boolean {
  const trimmed = input.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[") || trimmed === "null" || trimmed === "true" || trimmed === "false" || /^-?\d/.test(trimmed);
}
