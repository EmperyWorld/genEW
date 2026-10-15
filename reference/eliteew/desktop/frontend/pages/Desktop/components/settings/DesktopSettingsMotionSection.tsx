/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Framer Motion wrapper for Desktop Settings Center form cards (stagger + reduced motion).
 *
 * Related:
 * - desktopSettingsCardMotion.ts, DesktopSettingsVisualStudioSection.tsx
 */

import { motion, useReducedMotion } from 'framer-motion';
import type { FC, ReactNode } from 'react';
import { desktopSettingsCardMotionProps } from '../../utils/desktopSettingsCardMotion';

export type DesktopSettingsMotionSectionProps = {
	children: ReactNode;
	delaySec?: number;
	className?: string;
};

export const DesktopSettingsMotionSection: FC<
	DesktopSettingsMotionSectionProps
> = ({ children, delaySec = 0, className }) => {
	const reduceMotion = useReducedMotion() ?? false;
	return (
		<motion.div
			className={className}
			{...desktopSettingsCardMotionProps(delaySec, reduceMotion)}
		>
			{children}
		</motion.div>
	);
};
