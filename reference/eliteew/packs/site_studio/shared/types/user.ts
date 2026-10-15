export type UserRole = 'user' | 'admin';

export interface User {
	id: string;
	email: string;
	name: string;
	role: UserRole;
	phone?: string;
	createdAt: Date;
}

export interface UserProfile extends User {
	address?: string;
	city?: string;
	postalCode?: string;
	country?: string;
}
