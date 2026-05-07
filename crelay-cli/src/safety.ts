export function sanitizeSecrets(text: string, secrets: Array<string | undefined>): string {
  let sanitized = text;
  for (const secret of secrets) {
    if (!secret) continue;
    sanitized = sanitized.split(secret).join("[masked]");
  }
  return sanitized;
}
