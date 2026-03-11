import { MockData } from "./types";




export const firstPathPart: MockData = {
  path: ['/', ''],
  response: new Response(JSON.stringify({}), {
    headers: {
      'Server': 'AkamaiGHost',
      'Content-Length': '0',
      'Location': 'https://mychart.minuteclinic.com/MyChartPRD/',
      'Date': 'Sat, 15 Feb 2025 23:22:37 GMT',
      'Connection': 'keep-alive',
      'X-Req': '23.198.9.143:98b5eee2',
    },
    status: 302,
  })
}