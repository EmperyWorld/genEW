import * as React from 'react';
import { useDesktopVoice } from '../context/DesktopVoiceContext';

/** Sets `openVoiceCommandCenter` in context when mounted inside `DesktopVoiceProvider`. */
export function DesktopVoiceBridge({
	openVoiceCommandCenter,
}: {
	openVoiceCommandCenter: () => void;
}): null {
	const { setOpenVoiceCommandCenter } = useDesktopVoice();
	React.useEffect(() => {
		setOpenVoiceCommandCenter(openVoiceCommandCenter);
		return () => setOpenVoiceCommandCenter(null);
	}, [openVoiceCommandCenter, setOpenVoiceCommandCenter]);
	return null;
}
