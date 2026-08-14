// Buffer polyfill — required by shared scraper code that uses Node's Buffer,
// notably the eUnity CLO image parser and binary AMF3 protocol helpers.
import { Buffer } from "buffer";
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- installing the polyfill IS the act of putting Buffer on a global the React Native typings say has no such property; typed access would only compile once the thing it is checking for already exists
if (typeof (global as any).Buffer === "undefined") (global as any).Buffer = Buffer;

import "expo-router/entry";
