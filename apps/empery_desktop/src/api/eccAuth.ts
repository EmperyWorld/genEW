/** ECC BFF auth for Empery Desktop Autonomous (JWT via /auth/login). */

import { peerApiBase } from "./peerBase";

const TOKEN_KEY = "empery.desktop.ecc_access_token";

const base = peerApiBase(8006, import.meta.env.VITE_ECC_API_BASE);

export type EccLoginResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: {
    id: string;
    email: string;
    display_name: string;
    roles: string[];
  };
};

export function getEccToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setEccToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export async function eccLogin(
  email: string,
  password: string,
): Promise<EccLoginResponse> {
  const res = await fetch(`${base}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`login failed: ${res.status} ${text.slice(0, 200)}`);
  }
  const body = (await res.json()) as EccLoginResponse;
  setEccToken(body.access_token);
  return body;
}

export function eccLogout(): void {
  setEccToken(null);
}

export function eccApiBase(): string {
  return base;
}
