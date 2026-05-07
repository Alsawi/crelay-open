export interface ResponseSummary {
  upstreamStatus?: number;
  body: unknown;
}

export function unwrapResponse(data: unknown): ResponseSummary {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const record = data as Record<string, unknown>;
    if (typeof record.status === "number" && "body" in record) {
      return {
        upstreamStatus: record.status,
        body: record.body,
      };
    }
  }

  return { body: data };
}

export function summarizeBody(value: unknown): string {
  if (typeof value === "string") {
    return value.length > 240 ? `${value.slice(0, 240)}...` : value;
  }

  const json = JSON.stringify(value, null, 2);
  if (!json) return String(value);
  return json.length > 500 ? `${json.slice(0, 500)}...` : json;
}

export function formatBody(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

export function explainUpstreamStatus(status: number | undefined): string | undefined {
  if (status === undefined) return undefined;
  if (status === 404) {
    return "CRelay worked, but your upstream returned 404. Check method/path or test the upstream directly with curl.";
  }
  if (status >= 400) {
    return `CRelay worked, but your upstream returned ${status}. Check the upstream route, method, and request body.`;
  }
  return undefined;
}
