


export type RequestConfig = {
  method?: 'POST' | 'GET';


  // Either path or url must be defined.
  // If url is defined, it is used. 
  // If not, origin must be set in the constructor, and https is assumed. 
  url?: string;
  path?: string;


  body?: string;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
  followRedirects?: boolean;

  // Give up after this many milliseconds and throw RequestTimeoutError.
  // Defaults to REQUEST_TIMEOUT_MS; 0 waits forever. Applies per network call,
  // so each redirect hop gets a fresh deadline.
  timeoutMs?: number;
}
