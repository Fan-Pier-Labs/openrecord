import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Extract just the hostname from user input that may be a bare hostname or a full URL. */
export function normalizeHostname(input: string): string {
  const trimmed = input.trim();
  try {
    const parsed = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
    return parsed.hostname;
  } catch {
    return trimmed;
  }
}
