


export type RequestConfig = {
  method?: 'POST' | 'GET';


  // Either path or url must be defined.
  // If url is defined, it is used. 
  // If not, origin must be set in the constructor, and https is assumed. 
  url?: string;
  path?: string;


  /** Bytes for a multipart upload; set Content-Type yourself, or it goes out as JSON. */
  body?: string | Uint8Array<ArrayBuffer>;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
  followRedirects?: boolean;
}
