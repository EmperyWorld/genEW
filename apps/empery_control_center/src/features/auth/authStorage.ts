/** Session-scoped JWT storage (cleared when tab closes). */

export const AUTH_TOKEN_KEY = "ecc_access_token";

export function getStoredAccessToken(): string | null {
  try {
    return sessionStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredAccessToken(token: string | null): void {
  try {
    if (token) {
      sessionStorage.setItem(AUTH_TOKEN_KEY, token);
    } else {
      sessionStorage.removeItem(AUTH_TOKEN_KEY);
    }
  } catch {
    /* sessionStorage unavailable */
  }
}

export function hasStoredAccessToken(): boolean {
  return Boolean(getStoredAccessToken());
}
