import type { StateCreator } from "zustand";
import {
  getStoredAccessToken,
  setStoredAccessToken,
} from "@/features/auth/authStorage";
import type { EccStore } from "@/state/store";

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
}

export interface AuthSlice {
  accessToken: string | null;
  authUser: AuthUser | null;
  authHydrated: boolean;
  hydrateAuth: () => void;
  setSession: (token: string, user: AuthUser) => void;
  clearSession: () => void;
}

function mapUser(raw: {
  id: string;
  email: string;
  display_name: string;
  roles?: string[];
}): AuthUser {
  return {
    id: raw.id,
    email: raw.email,
    displayName: raw.display_name,
    roles: raw.roles ?? [],
  };
}

export const createAuthSlice: StateCreator<EccStore, [], [], AuthSlice> = (
  set,
) => ({
  accessToken: null,
  authUser: null,
  authHydrated: false,
  hydrateAuth() {
    const token = getStoredAccessToken();
    set({ accessToken: token, authHydrated: true });
  },
  setSession(token, user) {
    setStoredAccessToken(token);
    set({ accessToken: token, authUser: user });
  },
  clearSession() {
    setStoredAccessToken(null);
    set({ accessToken: null, authUser: null });
  },
});

export { mapUser };
