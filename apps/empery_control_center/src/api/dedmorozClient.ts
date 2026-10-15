import { eccFetch } from "@/api/http";

export type ChatMessage = {
  id: string;
  role: string;
  content: string;
  created_at: string;
};

export type MessageListResponse = {
  messages: ChatMessage[];
  count: number;
};

export const dedmorozClient = {
  listMessages(limit = 50): Promise<MessageListResponse> {
    return eccFetch<MessageListResponse>("/dedmoroz/messages", {
      query: { limit: String(limit) },
    });
  },
  sendMessage(content: string): Promise<ChatMessage> {
    return eccFetch<ChatMessage>("/dedmoroz/messages", {
      method: "POST",
      body: { content },
    });
  },
};
