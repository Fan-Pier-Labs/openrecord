import { useState, useRef, useCallback } from "react";
import {
  View,
  FlatList,
  StyleSheet,
  Text,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChatBubble, ToolCallIndicator } from "@/components/ChatBubble";
import { ChatInput } from "@/components/ChatInput";
import { sendMessage, type ChatMessage, type ToolCall } from "@/lib/ai/claude-client";
import { executeLocalTool } from "@/lib/ai/tool-executor";
import {
  createChat,
  addMessage,
  updateChatTitle,
} from "@/lib/storage/database";

type DisplayMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  toolCalls?: ToolCall[];
};

export default function ChatScreen() {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  async function handleSend(text: string) {
    // Create chat on first message
    let currentChatId = chatId;
    if (!currentChatId) {
      const chat = await createChat("New Chat");
      currentChatId = chat.id;
      setChatId(currentChatId);
    }

    // Add user message
    const userMsg: DisplayMessage = {
      id: Date.now().toString(),
      role: "user",
      content: text,
    };
    setMessages((prev) => [...prev, userMsg]);
    await addMessage(currentChatId, "user", text);
    scrollToBottom();

    // Add placeholder assistant message
    const assistantId = (Date.now() + 1).toString();
    const assistantMsg: DisplayMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      isStreaming: true,
    };
    setMessages((prev) => [...prev, assistantMsg]);
    setIsStreaming(true);
    scrollToBottom();

    // Build conversation history for Claude
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
        onToolCall: (tc) => {
          setActiveTool(tc.name);
        },
        onDone: async (finalText) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: finalText, isStreaming: false } : m
            )
          );
          setIsStreaming(false);
          setActiveTool(null);

          // Persist assistant message
          await addMessage(currentChatId!, "assistant", finalText);

          // Auto-title the chat from first exchange
          if (messages.length === 0) {
            const title = text.length > 50 ? text.slice(0, 47) + "..." : text;
            await updateChatTitle(currentChatId!, title);
          }
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

  function handleNewChat() {
    setMessages([]);
    setChatId(null);
    setActiveTool(null);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={90}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>OpenRecord</Text>
          <Pressable onPress={handleNewChat}>
            <Text style={styles.newChat}>New Chat</Text>
          </Pressable>
        </View>

        {/* Messages */}
        {messages.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>OpenRecord</Text>
            <Text style={styles.emptySubtitle}>Ask anything about your health data</Text>
          </View>
        ) : (
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
        )}

        {/* Input */}
        <ChatInput onSend={handleSend} disabled={isStreaming} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#fff",
  },
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5e5",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#000",
  },
  newChat: {
    fontSize: 15,
    color: "#007AFF",
    fontWeight: "500",
  },
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "#000",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
  },
  messageList: {
    paddingVertical: 12,
  },
});
