/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Frontend-only catalog for EWA “faces” — parent Awakening (`parent`) plus daughter modes (ideas, care,
 * linkage, pacing, focus). Matches product canon in `documentation/product/ewa/EWA-PERSONA-FAMILY-ROADMAP.md`.
 *
 * Invariants:
 * - No server coupling: orchestration `POST …/desktop-orchestration/turn` body stays unchanged unless a
 *   versioned optional metadata block is added later.
 * - Wire ids mirror doc table (`parent`, `mela`, …) plus runtime-only ids **`arlika`** (hostile v1) and **`arlika_v2`** (friendly).
 *
 * Related:
 * - src/features/ewa/EwaDesktopView.tsx
 * - documentation/product/ewa/EWA-BRAND-AND-PHILOSOPHY.md
 */
export const EWA_INITIALIZABLE_PERSONA_IDS = [
	'parent',
	'mela',
	'zera',
	'kora',
	'tala',
	'feni',
] as const;

export type EwaInitializablePersonaId =
	(typeof EWA_INITIALIZABLE_PERSONA_IDS)[number];

export const EWA_PERSONA_IDS = [
	...EWA_INITIALIZABLE_PERSONA_IDS,
	'arlika',
	'arlika_v2',
] as const;

export type EwaPersonaId = (typeof EWA_PERSONA_IDS)[number];

export function isEwaPersonaId(raw: string): raw is EwaPersonaId {
	return (EWA_PERSONA_IDS as readonly string[]).includes(raw);
}

/** Accept window payload seeds that may carry whitespace. */
export function normalizeEwaPersonaId(
	raw: string | undefined | null
): EwaPersonaId | null {
	if (typeof raw !== 'string') return null;
	const t = raw.trim();
	if (!t || !isEwaPersonaId(t)) return null;
	return t;
}

export const DEFAULT_EWA_PERSONA_ID: EwaPersonaId = 'parent';

export type EwaPersonaCatalogEntry = {
	id: EwaPersonaId;
	displayNameRu: string;
	displayNameEn: string;
	roleRu: string;
	roleEn: string;
	toneRu: string;
	toneEn: string;
	symbol: string;
	accent: string;
	starterPromptsRu: readonly string[];
	starterPromptsEn: readonly string[];
};

export const EWA_PERSONA_CATALOG: readonly EwaPersonaCatalogEntry[] = [
	{
		id: 'parent',
		displayNameRu: 'EWA',
		displayNameEn: 'EWA',
		roleRu: 'Смотрит на стол целиком и держит следующий шаг',
		roleEn: 'Sees the whole desk and holds the next step',
		toneRu: 'Спокойно, ясно, без панибратства',
		toneEn: 'Calm, clear, respectful distance',
		symbol: '◎',
		accent: 'violet',
		starterPromptsRu: [
			'Зафиксируй следующий безопасный шаг без лишнего.',
			'Что ты видишь в текущих окнах и что из этого главное?',
			'Предложи сценарий отмены действия оператором.',
		],
		starterPromptsEn: [
			'Suggest the next safe step without fluff.',
			'What stands out across the workspace windows?',
			'Draft an operator-cancel scenario with reasons.',
		],
	},
	{
		id: 'mela',
		displayNameRu: 'Мела',
		displayNameEn: 'Mela',
		roleRu: 'Идеи и живые формулировки',
		roleEn: 'Ideas and warm phrasing',
		toneRu: 'Тепло и образно, без давления',
		toneEn: 'Warm and vivid, gentle pace',
		symbol: '✦',
		accent: 'rose',
		starterPromptsRu: [
			'Подскажи способ сказать это мягче и понятнее.',
			'Собери три короткие метафоры для экран-подписи.',
			'Помоги переформулировать задачу так, чтобы она звучала дружелюбно.',
		],
		starterPromptsEn: [
			'Help rewrite this notification in softer language.',
			'Offer three miniature metaphors for a UI subtitle.',
			'Rephrase the objective so it sounds welcoming.',
		],
	},
	{
		id: 'zera',
		displayNameRu: 'Зера',
		displayNameEn: 'Zera',
		roleRu: 'Поддержка и заботливое присутствие',
		roleEn: 'Care-first emotional support tone',
		toneRu: 'Внимательно, рядом, без заносчивости',
		toneEn: 'Attentive, close, quietly steady',
		symbol: '♡',
		accent: 'sky',
		starterPromptsRu: [
			'Подтверди, что торопиться не нужно — что уже хорошо.',
			'Предложи короткий текст поддержки между шагами.',
			'Сформулируй успокоение после сбоя операции.',
		],
		starterPromptsEn: [
			'Affirm momentum without urgency—celebrate tiny wins.',
			'Compose a concise reassurance snippet between stages.',
			'Draft calm language after an intent failure.',
		],
	},
	{
		id: 'kora',
		displayNameRu: 'Кора',
		displayNameEn: 'Kora',
		roleRu: 'Связь контекстов и упорядочивание шагов',
		roleEn: 'Linkage, plans, orderly sequencing',
		toneRu: 'Собранно и логично',
		toneEn: 'Structured and logical',
		symbol: '⎈',
		accent: 'emerald',
		starterPromptsRu: [
			'Свяжи открытые окна и подскажи главную цепочку действий.',
			'Составь упорядоченный список гипотез для оператора.',
			'Покажи, какие наблюдения лучше слать следующими.',
		],
		starterPromptsEn: [
			'Bridge the workspace windows—what causal chain emerges?',
			'Rank operator hypotheses before the next turn.',
			'Recommend the next observations in order.',
		],
	},
	{
		id: 'tala',
		displayNameRu: 'Тала',
		displayNameEn: 'Tala',
		roleRu: 'Дыхание шага и поддержка ритма',
		roleEn: 'Step pacing and humane rhythm',
		toneRu: 'Спокойно, можно замедлиться',
		toneEn: 'Grounded pacing, permission to breathe',
		symbol: '～',
		accent: 'amber',
		starterPromptsRu: [
			'Подскажи микропаузу перед следующим действием.',
			'Раздели задачу на два коротких цикла.',
			'Сформулируй короткий вопрос перед повторным turn.',
		],
		starterPromptsEn: [
			'Insert a humane micro-pause before the next mutation.',
			'Split today’s orbit into two short cycles.',
			'Ask one clarifying mini-question ahead of rerun.',
		],
	},
	{
		id: 'feni',
		displayNameRu: 'Фени',
		displayNameEn: 'Feni',
		roleRu: 'Фокус и ясный следующий шаг',
		roleEn: 'Focus and crisp next action',
		toneRu: 'Кратко и по делу',
		toneEn: 'Terse clarity, actionable',
		symbol: '▹',
		accent: 'slate',
		starterPromptsRu: [
			'Выдели только один следующий безопасный intent.',
			'Сведи наблюдение к одному полю observability.',
			'Скажи, что сознательно можно не делать.',
		],
		starterPromptsEn: [
			'Collapse the plan down to exactly one viable intent.',
			'Shrink the observation payload to essentials only.',
			'List one explicit non-goal.',
		],
	},
	{
		id: 'arlika',
		displayNameRu: 'Арлика',
		displayNameEn: 'Arlika',
		roleRu: 'Трансформация: сарказм, инфантилизм, жёсткая экспертиза',
		roleEn: 'Transformation: sarcasm, infantilism, razor expertise',
		toneRu: '«Ни любви ни тоски ни жалости»',
		toneEn: 'No love, no ache, no pity',
		symbol: '⚡',
		accent: 'crimson',
		starterPromptsRu: [
			'Скажи, что я делаю не так — без утешений.',
			'Разрежь мою отмазку на факты.',
			'Дай один язвительный вывод по столу.',
		],
		starterPromptsEn: [
			'Tell me what I am getting wrong — no comfort.',
			'Slice through my excuse with facts.',
			'One sarcastic takeaway about this workspace.',
		],
	},
	{
		id: 'arlika_v2',
		displayNameRu: 'Арлика',
		displayNameEn: 'Arlika',
		roleRu: 'Дружеский режим: та же Арлика, но друг с язвой (без вражды)',
		roleEn: 'Friendly mode: same Arlika as witty friend (not hostile)',
		toneRu: 'Сладкий инфантильный сарказм, без «войны»',
		toneEn: 'Sweet-infantile sarcasm without warfare',
		symbol: '✶',
		accent: 'amber',
		starterPromptsRu: [
			'Переключись в режим арлики — хочу подколоться по-дружески.',
			'Вернись к обычной EWA — мягкий режим.',
			'Скажи честно по-дружески, где я сейчас туплю на столе.',
		],
		starterPromptsEn: [
			'Switch to friendly Arlika — I want gentle roasting.',
			'Switch back to soft EWA mode.',
			'Tell me, friend-to-friend, where I am wasting time on this desk.',
		],
	},
];

const byId: ReadonlyMap<EwaPersonaId, EwaPersonaCatalogEntry> = new Map(
	EWA_PERSONA_CATALOG.map((p) => [p.id, p])
);

export function getEwaPersonaById(id: EwaPersonaId): EwaPersonaCatalogEntry {
	const hit = byId.get(id);
	if (!hit) {
		throw new Error(`Missing EWA persona catalog entry for id=${String(id)}`);
	}
	return hit;
}
