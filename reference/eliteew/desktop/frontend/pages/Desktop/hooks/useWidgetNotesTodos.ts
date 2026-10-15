/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Load notes and todos for Безраздельный мир widgets from API, with localStorage fallback on API error.
 *
 * Invariants:
 * - Fallback data is marked local-only in UI.
 * - Default sample content uses current EliteEW product terminology.
 *
 * Related:
 * - `pages/Desktop/components/DesktopWidgetShelfApp.tsx`
 */

import { useCallback, useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../contexts/AuthContext';
import type { NoteWidget, TodoItem } from '../types/desktop.types';
import {
	getWidgetNotes,
	createWidgetNote,
	updateWidgetNote,
	deleteWidgetNote,
	getWidgetTodos,
	createWidgetTodo,
	updateWidgetTodo,
	deleteWidgetTodo,
	type WidgetNoteResponse,
	type WidgetTodoResponse,
} from '../services/desktopApi';
import { STORAGE_KEYS } from '../constants';
import { enqueueDesktopWidgetOutboxOp } from '../utils/desktopWidgetOutboxQueue';

const NOTES_QUERY_KEY = ['desktop', 'widget-notes'] as const;
const TODOS_QUERY_KEY = ['desktop', 'widget-todos'] as const;

const NOTE_COLORS = ['yellow', 'pink', 'blue', 'green', 'purple'] as const;

function apiNoteToNoteWidget(n: WidgetNoteResponse): NoteWidget {
	return {
		id: n.id,
		content: n.content,
		color: n.color,
		position:
			n.position &&
			typeof n.position === 'object' &&
			'x' in n.position &&
			'y' in n.position
				? { x: Number(n.position.x) || 0, y: Number(n.position.y) || 0 }
				: { x: 0, y: 0 },
		createdAt: new Date(n.created_at),
		tags: Array.isArray(n.tags) ? n.tags.map((tag) => String(tag)) : [],
	};
}

function apiTodoToTodoItem(t: WidgetTodoResponse): TodoItem {
	return {
		id: t.id,
		text: t.text,
		completed: t.completed,
		createdAt: new Date(t.created_at),
		priority: (t.priority as TodoItem['priority']) ?? 'medium',
		tags: Array.isArray(t.tags) ? t.tags.map((tag) => String(tag)) : [],
	};
}

function loadNotesFromStorage(): NoteWidget[] {
	try {
		const raw = localStorage.getItem(STORAGE_KEYS.WIDGET_NOTES);
		if (!raw) return [];
		const parsed = JSON.parse(raw) as Array<{
			id: string;
			content: string;
			color: string;
			position: { x: number; y: number };
			createdAt: string;
			tags?: string[];
		}>;
		return parsed.map((n) => ({
			...n,
			createdAt: new Date(n.createdAt),
			tags: Array.isArray(n.tags) ? n.tags : [],
		}));
	} catch {
		return [];
	}
}

function saveNotesToStorage(notes: NoteWidget[]): boolean {
	try {
		localStorage.setItem(STORAGE_KEYS.WIDGET_NOTES, JSON.stringify(notes));
		return true;
	} catch {
		return false;
	}
}

function loadTodosFromStorage(): TodoItem[] {
	try {
		const raw = localStorage.getItem(STORAGE_KEYS.WIDGET_TODOS);
		if (!raw) return [];
		const parsed = JSON.parse(raw) as Array<{
			id: string;
			text: string;
			completed: boolean;
			createdAt: string;
			priority?: TodoItem['priority'];
			tags?: string[];
		}>;
		return parsed.map((t) => ({
			...t,
			createdAt: new Date(t.createdAt),
			priority: t.priority ?? 'medium',
			tags: Array.isArray(t.tags) ? t.tags : [],
		}));
	} catch {
		return [];
	}
}

function saveTodosToStorage(todos: TodoItem[]): boolean {
	try {
		localStorage.setItem(STORAGE_KEYS.WIDGET_TODOS, JSON.stringify(todos));
		return true;
	} catch {
		return false;
	}
}

export interface UseWidgetNotesReturn {
	notes: NoteWidget[];
	isLocalOnly: boolean;
	storageWriteFailed: boolean;
	isLoading: boolean;
	addNote: () => void;
	updateNote: (id: string, content: string) => void;
	deleteNote: (id: string) => void;
	error: Error | null;
}

export function useWidgetNotes(): UseWidgetNotesReturn {
	const queryClient = useQueryClient();
	const { user: authUser } = useAuth();
	const outboxSubject = authUser?.id ?? null;
	const [isLocalOnly, setIsLocalOnly] = useState(false);
	const [storageWriteFailed, setStorageWriteFailed] = useState(false);
	const [localNotes, setLocalNotes] = useState<NoteWidget[]>([]);

	const notesQuery = useQuery({
		queryKey: NOTES_QUERY_KEY,
		queryFn: async () => {
			const data = await getWidgetNotes();
			return data.map((note) => apiNoteToNoteWidget(note));
		},
		retry: 1,
		refetchOnWindowFocus: false,
	});

	const createNoteMut = useMutation({
		mutationFn: createWidgetNote,
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: NOTES_QUERY_KEY });
		},
	});

	const updateNoteMut = useMutation({
		mutationFn: ({
			id,
			data,
		}: {
			id: string;
			data: Partial<{ content: string; color: string }>;
		}) => updateWidgetNote(id, data),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: NOTES_QUERY_KEY });
		},
	});

	const deleteNoteMut = useMutation({
		mutationFn: deleteWidgetNote,
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: NOTES_QUERY_KEY });
		},
	});

	useEffect(() => {
		if (notesQuery.isError) {
			setIsLocalOnly(true);
			setLocalNotes(loadNotesFromStorage());
			console.warn(
				'[WidgetNotes] API failed, using localStorage fallback',
				notesQuery.error
			);
		} else {
			setIsLocalOnly(false);
		}
	}, [notesQuery.error, notesQuery.isError]);

	const addNote = useCallback(() => {
		if (isLocalOnly) {
			const color = NOTE_COLORS[Math.floor(Math.random() * NOTE_COLORS.length)];
			const newNote: NoteWidget = {
				id: `note-${Date.now()}`,
				content: '',
				color,
				position: { x: 0, y: 0 },
				createdAt: new Date(),
			};
			const next = [...localNotes, newNote];
			setLocalNotes(next);
			setStorageWriteFailed(!saveNotesToStorage(next));
			if (outboxSubject) {
				enqueueDesktopWidgetOutboxOp(outboxSubject, {
					kind: 'note_create',
					client_id: newNote.id,
					payload: {
						content: '',
						color,
						position: { x: 0, y: 0 },
						tags: [],
					},
				});
			}
			return;
		}
		const color = NOTE_COLORS[Math.floor(Math.random() * NOTE_COLORS.length)];
		createNoteMut.mutate({
			content: '',
			color,
			position: { x: 0, y: 0 },
			tags: [],
		});
	}, [isLocalOnly, localNotes, createNoteMut, outboxSubject]);

	const updateNote = useCallback(
		(id: string, content: string) => {
			if (isLocalOnly) {
				const next = localNotes.map((n) =>
					n.id === id ? { ...n, content } : n
				);
				setLocalNotes(next);
				setStorageWriteFailed(!saveNotesToStorage(next));
				if (outboxSubject) {
					enqueueDesktopWidgetOutboxOp(outboxSubject, {
						kind: 'note_update',
						server_id: id,
						payload: { content },
					});
				}
				return;
			}
			updateNoteMut.mutate({ id, data: { content } });
		},
		[isLocalOnly, localNotes, updateNoteMut, outboxSubject]
	);

	const deleteNote = useCallback(
		(id: string) => {
			if (isLocalOnly) {
				const next = localNotes.filter((n) => n.id !== id);
				setLocalNotes(next);
				setStorageWriteFailed(!saveNotesToStorage(next));
				if (outboxSubject) {
					enqueueDesktopWidgetOutboxOp(outboxSubject, {
						kind: 'note_delete',
						server_id: id,
						payload: {},
					});
				}
				return;
			}
			deleteNoteMut.mutate(id);
		},
		[isLocalOnly, localNotes, deleteNoteMut, outboxSubject]
	);

	const notes = isLocalOnly ? localNotes : (notesQuery.data ?? []);

	return {
		notes,
		isLocalOnly,
		storageWriteFailed,
		isLoading: notesQuery.isLoading && !isLocalOnly,
		addNote,
		updateNote,
		deleteNote,
		error: notesQuery.error instanceof Error ? notesQuery.error : null,
	};
}

export interface UseWidgetTodosReturn {
	todos: TodoItem[];
	isLocalOnly: boolean;
	storageWriteFailed: boolean;
	isLoading: boolean;
	addTodo: (
		text: string,
		priority: TodoItem['priority'],
		tags: string[]
	) => void;
	toggleTodo: (id: string, currentCompleted: boolean) => void;
	deleteTodo: (id: string) => void;
	error: Error | null;
}

export function useWidgetTodos(): UseWidgetTodosReturn {
	const queryClient = useQueryClient();
	const { user: authUser } = useAuth();
	const outboxSubject = authUser?.id ?? null;
	const [isLocalOnly, setIsLocalOnly] = useState(false);
	const [storageWriteFailed, setStorageWriteFailed] = useState(false);
	const [localTodos, setLocalTodos] = useState<TodoItem[]>([]);

	const todosQuery = useQuery({
		queryKey: TODOS_QUERY_KEY,
		queryFn: async () => {
			const data = await getWidgetTodos();
			return data.map((todo) => apiTodoToTodoItem(todo));
		},
		retry: 1,
		refetchOnWindowFocus: false,
	});

	const createTodoMut = useMutation({
		mutationFn: createWidgetTodo,
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: TODOS_QUERY_KEY });
		},
	});

	const updateTodoMut = useMutation({
		mutationFn: ({
			id,
			data,
		}: {
			id: string;
			data: Partial<{
				text: string;
				completed: boolean;
				priority: string;
				tags: string[];
			}>;
		}) => updateWidgetTodo(id, data),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: TODOS_QUERY_KEY });
		},
	});

	const deleteTodoMut = useMutation({
		mutationFn: deleteWidgetTodo,
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: TODOS_QUERY_KEY });
		},
	});

	useEffect(() => {
		if (todosQuery.isError) {
			setIsLocalOnly(true);
			setLocalTodos(loadTodosFromStorage());
			console.warn(
				'[WidgetTodos] API failed, using localStorage fallback',
				todosQuery.error
			);
		} else {
			setIsLocalOnly(false);
		}
	}, [todosQuery.error, todosQuery.isError]);

	const addTodo = useCallback(
		(text: string, priority: TodoItem['priority'], tags: string[]) => {
			if (isLocalOnly) {
				const newTodo: TodoItem = {
					id: `todo-${Date.now()}`,
					text,
					completed: false,
					createdAt: new Date(),
					priority,
					tags,
				};
				const next = [...localTodos, newTodo];
				setLocalTodos(next);
				setStorageWriteFailed(!saveTodosToStorage(next));
				if (outboxSubject) {
					enqueueDesktopWidgetOutboxOp(outboxSubject, {
						kind: 'todo_create',
						client_id: newTodo.id,
						payload: { text, completed: false, priority, tags },
					});
				}
				return;
			}
			createTodoMut.mutate({ text, completed: false, priority, tags });
		},
		[isLocalOnly, localTodos, createTodoMut, outboxSubject]
	);

	const toggleTodo = useCallback(
		(id: string, currentCompleted: boolean) => {
			if (isLocalOnly) {
				const next = localTodos.map((t) =>
					t.id === id ? { ...t, completed: !t.completed } : t
				);
				setLocalTodos(next);
				setStorageWriteFailed(!saveTodosToStorage(next));
				if (outboxSubject) {
					enqueueDesktopWidgetOutboxOp(outboxSubject, {
						kind: 'todo_update',
						server_id: id,
						payload: { completed: !currentCompleted },
					});
				}
				return;
			}
			updateTodoMut.mutate({ id, data: { completed: !currentCompleted } });
		},
		[isLocalOnly, localTodos, updateTodoMut, outboxSubject]
	);

	const deleteTodo = useCallback(
		(id: string) => {
			if (isLocalOnly) {
				const next = localTodos.filter((t) => t.id !== id);
				setLocalTodos(next);
				setStorageWriteFailed(!saveTodosToStorage(next));
				if (outboxSubject) {
					enqueueDesktopWidgetOutboxOp(outboxSubject, {
						kind: 'todo_delete',
						server_id: id,
						payload: {},
					});
				}
				return;
			}
			deleteTodoMut.mutate(id);
		},
		[isLocalOnly, localTodos, deleteTodoMut, outboxSubject]
	);

	const todos = isLocalOnly ? localTodos : (todosQuery.data ?? []);

	return {
		todos,
		isLocalOnly,
		storageWriteFailed,
		isLoading: todosQuery.isLoading && !isLocalOnly,
		addTodo,
		toggleTodo,
		deleteTodo,
		error: todosQuery.error instanceof Error ? todosQuery.error : null,
	};
}
