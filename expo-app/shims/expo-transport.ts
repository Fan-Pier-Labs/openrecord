// Swapped in for scrapers/expoTransport.ts by metro.config.js. expo/fetch's
// Swift-side URLSessionDelegate honors redirect:"manual", which React
// Native's own fetch silently ignores.
import { fetch } from "expo/fetch";
import type { Transport } from "../../scrapers/http";

export const expoTransport: Transport = fetch;
