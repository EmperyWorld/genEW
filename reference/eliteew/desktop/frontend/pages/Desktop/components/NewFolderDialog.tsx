/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Modal for creating user desktop folders or changing icon on an existing user folder.
 *
 * Invariants:
 * - System folders are not edited here (caller gates edit mode).
 * - Escape and shell keyboard surface via ModalAdvanced desktop defaults.
 *
 * Related:
 * - constants/folderIcons.ts
 * - hooks/useDesktopStorage.ts
 * - DesktopChromeTooltip.tsx
 */

import * as React from 'react';
import { memo, useEffect, useRef, useState } from 'react';
import { CheckIcon } from '@heroicons/react/24/outline';
import { m, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ModalAdvanced } from '@/components/ui/ModalAdvanced';
import { DesktopChromeTooltip } from '@/pages/Desktop/components/DesktopChromeTooltip';
import {
	DEFAULT_USER_FOLDER_ICON_ID,
	getUserFolderIconLabelKey,
	isUserFolderIconId,
	resolveUserFolderIconNode,
	USER_FOLDER_ICON_IDS,
	type UserFolderIconId,
} from '@/pages/Desktop/constants/folderIcons';
import { DesktopAppButton, DesktopAppInput } from './DesktopAppChrome';
import { cn } from '@/utils/cn';

interface NewFolderDialogProps {
	isOpen: boolean;
	onClose: () => void;
	mode?: 'create' | 'editIcon';
	initialName?: string;
	initialIconId?: string;
	onCreate?: (name: string, iconId: UserFolderIconId) => void;
	onSaveIcon?: (iconId: UserFolderIconId) => void;
}

const FORBIDDEN_FOLDER_SPECIAL = new Set('<>:"/\\|?*'.split(''));

function hasForbiddenFolderChars(raw: string): boolean {
	for (const ch of raw) {
		if (FORBIDDEN_FOLDER_SPECIAL.has(ch)) return true;
		const cp = ch.codePointAt(0) ?? 0;
		if (cp <= 0x1f) return true;
	}
	return false;
}

const MAX_FOLDER_NAME_LEN = 128;

function resolveInitialIconId(value?: string): UserFolderIconId {
	if (value && isUserFolderIconId(value)) return value;
	return DEFAULT_USER_FOLDER_ICON_ID;
}

function validateFolderName(raw: string): 'empty' | 'invalid' | 'long' | null {
	const trimmed = raw.trim();
	if (!trimmed) return 'empty';
	if (trimmed.length > MAX_FOLDER_NAME_LEN) return 'long';
	if (hasForbiddenFolderChars(trimmed)) return 'invalid';
	return null;
}

export const NewFolderDialog: React.FC<NewFolderDialogProps> = memo(
	({
		isOpen,
		onClose,
		mode = 'create',
		initialName,
		initialIconId,
		onCreate,
		onSaveIcon,
	}) => {
		const { t } = useTranslation('appStore');
		const reduceMotion = useReducedMotion();
		const isEditIcon = mode === 'editIcon';
		const [name, setName] = useState(
			() => initialName ?? t('folder.defaultName')
		);
		const [selectedIconId, setSelectedIconId] = useState<UserFolderIconId>(() =>
			resolveInitialIconId(initialIconId)
		);
		const [nameError, setNameError] = useState<string | null>(null);
		const inputRef = useRef<HTMLInputElement>(null);
		const nameErrorId = 'new-folder-name-error';

		useEffect(() => {
			if (isOpen) {
				setName(initialName ?? t('folder.defaultName'));
				setSelectedIconId(resolveInitialIconId(initialIconId));
				setNameError(null);
				if (!isEditIcon) {
					const id = window.setTimeout(() => inputRef.current?.select(), 100);
					return () => window.clearTimeout(id);
				}
			}
		}, [initialIconId, initialName, isEditIcon, isOpen, t]);

		const handleSubmit = (): void => {
			if (isEditIcon) {
				onSaveIcon?.(selectedIconId);
				onClose();
				return;
			}
			const err = validateFolderName(name);
			if (err === 'empty') {
				setNameError(t('folder.errorEmpty'));
				return;
			}
			if (err === 'invalid') {
				setNameError(t('folder.errorInvalid', { chars: '< > : " / \\ | ? *' }));
				return;
			}
			if (err === 'long') {
				setNameError(t('folder.errorTooLong', { max: MAX_FOLDER_NAME_LEN }));
				return;
			}
			onCreate?.(name.trim(), selectedIconId);
			onClose();
		};

		const invalid = nameError !== null;
		const title = isEditIcon ? t('folder.editIconTitle') : t('folder.title');
		const submitLabel = isEditIcon ? t('folder.saveIcon') : t('folder.create');

		return (
			<ModalAdvanced
				isOpen={isOpen}
				onClose={onClose}
				title={title}
				size="md"
				variant="desktop"
				footer={
					<div className="flex w-full justify-end gap-2">
						<DesktopAppButton
							type="button"
							variant="ghost"
							size="sm"
							onClick={onClose}
						>
							{t('folder.cancel')}
						</DesktopAppButton>
						<DesktopAppButton
							type="button"
							variant="accent"
							size="sm"
							onClick={handleSubmit}
							disabled={!isEditIcon && validateFolderName(name) !== null}
						>
							{submitLabel}
						</DesktopAppButton>
					</div>
				}
			>
				<div className="space-y-4">
					{isEditIcon ? (
						<p className="text-sm text-(--desktop-text-muted)">{initialName}</p>
					) : (
						<div>
							<label
								htmlFor="new-folder-name"
								className="mb-2 block text-sm text-(--desktop-text-muted) antialiased"
							>
								{t('folder.nameLabel')}
							</label>
							<DesktopAppInput
								id="new-folder-name"
								ref={inputRef}
								value={name}
								onChange={(e) => {
									setName(e.target.value);
									setNameError(null);
								}}
								onKeyDown={(e) => {
									if (e.key === 'Enter') handleSubmit();
								}}
								placeholder={t('folder.namePlaceholder')}
								aria-invalid={invalid}
								aria-describedby={
									nameError
										? `${nameErrorId} new-folder-name-hint`
										: 'new-folder-name-hint'
								}
								autoComplete="off"
							/>
							<p id="new-folder-name-hint" className="sr-only">
								{t('folder.nameHint')}
							</p>
							{nameError ? (
								<p
									id={nameErrorId}
									role="alert"
									className="mt-2 text-sm text-[color-mix(in_srgb,rgb(248_113_113)_72%,var(--desktop-text-primary))]"
								>
									{nameError}
								</p>
							) : null}
						</div>
					)}
					<fieldset className="min-w-0 border-0 p-0">
						<legend
							id="new-folder-icon-label"
							className="mb-2 block w-full text-sm text-(--desktop-text-muted) antialiased"
						>
							{t('folder.iconLabel')}
						</legend>
						<div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
							{USER_FOLDER_ICON_IDS.map((iconId, index) => {
								const selected = selectedIconId === iconId;
								const label = t(getUserFolderIconLabelKey(iconId), {
									defaultValue: iconId,
								});
								return (
									<DesktopChromeTooltip
										key={iconId}
										content={label}
										placement="top"
										offsetExtra={4}
									>
										<m.button
											type="button"
											onClick={() => setSelectedIconId(iconId)}
											className={cn(
												'flex h-11 min-h-11 w-full items-center justify-center rounded-xl border border-(--desktop-border-subtle) bg-(--desktop-surface-panel) transition-[transform,box-shadow,border-color] duration-200 motion-reduce:transition-none',
												selected
													? 'scale-105 border-[rgb(var(--desktop-accent-rgb)/0.72)] ring-2 ring-[rgb(var(--desktop-accent-rgb)/0.45)]'
													: 'hover:scale-105 hover:border-(--desktop-border-strong)'
											)}
											aria-label={label}
											aria-pressed={selected}
											initial={{ scale: 0.92, opacity: 0 }}
											animate={{ scale: 1, opacity: 1 }}
											transition={{ delay: index * 0.02 }}
											whileHover={reduceMotion ? undefined : { y: -1 }}
											whileTap={reduceMotion ? undefined : { scale: 0.94 }}
										>
											<span className="relative flex h-6 w-6 items-center justify-center">
												{resolveUserFolderIconNode(iconId)}
												{selected ? (
													<span className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[rgb(var(--desktop-accent-rgb))]">
														<CheckIcon
															className="h-2.5 w-2.5 text-white"
															strokeWidth={2.5}
															aria-hidden
														/>
													</span>
												) : null}
											</span>
										</m.button>
									</DesktopChromeTooltip>
								);
							})}
						</div>
					</fieldset>
				</div>
			</ModalAdvanced>
		);
	}
);

NewFolderDialog.displayName = 'NewFolderDialog';

export default NewFolderDialog;
