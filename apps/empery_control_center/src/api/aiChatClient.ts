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

export const aiChatClient = {
  listMessages(limit = 50): Promise<MessageListResponse> {
    return eccFetch<MessageListResponse>("/ai-chat/messages", {
      query: { limit: String(limit) },
    });
  },
  sendMessage(content: string): Promise<ChatMessage> {
    return eccFetch<ChatMessage>("/ai-chat/messages", {
      method: "POST",
      body: { content },
    });
  },
};
