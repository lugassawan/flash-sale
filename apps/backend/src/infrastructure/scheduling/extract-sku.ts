const SALE_STATE_KEY_REGEX = /^sale:(.+):state$/;

export function extractSkuFromKey(key: string): string | null {
  const match = key.match(SALE_STATE_KEY_REGEX);
  return match ? match[1] : null;
}
