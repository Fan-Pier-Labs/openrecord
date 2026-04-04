import { useState, useEffect, useRef, useCallback } from "react";
import {
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { ChatBubble, ToolCallIndicator } from "@/components/ChatBubble";
import { ChatInput } from "@/components/ChatInput";
import { sendMessage, type ChatMessage } from "@/lib/ai/claude-client";
import { executeLocalTool } from "@/lib/ai/tool-executor";
import {
  getMessages,
  addMessage,
  type Message,
} from "@/lib/storage/database";

type DisplayMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
};

export default function ChatDetailScreen() {
  const { id: chatId } = useLocalSearchParams<{ id: string }>();
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (chatId) loadMessages();
  }, [chatId]);

  async function loadMessages() {
    const dbMessages = await getMessages(chatId!);
    setMessages(
      dbMessages
        .filter((m): m is Message & { role: "user" | "assistant" } =>
          m.role === "user" || m.role === "assistant"
        )
        .map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
        }))
    );
  }

  const scrollToBottom = useCallback(() => {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  async function handleSend(text: string) {
    const userMsg: DisplayMessage = {
      id: Date.now().toString(),
      role: "user",
      content: text,
    };
    setMessages((prev) => [...prev, userMsg]);
    await addMessage(chatId!, "user", text);
    scrollToBottom();

    const assistantId = (Date.now() + 1).toString();
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: "", isStreaming: true },
    ]);
    setIsStreaming(true);
    scrollToBottom();

    const conversationMessages: ChatMessage[] = messages
      .filter((m) => !m.isStreaming)
      .map((m) => ({ role: m.role, content: m.content }));
    conversationMessages.push({ role: "user", content: text });

    let fullText = "";

    await sendMessage(
      conversationMessages,
      {
        onText: (chunk) => {
          fullText += chunk;
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: fullText } : m))
          );
          scrollToBottom();
        },
        onToolCall: (tc) => setActiveTool(tc.name),
        onDone: async (finalText) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: finalText, isStreaming: false } : m
            )
          );
          setIsStreaming(false);
          setActiveTool(null);
          await addMessage(chatId!, "assistant", finalText);
        },
        onError: (err) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: `Error: ${err.message}`, isStreaming: false }
                : m
            )
          );
          setIsStreaming(false);
          setActiveTool(null);
        },
      },
      executeLocalTool
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ChatBubble
            role={item.role}
            content={item.content}
            isStreaming={item.isStreaming}
          />
        )}
        contentContainerStyle={styles.messageList}
        ListFooterComponent={
          activeTool ? <ToolCallIndicator toolName={activeTool} /> : null
        }
      />
      <ChatInput onSend={handleSend} disabled={isStreaming} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  messageList: {
    paddingVertical: 12,
  },
});
