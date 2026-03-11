import { RequestConfig } from "../types"
 
export type MockDataResponse = {
  headers: {
    [key: string]: string[] | string
  },
  statusCode: number
}

export type MockData = {
  path: string[],
  handle?: (url: string, config: RequestConfig) => Promise<Response>,
  response?: Response
}