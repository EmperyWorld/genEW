import { eccFetch } from "@/api/http";
import type { EccUserResponse } from "@/api/authClient";

export interface EccRoleItem {
  id: string;
  name: string;
  permissions: string[];
  created_at: string;
}

export interface EccRoleListResponse {
  roles: EccRoleItem[];
}

export interface EccAssignRoleResponse {
  user: EccUserResponse;
}

export type AssignableRole = "admin" | "operator" | "member" | "viewer";

export const identityClient = {
  listRoles(): Promise<EccRoleListResponse> {
    return eccFetch<EccRoleListResponse>("/identity/roles");
  },

  getUser(userId: string): Promise<EccUserResponse> {
    return eccFetch<EccUserResponse>(`/identity/users/${userId}`);
  },

  lookupByEmail(email: string): Promise<EccUserResponse> {
    const q = encodeURIComponent(email.trim());
    return eccFetch<EccUserResponse>(`/identity/users/lookup?email=${q}`);
  },

  assignRole(userId: string, role: AssignableRole): Promise<EccAssignRoleResponse> {
    return eccFetch<EccAssignRoleResponse>(`/identity/users/${userId}/roles`, {
      method: "POST",
      body: { role },
    });
  },
};
