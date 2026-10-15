import type { ConsoleLineDTO, ConsoleLevel } from "../../api/types";
import { formatTimestamp } from "../../lib/format";
import { useTranslation } from "react-i18next";

const levelColor: Record<ConsoleLevel, string> = {
  info: "var(--ecc-console-fg)",
  warn: "var(--ecc-console-warn)",
  error: "var(--ecc-console-err)",
  thought: "var(--ecc-busy)",
};

export interface ConsoleLineProps {
  line: ConsoleLineDTO;
}

export function ConsoleLine({ line }: ConsoleLineProps) {
  const { t } = useTranslation();
  const levelLabel = t(`console.level.${line.level}`, {
    defaultValue: line.level,
  });

  return (
    <div className="group flex gap-2 px-2 py-0.5 font-[IBM_Plex_Mono,monospace] text-[12px] leading-relaxed hover:bg-white/[0.03]">
      <span className="shrink-0 text-[var(--ecc-console-dim)]">
        {formatTimestamp(line.timestamp)}
      </span>
      <span
        className="w-14 shrink-0 uppercase tracking-wide"
        style={{ color: levelColor[line.level] }}
      >
        {levelLabel}
      </span>
      {line.source ? (
        <span className="shrink-0 text-[var(--ecc-metal)]">{line.source}</span>
      ) : null}
      <span
        className="min-w-0 flex-1 break-words"
        style={{ color: levelColor[line.level] }}
      >
        {line.message}
      </span>
    </div>
  );
}
