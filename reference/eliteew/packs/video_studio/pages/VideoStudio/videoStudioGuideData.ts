import type { CreativeStudioGuideStep } from '@/components/guided-tour/CreativeStudioGuideTourModal';

export const VIDEO_STUDIO_GUIDE_ROOT_ID = 'video-studio-guide-root';

export const VIDEO_STUDIO_GUIDE_AUDIO_LS_KEY =
	'video-studio-guide-audio-enabled';

export const VIDEO_STUDIO_GUIDE_TOUR_FOLDER = 'video-studio-guide';

export function videoStudioGuideAudioPath(stepId: string): string {
	return `${import.meta.env.BASE_URL}audio/video-studio-guide/ru/${stepId}.wav`;
}

export type VideoStudioGuideTab = 'image-to-video' | 'history';

export function getVideoStudioGuideSteps(
	tab: VideoStudioGuideTab
): CreativeStudioGuideStep[] {
	switch (tab) {
		case 'image-to-video':
			return [
				{
					id: 'vid-i2v-intro',
					title: 'Оживите картинку',
					body: 'Загрузите фото и опишите, как оно должно двигаться. Через несколько минут здесь появится короткий ролик.',
					highlightSelector: null,
				},
				{
					id: 'vid-i2v-tabs',
					title: 'Разделы',
					body: '«Создать» — новый ролик. «Мои видео» — всё, что вы уже сохранили.',
					highlightSelector: '[data-video-guide="tab-rail"]',
				},
				{
					id: 'vid-i2v-form',
					title: 'Картинка и описание',
					body: 'Сначала выберите изображение, затем расскажите о движении. Помощник подсказок поможет сформулировать описание.',
					highlightSelector: '[data-video-guide="i2v-form"]',
				},
				{
					id: 'vid-i2v-preview',
					title: 'Предпросмотр',
					body: 'Готовый ролик появится здесь — его можно посмотреть и скачать.',
					highlightSelector: '[data-video-guide="i2v-preview"]',
				},
			];
		case 'history':
			return [
				{
					id: 'vid-hist-intro',
					title: 'Мои видео',
					body: 'Здесь хранятся все ролики, созданные в этой студии.',
					highlightSelector: null,
				},
				{
					id: 'vid-hist-grid',
					title: 'Список роликов',
					body: 'Нажмите на карточку, чтобы посмотреть. Кнопка «Скачать» сохранит файл на ваш компьютер.',
					highlightSelector: '[data-video-guide="history-grid"]',
				},
			];
		default:
			return [];
	}
}
