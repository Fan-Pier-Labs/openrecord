import { describe, it, expect } from 'bun:test'
import { mockRequest } from '../mock_data/index'

/**
 * `mockRequest` is the transport `MyChartRequest` uses under
 * OPENRECORD_MOCK_DATA, inside whatever process installed it. It used to
 * `process.exit(1)` on an unmapped path, taking the host down with it.
 */
describe('mockRequest', () => {
  it('throws on an unmapped path instead of killing the host process', async () => {
    await expect(
      mockRequest('https://mychart.example.org/MyChart/api/not-mocked', {}),
    ).rejects.toThrow(/No mock data found for \/MyChart\/api\/not-mocked/)
  })

  it('names the directory to add the fixture to', async () => {
    await expect(
      mockRequest('https://mychart.example.org/MyChart/api/not-mocked', {}),
    ).rejects.toThrow(/mock_data/)
  })

  it('serves a mapped path', async () => {
    const response = await mockRequest(
      'https://mychart.example.org/MyChartPRD/Authentication/Login',
      {},
    )
    expect(response.status).toBe(200)
  })

  it('ignores a trailing slash when matching', async () => {
    const response = await mockRequest(
      'https://mychart.example.org/MyChartPRD/Authentication/Login/',
      {},
    )
    expect(response.status).toBe(200)
  })
})
