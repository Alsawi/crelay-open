const KEY_LEN_BYTES = 32;

export interface KeyValidationResult {
  ok: boolean;
  byteLength: number;
  message: string;
}

export function validateKeyB64(value: string | undefined): KeyValidationResult {
  const keyB64 = value?.trim() ?? "";
  if (!keyB64) {
    return {
      ok: false,
      byteLength: 0,
      message: "CRELAY_KEY_B64 is required.",
    };
  }

  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(keyB64) || keyB64.length % 4 === 1) {
    return {
      ok: false,
      byteLength: 0,
      message: "CRELAY_KEY_B64 is not valid Base64.",
    };
  }

  const key = Buffer.from(keyB64, "base64");
  const normalizedInput = keyB64.replace(/=+$/, "");
  const normalizedOutput = key.toString("base64").replace(/=+$/, "");
  if (normalizedInput !== normalizedOutput) {
    return {
      ok: false,
      byteLength: key.length,
      message: "CRELAY_KEY_B64 is not valid Base64.",
    };
  }

  if (key.length !== KEY_LEN_BYTES) {
    return {
      ok: false,
      byteLength: key.length,
      message: `CRELAY_KEY_B64 must decode to ${KEY_LEN_BYTES} bytes, got ${key.length}.`,
    };
  }

  return {
    ok: true,
    byteLength: key.length,
    message: `CRELAY_KEY_B64 decodes to ${KEY_LEN_BYTES} bytes.`,
  };
}
