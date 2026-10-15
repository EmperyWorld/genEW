/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Guided-tour steps and root/audio keys for Image Studio.
 *
 * Invariants:
 * - highlightSelector values must match data-img-guide attributes in workspaces.
 *
 * Related:
 * - ImageStudioPage.tsx, documentation/product/GUIDED-TOUR-EXCURSION.md
 */

import type { CreativeStudioGuideStep } from '@/components/guided-tour/CreativeStudioGuideTourModal';

export const IMAGE_STUDIO_GUIDE_ROOT_ID = 'image-studio-guide-root';

export const IMAGE_STUDIO_GUIDE_AUDIO_LS_KEY =
	'image-studio-guide-audio-enabled';

export const IMAGE_STUDIO_GUIDE_TOUR_FOLDER = 'image-studio-guide';

export function imageStudioGuideAudioPath(stepId: string): string {
	return `${import.meta.env.BASE_URL}audio/image-studio-guide/ru/${stepId}.wav`;
}

export type ImageStudioGuideTab =
	| 'text-to-image'
	| 'image-edit'
	| 'rotate-image'
	| 'history';

export function getImageStudioGuideSteps(
	tab: ImageStudioGuideTab
): CreativeStudioGuideStep[] {
	switch (tab) {
		case 'text-to-image':
			return [
				{
					id: 'img-tti-intro',
					title: 'Создайте картинку',
					body: 'Опишите сцену словами — и получите изображение. Помощник подсказок поможет сформулировать описание.',
					highlightSelector: null,
				},
				{
					id: 'img-tti-tabs',
					title: 'Разделы',
					body: '«Создать», «Редактировать», «Новый ракурс» и «Мои работы» — переключайте вкладки вверху.',
					highlightSelector: '[data-img-guide="tab-rail"]',
				},
				{
					id: 'img-tti-params',
					title: 'Описание и настройки',
					body: 'Введите описание, при необходимости задайте размер в «Дополнительно» и нажмите «Создать изображение».',
					highlightSelector: '[data-img-guide="tti-params"]',
				},
				{
					id: 'img-tti-presets',
					title: 'Стили',
					body: 'Выберите стиль — он дополнит описание. Можно сразу создать несколько вариантов.',
					highlightSelector: '[data-img-guide="style-presets"]',
				},
				{
					id: 'img-tti-preview',
					title: 'Холст',
					body: 'Готовая картинка появится здесь — скачайте или отправьте в редактор / новый ракурс.',
					highlightSelector: '[data-img-guide="tti-preview"]',
				},
			];
		case 'image-edit':
			return [
				{
					id: 'img-edit-intro',
					title: 'Редактирование',
					body: 'Загрузите фото и опишите, что изменить — результат появится на холсте справа.',
					highlightSelector: null,
				},
				{
					id: 'img-edit-source',
					title: 'Ваше изображение',
					body: 'Перетащите файл или выберите с компьютера.',
					highlightSelector: '[data-img-guide="edit-source"]',
				},
				{
					id: 'img-edit-form',
					title: 'Инструкция',
					body: 'Кратко опишите желаемые изменения и нажмите «Применить».',
					highlightSelector: '[data-img-guide="edit-form"]',
				},
				{
					id: 'img-edit-preview',
					title: 'Холст',
					body: 'Сравните до и после, скачайте результат.',
					highlightSelector: '[data-img-guide="edit-preview"]',
				},
			];
		case 'rotate-image':
			return [
				{
					id: 'img-rot-intro',
					title: 'Новый ракурс',
					body: 'Загрузите кадр и выберите, как изменить точку обзора.',
					highlightSelector: null,
				},
				{
					id: 'img-rot-form',
					title: 'Файл и ракурс',
					body: 'Выберите изображение и вариант ракурса, затем «Изменить ракурс».',
					highlightSelector: '[data-img-guide="rotate-form"]',
				},
				{
					id: 'img-rot-preview',
					title: 'Результат',
					body: 'Готовый кадр или сетка ракурсов — скачивание на каждой карточке.',
					highlightSelector: '[data-img-guide="rotate-preview"]',
				},
			];
		case 'history':
			return [
				{
					id: 'img-hist-intro',
					title: 'Мои работы',
					body: 'Все сохранённые изображения из этой студии.',
					highlightSelector: null,
				},
				{
					id: 'img-hist-grid',
					title: 'Галерея',
					body: 'Нажмите на карточку для просмотра, «Скачать» — сохранить файл.',
					highlightSelector: '[data-img-guide="history-grid"]',
				},
			];
		default:
			return [];
	}
}
