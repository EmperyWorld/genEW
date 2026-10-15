const DB_NAME = 'eliteew-music-audio-cache';
const STORE_NAME = 'audio_blobs';
const DB_VERSION = 1;
const DEFAULT_MAX_BYTES = 250 * 1024 * 1024; // 250 MB

type AudioBlobEntry = {
	key: string;
	blob: Blob;
	size: number;
	lastAccessedAt: number;
	createdAt: number;
};

function isCacheEnabled(): boolean {
	const flag = import.meta.env.VITE_MUSIC_IDB_CACHE;
	if (flag === '0' || flag === 'false') return false;
	return typeof indexedDB !== 'undefined';
}

function getMaxBytes(): number {
	const raw = Number(import.meta.env.VITE_MUSIC_IDB_CACHE_MAX_BYTES);
	if (Number.isFinite(raw) && raw > 0) return raw;
	return DEFAULT_MAX_BYTES;
}

async function openDb(): Promise<IDBDatabase | null> {
	if (!isCacheEnabled()) return null;
	return new Promise((resolve) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);
		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				db.createObjectStore(STORE_NAME, { keyPath: 'key' });
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => resolve(null);
	});
}

function txDone(tx: IDBTransaction): Promise<void> {
	return new Promise((resolve, reject) => {
		tx.oncomplete = () => resolve();
		tx.onabort = () => reject(tx.error);
		tx.onerror = () => reject(tx.error);
	});
}

async function withStore<T>(
	mode: IDBTransactionMode,
	fn: (store: IDBObjectStore, tx: IDBTransaction) => Promise<T>
): Promise<T | null> {
	const db = await openDb();
	if (!db) return null;
	try {
		const tx = db.transaction(STORE_NAME, mode);
		const store = tx.objectStore(STORE_NAME);
		const result = await fn(store, tx);
		await txDone(tx);
		return result;
	} catch {
		return null;
	} finally {
		db.close();
	}
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

async function listEntries(): Promise<AudioBlobEntry[]> {
	const result = await withStore('readonly', async (store) => {
		const req = store.getAll();
		return requestToPromise(req) as Promise<AudioBlobEntry[]>;
	});
	return result ?? [];
}

async function pruneToLimit(limitBytes: number): Promise<void> {
	const entries = await listEntries();
	if (entries.length === 0) return;
	let total = entries.reduce((sum, e) => sum + (e.size || 0), 0);
	if (total <= limitBytes) return;
	const sorted = [...entries].sort(
		(a, b) =>
			(a.lastAccessedAt || a.createdAt) - (b.lastAccessedAt || b.createdAt)
	);
	await withStore('readwrite', async (store) => {
		for (const entry of sorted) {
			if (total <= limitBytes) break;
			store.delete(entry.key);
			total -= entry.size || 0;
		}
		return true;
	});
}

export async function getCachedAudioBlob(key: string): Promise<Blob | null> {
	const entry = await withStore('readwrite', async (store) => {
		const req = store.get(key);
		const found = (await requestToPromise(req)) as AudioBlobEntry | undefined;
		if (!found?.blob) return null;
		const updated: AudioBlobEntry = {
			...found,
			lastAccessedAt: Date.now(),
		};
		store.put(updated);
		return found;
	});
	return entry?.blob ?? null;
}

export async function putCachedAudioBlob(
	key: string,
	blob: Blob
): Promise<boolean> {
	if (!isCacheEnabled()) return false;
	const size = blob.size || 0;
	const limit = getMaxBytes();
	if (size <= 0 || size > limit) return false;
	await pruneToLimit(Math.max(0, limit - size));
	const stored = await withStore('readwrite', async (store) => {
		const now = Date.now();
		const entry: AudioBlobEntry = {
			key,
			blob,
			size,
			lastAccessedAt: now,
			createdAt: now,
		};
		store.put(entry);
		return true;
	});
	await pruneToLimit(limit);
	return Boolean(stored);
}

export async function clearCachedAudioBlobs(): Promise<void> {
	await withStore('readwrite', async (store) => {
		store.clear();
		return true;
	});
}
