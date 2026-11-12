// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * Files a tool produced for the user to keep — a PDF from MyChart, an export
 * the model wrote — the mobile counterpart of the desktop extension saving to
 * Downloads. The model only sees a `file_id` and writes `[file:ID]`, which the
 * chat bubble turns into a button that opens the iOS share sheet.
 *
 * Each file lives alone in `<cache>/openrecord-files/<id>/`, so the id is
 * enough to find it again after a restart and a saved chat keeps its button.
 * Everything is deleted when an account is disconnected.
 */
import { Platform, Share } from "react-native";
import { Directory, File, Paths } from "expo-file-system";
import { safeFileName } from "./file-tokens";

/**
 * `Share.share({ url })` attaches a file only on iOS; on Android it opens an
 * empty sheet, so there the tools say the file cannot be shown.
 */
export const CAN_SHARE_FILES = Platform.OS === "ios";

const ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

function root(): Directory {
  return new Directory(Paths.cache, "openrecord-files");
}

export function putFile(bytes: Uint8Array | string, fileName: string): string {
  const id = `file_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const dir = new Directory(root(), id);
  dir.create({ intermediates: true });
  const file = new File(dir, safeFileName(fileName));
  file.create();
  file.write(bytes);
  return id;
}

export function getFile(id: string): { uri: string; fileName: string } | undefined {
  if (!ID_PATTERN.test(id)) return undefined;
  const dir = new Directory(root(), id);
  if (!dir.exists) return undefined;
  const file = dir.list().find((entry): entry is File => entry instanceof File);
  return file ? { uri: file.uri, fileName: file.name } : undefined;
}

export async function shareFile(id: string): Promise<void> {
  const file = getFile(id);
  if (file) await Share.share({ url: file.uri, title: file.fileName });
}

export function deleteAllFiles(): void {
  const dir = root();
  if (dir.exists) dir.delete();
}
