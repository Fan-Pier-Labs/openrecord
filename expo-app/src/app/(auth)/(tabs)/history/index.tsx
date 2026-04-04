import { useState, useCallback } from "react";
import {
  View,
  FlatList,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { getChats, deleteChat, searchChats, type Chat } from "@/lib/storage/database";

export default function HistoryScreen() {
  const router = useRouter();
  const [chats, setChats] = useState<Chat[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  useFocusEffect(
    useCallback(() => {
      loadChats();
    }, [])
  );

  async function loadChats() {
    const result = searchQuery ? await searchChats(searchQuery) : await getChats();
    setChats(result);
  }

  async function handleSearch(query: string) {
    setSearchQuery(query);
    const result = query ? await searchChats(query) : await getChats();
    setChats(result);
  }

  function handleDelete(chat: Chat) {
    Alert.alert("Delete Chat", `Delete "${chat.title}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteChat(chat.id);
          await loadChats();
        },
      },
    ]);
  }

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString();
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Chat History</Text>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search chats..."
        placeholderTextColor="#999"
        value={searchQuery}
        onChangeText={handleSearch}
      />

      {chats.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            {searchQuery ? "No chats match your search" : "No chat history yet"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={chats}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable
              style={styles.chatRow}
              onPress={() => router.push(`/(auth)/chat/${item.id}`)}
              onLongPress={() => handleDelete(item)}
            >
              <View style={styles.chatInfo}>
                <Text style={styles.chatTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.chatDate}>{formatDate(item.updated_at)}</Text>
              </View>
            </Pressable>
          )}
          contentContainerStyle={styles.list}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
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
  searchInput: {
    marginHorizontal: 16,
    marginVertical: 8,
    backgroundColor: "#f5f5f5",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    fontSize: 15,
    color: "#999",
  },
  list: {
    paddingBottom: 20,
  },
  chatRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  chatInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  chatTitle: {
    flex: 1,
    fontSize: 15,
    color: "#1a1a1a",
    fontWeight: "500",
    marginRight: 12,
  },
  chatDate: {
    fontSize: 13,
    color: "#999",
  },
});
