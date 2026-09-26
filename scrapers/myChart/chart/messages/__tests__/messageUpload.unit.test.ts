import { describe, it, expect } from 'bun:test'
import { MyChartRequest } from '../../../core/myChartRequest'
import type { FilePayload } from '../../../core/filePayload'
import { buildUploadBody, checkAttachments, type AttachmentSettings } from '../messageUpload'
import { sendNewMessage } from '../sendMessage'

const SETTINGS: AttachmentSettings = {
  canAttach: true,
  maxNumberOfAttachments: 2,
  docAndImageSettings: { maxFileSize: 1, allowedFileExtensions: ['pdf', 'JPG'] },
  videoSettings: { maxFileSize: 4, allowedFileExtensions: ['MP4'] },
}

function file(fileName: string, size = 10): FilePayload {
  return { fileName, mimeType: 'application/octet-stream', bytes: new Uint8Array(size) }
}

describe('checkAttachments', () => {
  it('accepts files the instance allows, matching extensions case-insensitively', () => {
    expect(checkAttachments([file('a.PDF'), file('b.jpg')], SETTINGS)).toBeUndefined()
  })

  it('refuses when the instance has attachments off', () => {
    expect(checkAttachments([file('a.pdf')], { ...SETTINGS, canAttach: false })).toMatch(/does not allow attachments/)
  })

  it('refuses more files than the instance allows', () => {
    expect(checkAttachments([file('a.pdf'), file('b.pdf'), file('c.pdf')], SETTINGS)).toMatch(/at most 2/)
  })

  it('refuses an extension the instance does not list, naming the ones it does', () => {
    expect(checkAttachments([file('a.exe')], SETTINGS)).toMatch(/accepts only PDF, JPG, MP4/)
  })

  it('refuses a name with no extension or a character the composer forbids', () => {
    expect(checkAttachments([file('noextension')], SETTINGS)).toMatch(/needs a file extension/)
    expect(checkAttachments([file('a?.pdf')], SETTINGS)).toMatch(/needs a file extension/)
  })

  it('holds documents and videos to their own size limits (KB)', () => {
    expect(checkAttachments([file('a.pdf', 2048)], SETTINGS)).toMatch(/2 KB; .* PDF files is 1 KB/)
    expect(checkAttachments([file('a.mp4', 2048)], SETTINGS)).toBeUndefined()
  })
})

describe('buildUploadBody', () => {
  it('lays out one __file__[] part per file, then the composer\'s fields', () => {
    const { body, contentType } = buildUploadBody(
      [{ fileName: 'x.pdf', mimeType: 'application/pdf', bytes: new TextEncoder().encode('PDFDATA') }],
      'ORG1',
    )
    const boundary = contentType.replace('multipart/form-data; boundary=', '')
    const text = new TextDecoder().decode(body)
    expect(text).toContain(`--${boundary}\r\nContent-Disposition: form-data; name="__file__[]"; filename="x.pdf"\r\nContent-Type: application/pdf\r\n\r\nPDFDATA\r\n`)
    for (const [name, value] of [['AddDCSToCache', 'true'], ['IsPending', 'true'], ['DCSSource', '820'], ['TargetPatientID', ''], ['OrganizationId', 'ORG1']]) {
      expect(text).toContain(`name="${name}"\r\n\r\n${value}\r\n`)
    }
    expect(text.endsWith(`--${boundary}--\r\n`)).toBe(true)
  })
})

describe('sendNewMessage with attachments', () => {
  const params = {
    recipient: { recipientType: 1, displayName: 'Dr. X', specialty: '', userId: 'U', departmentId: '', poolId: '', providerId: 'P', organizationId: '' },
    topic: { displayName: 'Question', value: '1' },
    subject: 's',
    messageBody: 'b',
  }

  function scripted(responses: Record<string, unknown>) {
    const req = new MyChartRequest('mychart.example.com')
    req.firstPathPart = 'MyChart'
    const calls: Array<{ path: string; init: RequestInit }> = []
    req.transport = async (url: string, init: RequestInit) => {
      const path = new URL(url).pathname.replace('/MyChart', '')
      calls.push({ path, init })
      if (path === '/app/communication-center') return new Response('<input name="__RequestVerificationToken" value="tok" />')
      return new Response(JSON.stringify(responses[path] ?? {}))
    }
    return { req, calls }
  }

  const ok = {
    '/api/medicaladvicerequests/GetViewers': { viewers: [{ wprId: 'WPR', isSelf: true }] },
    '/api/conversations/GetComposeId': 'COMPOSE',
    '/api/conversations/GetComposeSettings': { attachmentSettings: SETTINGS },
    '/DocumentUpload/UploadFile': { Success: true, Data: [{ DocumentId: 'DCS-1', FileExtension: 'PDF', FileDisplayName: 'a.pdf' }] },
    '/api/medicaladvicerequests/SendMedicalAdviceRequest': 'CONV-1',
  }

  it('uploads with the token, then sends the DocumentIds', async () => {
    const { req, calls } = scripted(ok)
    const result = await sendNewMessage(req, { ...params, attachments: [file('a.pdf')] })
    expect(result).toEqual({ success: true, conversationId: 'CONV-1' })

    const upload = calls.find((c) => c.path === '/DocumentUpload/UploadFile')!
    const headers = upload.init.headers as Record<string, string>
    expect(headers['__RequestVerificationToken']).toBe('tok')
    expect(headers['Content-Type']).toStartWith('multipart/form-data; boundary=')

    const send = calls.find((c) => c.path === '/api/medicaladvicerequests/SendMedicalAdviceRequest')!
    expect(JSON.parse(send.init.body as string).documentIds).toEqual(['DCS-1'])
    expect(calls.map((c) => c.path).indexOf('/DocumentUpload/UploadFile'))
      .toBeLessThan(calls.map((c) => c.path).indexOf('/api/medicaladvicerequests/SendMedicalAdviceRequest'))
  })

  it('sends nothing when a file is refused, and releases the compose id', async () => {
    const { req, calls } = scripted(ok)
    const result = await sendNewMessage(req, { ...params, attachments: [file('a.exe')] })
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/accepts only/)
    const paths = calls.map((c) => c.path)
    expect(paths).not.toContain('/DocumentUpload/UploadFile')
    expect(paths).not.toContain('/api/medicaladvicerequests/SendMedicalAdviceRequest')
    expect(paths).toContain('/api/conversations/RemoveComposeId')
  })

  it('sends nothing when the upload is not acknowledged', async () => {
    const { req, calls } = scripted({ ...ok, '/DocumentUpload/UploadFile': { Success: false, Data: null } })
    const result = await sendNewMessage(req, { ...params, attachments: [file('a.pdf')] })
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/upload failed/)
    expect(calls.map((c) => c.path)).not.toContain('/api/medicaladvicerequests/SendMedicalAdviceRequest')
  })

  it('makes no attachment requests without attachments', async () => {
    const { req, calls } = scripted(ok)
    await sendNewMessage(req, params)
    const paths = calls.map((c) => c.path)
    expect(paths).not.toContain('/api/conversations/GetComposeSettings')
    expect(paths).not.toContain('/DocumentUpload/UploadFile')
  })
})
