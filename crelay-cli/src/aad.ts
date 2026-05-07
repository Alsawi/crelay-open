import { buildRequestAad, buildResponseAad } from "@crelay/sdk";
import { normalizePath } from "./config.js";

export interface AadDiagnostics {
  requestAad: string;
  responseAad: string;
}

export function calculateAad(method: string, requestPath: string, tenantId: string): AadDiagnostics {
  const path = normalizePath(requestPath);
  return {
    requestAad: buildRequestAad(method.toUpperCase(), path, tenantId),
    responseAad: buildResponseAad(path, tenantId),
  };
}
