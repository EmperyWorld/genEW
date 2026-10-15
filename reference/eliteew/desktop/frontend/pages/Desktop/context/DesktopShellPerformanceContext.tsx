import * as React from 'react';

export type DesktopShellPerformanceContextValue = {
	/** Расширенная выгрузка runtime для безопасных приложений (см. backgroundPolicyRegistry). */
	aggressiveBackgroundSuspend: boolean;
};

const DesktopShellPerformanceContext =
	React.createContext<DesktopShellPerformanceContextValue>({
		aggressiveBackgroundSuspend: false,
	});

export function DesktopShellPerformanceProvider({
	aggressiveBackgroundSuspend,
	children,
}: {
	aggressiveBackgroundSuspend: boolean;
	children: React.ReactNode;
}): React.JSX.Element {
	const value = React.useMemo(
		() => ({ aggressiveBackgroundSuspend }),
		[aggressiveBackgroundSuspend]
	);
	return (
		<DesktopShellPerformanceContext.Provider value={value}>
			{children}
		</DesktopShellPerformanceContext.Provider>
	);
}

export function useDesktopShellPerformance(): DesktopShellPerformanceContextValue {
	return React.useContext(DesktopShellPerformanceContext);
}
