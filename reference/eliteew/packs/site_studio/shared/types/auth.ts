export interface AuthState {
	user: User | null;
	token: string | null;
	isAuthenticated: boolean;
}

export interface LoginRequest {
	email: string;
	password: string;
}

export interface RegisterRequest {
	name: string;
	email: string;
	password: string;
	phone?: string;
}

import type { User } from './user';
