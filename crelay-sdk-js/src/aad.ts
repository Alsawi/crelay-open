/**
 * CRelay SDK — AAD (Additional Authenticated Data) Builders
 *
 * AAD strings bind each envelope to a specific method + path + tenant,
 * preventing an encrypted payload from being replayed on a different route.
 */

/**
 * Build the AAD context for an outgoing request.
 *
 * Format: `METHOD:/path:tenantId`
 *
 * @param method - HTTP method (e.g. `"POST"`).
 * @param path   - URL path (e.g. `"/internal/transfer"`).
 * @param tenantId - Tenant identifier.
 * @returns The AAD string.
 */
export function buildRequestAad(method: string, path: string, tenantId: string): string {
  return `${method.toUpperCase()}:${path}:${tenantId}`;
}

/**
 * Build the AAD context for an incoming response.
 *
 * Format: `RESPONSE:/path:tenantId`
 *
 * @param path     - URL path from the original request.
 * @param tenantId - Tenant identifier.
 * @returns The AAD string.
 */
export function buildResponseAad(path: string, tenantId: string): string {
  return `RESPONSE:${path}:${tenantId}`;
}
