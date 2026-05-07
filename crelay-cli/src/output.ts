import pc from "picocolors";

export interface Logger {
  log(message: string): void;
  error(message: string): void;
}

export const consoleLogger: Logger = {
  log: (message) => console.log(message),
  error: (message) => console.error(message),
};

export function pass(label: string, detail?: string): string {
  return `${pc.green("pass")} ${label}${detail ? ` ${pc.dim(detail)}` : ""}`;
}

export function fail(label: string, detail?: string): string {
  return `${pc.red("fail")} ${label}${detail ? ` ${pc.dim(detail)}` : ""}`;
}

export function info(label: string, detail?: string): string {
  return `${pc.cyan("info")} ${label}${detail ? ` ${pc.dim(detail)}` : ""}`;
}
