import { eccFetch } from "@/api/http";
import { mapUser, type AuthUser } from "@/state/slices/authSlice";

export interface EccLoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: {
    id: string;
    email: string;
    display_name: string;
    is_active: boolean;
    roles: string[];
    permissions: string[];
  };
}

export interface EccUserResponse {
  id: string;
  email: string;
  display_name: string;
  is_active: boolean;
  roles: string[];
  permissions: string[];
}

export interface EccRegisterRequest {
  email: string;
  password: string;
  display_name?: string | null;
}

export interface EccRegisterResponse {
  user: EccUserResponse;
  access_token?: string;
  token_type?: string;
  expires_in?: number;
}

export interface EccPasswordResetRequestResponse {
  ok: boolean;
  message?: string | null;
  reset_token?: string | null;
}

export interface EccPasswordResetConfirmResponse {
  ok: boolean;
}

export const authClient = {
  login(email: string, password: string): Promise<EccLoginResponse> {
    return eccFetch<EccLoginResponse>("/auth/login", {
      method: "POST",
      body: { email, password },
      token: null,
    });
  },

  register(
    email: string,
    password: string,
    displayName?: string | null,
  ): Promise<EccRegisterResponse> {
    const body: EccRegisterRequest = {
      email,
      password,
    };
    const trimmedName = displayName?.trim();
    if (trimmedName) {
      body.display_name = trimmedName;
    }
    return eccFetch<EccRegisterResponse>("/auth/register", {
      method: "POST",
      body,
      token: null,
    });
  },

  logout(): Promise<{ ok: boolean }> {
    return eccFetch<{ ok: boolean }>("/auth/logout", {
      method: "POST",
      token: null,
    });
  },

  me(token?: string | null): Promise<EccUserResponse> {
    return eccFetch<EccUserResponse>("/auth/me", {
      token: token ?? undefined,
    });
  },

  requestPasswordReset(email: string): Promise<EccPasswordResetRequestResponse> {
    return eccFetch<EccPasswordResetRequestResponse>("/auth/password-reset/request", {
      method: "POST",
      body: { email },
      token: null,
    });
  },

  confirmPasswordReset(
    token: string,
    newPassword: string,
  ): Promise<EccPasswordResetConfirmResponse> {
    return eccFetch<EccPasswordResetConfirmResponse>("/auth/password-reset/confirm", {
      method: "POST",
      body: { token, new_password: newPassword },
      token: null,
    });
  },
};

export function toAuthUser(raw: EccLoginResponse["user"] | EccUserResponse): AuthUser {
  return mapUser({
    id: raw.id,
    email: raw.email,
    display_name: raw.display_name,
    roles: raw.roles,
  });
}
