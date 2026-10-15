/**
 * Wave 18: operator / support diagnostics without dumping secrets to logs by default.
 * Summary export = structure + counts only; full export = explicit user confirm.
 */

export function downloadJsonDocument(filename: string, data: unknown): void {
	const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], {
		type: 'application/json',
	});
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.rel = 'noopener';
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
}

/** Top-level shell_state keys → type/shape summary (no array/object contents). */
export function summarizeShellStateForDiagnostics(
	shell: Record<string, unknown> | null | undefined
): Record<string, unknown> {
	if (!shell || typeof shell !== 'object') {
		return { present: false };
	}
	const summary: Record<string, unknown> = {};
	for (const [key, v] of Object.entries(shell)) {
		if (v == null) {
			summary[key] = null;
		} else if (Array.isArray(v)) {
			summary[key] = { kind: 'array', length: v.length };
		} else if (typeof v === 'object') {
			summary[key] = {
				kind: 'object',
				keys: Object.keys(v as object).length,
			};
		} else {
			summary[key] = typeof v;
		}
	}
	return summary;
}
