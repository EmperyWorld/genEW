import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  dedmorozClient,
  type ChatMessage,
} from "@/api/dedmorozClient";
import i18n from "@/i18n";

export function useDedmorozSession() {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await dedmorozClient.listMessages();
      setMessages(res.messages);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("dedmoroz.subtitle"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const sendMessage = useCallback(
    async (content: string) => {
      setBusy(true);
      setError(null);
      try {
        await dedmorozClient.sendMessage(content);
        await reload();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : i18n.t("dedmoroz.errors.send"));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [reload],
  );

  return { messages, loading, busy, error, reload, sendMessage };
}
