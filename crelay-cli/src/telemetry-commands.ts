import pc from "picocolors";
import { type Logger } from "./output.js";
import { readConfig, setTelemetryEnabled, isTelemetryEnabled } from "./telemetry.js";

export async function runTelemetryStatus(logger: Logger): Promise<number> {
  const enabled = await isTelemetryEnabled();
  logger.log(`Telemetry: ${enabled ? pc.green("enabled") : pc.red("disabled")}`);
  return 0;
}

export async function runTelemetryEnable(logger: Logger): Promise<number> {
  await setTelemetryEnabled(true);
  logger.log(pc.green("Telemetry enabled. Anonymous CLI diagnostics will be sent to crelay.dev."));
  return 0;
}

export async function runTelemetryDisable(logger: Logger): Promise<number> {
  await setTelemetryEnabled(false);
  logger.log("Telemetry disabled.");
  return 0;
}
