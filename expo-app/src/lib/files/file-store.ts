// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * Files a tool produced for the user to keep — a PDF from MyChart, an export
 * the model wrote — the mobile counterpart of the desktop extension saving to
 * Downloads. The bytes go to the app's cache directory; the model only sees a
 * `file_id` and writes `[file:ID]`, which the chat bubble turns into a button
 * that opens the iOS share sheet (Save to Files, AirDrop, Mail…).
 */
import { Share } from "react-native";
import { Directory, File, Paths } from "expo-file-system";

type StoredFile = { uri: string; fileName: string; mimeType: string };

const store = new Map<string, StoredFile>();

/** The extension's rule: a bare name is saved as Markdown. No folders. */
function safeFileName(name: string): string {
  const base = name.replace(/[/\\:\0]/g, "_").replace(/^\.+/, "").trim() || "openrecord-export";
  return /\.[A-Za-z0-9]{1,8}$/.test(base) ? base : `${base}.md`;
}

export function putFile(bytes: Uint8Array | string, fileName: string, mimeType: string): string {
  const id = `file_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  // One directory per file, so two files with the same name never collide.
  const dir = new Directory(Paths.cache, "openrecord-files", id);
  dir.create({ intermediates: true });
  const file = new File(dir, safeFileName(fileName));
  file.create();
  file.write(bytes);
  store.set(id, { uri: file.uri, fileName: file.name, mimeType });
  return id;
}

export function getFile(id: string): StoredFile | undefined {
  return store.get(id);
}

export async function shareFile(id: string): Promise<void> {
  const file = store.get(id);
  if (file) await Share.share({ url: file.uri, title: file.fileName });
}

/** `[file:...]` refs in an assistant answer, in order. */
export function extractFileIds(text: string): string[] {
  return [...text.matchAll(/\[file:([a-zA-Z0-9_-]+)\]/g)].map((m) => m[1]!);
}
