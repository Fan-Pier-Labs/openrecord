import { describe, it, expect } from 'bun:test'
import { parseConvo } from '../messages/parseConvo'
import type { InputFormat, MyChartMessage } from '../types'

// The MyChart payload carries a lot of fields parseConvo ignores. These builders
// fill in the required-but-irrelevant ones so each test only states what matters.
function message(fields: Pick<MyChartMessage, 'wmgId' | 'deliveryInstantISO' | 'body'> & {
  author: { wprKey?: string; empKey?: string }
}): MyChartMessage {
  return {
    ...fields,
    isUnread: false,
    author: { displayName: 'Someone', ...fields.author },
    attachments: [],
    tasks: [],
  }
}

function viewer(wprId: string, name: string): InputFormat['viewers'][string] {
  return { wprId, name, isSelf: true, isShown: true, isSelected: true, organizationId: 'ORG1' }
}

function convo(fields: Partial<InputFormat>): InputFormat {
  return { users: {}, viewers: {}, subject: 'Test', hthId: 'convo', messages: [], ...fields }
}

describe('parseConvo', () => {
  it('strips HTML from message bodies', () => {
    const result = parseConvo(convo({
      viewers: { v1: viewer('WPR1', 'Patient') },
      messages: [message({
        wmgId: 'msg1',
        deliveryInstantISO: '2024-01-15T10:00:00Z',
        body: '<p>Hello <strong>doctor</strong>, I have a <em>question</em>.</p>',
        author: { wprKey: 'WPR1' },
      })],
    }))
    expect(result.messages[0]!.message).toBe('Hello doctor, I have a question.')
  })

  it('handles plain text bodies (no HTML)', () => {
    const result = parseConvo(convo({
      viewers: { v1: viewer('WPR1', 'Patient') },
      messages: [message({
        wmgId: 'msg2',
        deliveryInstantISO: '2024-01-15T11:00:00Z',
        body: 'Just plain text message',
        author: { wprKey: 'WPR1' },
      })],
    }))
    expect(result.messages[0]!.message).toBe('Just plain text message')
  })

  it('handles complex HTML with links, lists, and divs', () => {
    const result = parseConvo(convo({
      viewers: { v1: viewer('WPR1', 'P') },
      messages: [message({
        wmgId: 'msg3',
        deliveryInstantISO: '2024-01-15T12:00:00Z',
        body: `
          <div>
            <p>Dear Patient,</p>
            <ul>
              <li>Take medication A</li>
              <li>Take medication B</li>
            </ul>
            <p>Visit <a href="https://example.com">this link</a> for details.</p>
          </div>
        `,
        author: { empKey: 'EMP1' },
      })],
    }))
    expect(result.messages[0]!.message).toContain('Dear Patient')
    expect(result.messages[0]!.message).toContain('Take medication A')
    expect(result.messages[0]!.message).toContain('Take medication B')
    expect(result.messages[0]!.message).toContain('this link')
    expect(result.messages[0]!.message).not.toContain('<')
  })

  it('trims whitespace from extracted text', () => {
    const result = parseConvo(convo({
      viewers: { v1: viewer('WPR1', 'P') },
      messages: [message({
        wmgId: 'msg4',
        deliveryInstantISO: '2024-01-15T13:00:00Z',
        body: '   \n  <p>  Trimmed message  </p>  \n   ',
        author: { wprKey: 'WPR1' },
      })],
    }))
    expect(result.messages[0]!.message).toBe('Trimmed message')
  })

  it('maps provider users correctly', () => {
    const result = parseConvo(convo({
      users: {
        u1: { name: 'Dr. Smith', photoUrl: 'https://photo.url/smith.jpg', providerId: 'PROV1', empId: 'EMP1' },
        u2: { name: 'Nurse Jones', photoUrl: '', providerId: 'PROV2', empId: 'EMP2' },
      },
    }))
    expect(result.users).toHaveLength(2)

    const drSmith = result.users.find(u => u.name === 'Dr. Smith')!
    expect(drSmith.isProvider).toBe(true)
    expect(drSmith.id).toBe('EMP1')
    expect(drSmith.photoUrl).toBe('https://photo.url/smith.jpg')
    expect(drSmith.allIds!.employeeId).toBe('EMP1')
    expect(drSmith.allIds!.providerId).toBe('PROV1')

    const nurse = result.users.find(u => u.name === 'Nurse Jones')!
    expect(nurse.isProvider).toBe(true)
    expect(nurse.id).toBe('EMP2')
  })

  it('maps viewer (patient) users correctly', () => {
    const result = parseConvo(convo({
      viewers: { v1: viewer('WPR1', 'Alice Patient'), v2: viewer('WPR2', 'Bob Patient') },
    }))
    expect(result.users).toHaveLength(2)

    const alice = result.users.find(u => u.name === 'Alice Patient')!
    expect(alice.isProvider).toBe(false)
    expect(alice.id).toBe('WPR1')
    expect(alice.photoUrl).toBe('')
    expect(alice.allIds!.wprKey).toBe('WPR1')
  })

  it('uses wprKey for patient message userId', () => {
    const result = parseConvo(convo({
      viewers: { v1: viewer('WPR1', 'Patient') },
      messages: [message({
        wmgId: 'msg1',
        deliveryInstantISO: '2024-01-01T00:00:00Z',
        body: 'Hello',
        author: { wprKey: 'WPR1' },
      })],
    }))
    expect(result.messages[0]!.userId).toBe('WPR1')
  })

  it('uses empKey for provider message userId when wprKey is absent', () => {
    const result = parseConvo(convo({
      users: { u1: { name: 'Dr. X', photoUrl: '', providerId: 'P1', empId: 'EMP1' } },
      messages: [message({
        wmgId: 'msg1',
        deliveryInstantISO: '2024-01-01T00:00:00Z',
        body: 'Response from doctor',
        author: { empKey: 'EMP1' },
      })],
    }))
    expect(result.messages[0]!.userId).toBe('EMP1')
  })

  it('prefers wprKey over empKey when both present', () => {
    const result = parseConvo(convo({
      messages: [message({
        wmgId: 'msg1',
        deliveryInstantISO: '2024-01-01T00:00:00Z',
        body: 'test',
        author: { wprKey: 'WPR_PREF', empKey: 'EMP_FALL' },
      })],
    }))
    expect(result.messages[0]!.userId).toBe('WPR_PREF')
  })

  it('preserves conversation metadata', () => {
    const result = parseConvo(convo({ subject: 'Lab Results Discussion', hthId: 'HTH_12345' }))
    expect(result.subject).toBe('Lab Results Discussion')
    expect(result.id).toBe('HTH_12345')
  })

  it('handles multiple messages in order', () => {
    const result = parseConvo(convo({
      users: { u1: { name: 'Dr.', photoUrl: '', providerId: 'P', empId: 'E1' } },
      viewers: { v1: viewer('W1', 'Patient') },
      messages: [
        message({ wmgId: 'm1', deliveryInstantISO: '2024-01-01T08:00:00Z', body: '<p>First message</p>', author: { wprKey: 'W1' } }),
        message({ wmgId: 'm2', deliveryInstantISO: '2024-01-01T09:00:00Z', body: '<p>Second message</p>', author: { empKey: 'E1' } }),
        message({ wmgId: 'm3', deliveryInstantISO: '2024-01-01T10:00:00Z', body: '<p>Third message</p>', author: { wprKey: 'W1' } }),
      ],
    }))
    expect(result.messages).toHaveLength(3)
    expect(result.messages[0]!.message).toBe('First message')
    expect(result.messages[1]!.message).toBe('Second message')
    expect(result.messages[2]!.message).toBe('Third message')
    expect(result.messages[0]!.timestamp).toBe('2024-01-01T08:00:00Z')
  })

  it('handles empty messages array', () => {
    expect(parseConvo(convo({ subject: 'Empty' })).messages).toEqual([])
  })

  it('handles message with empty body', () => {
    const result = parseConvo(convo({
      viewers: { v1: viewer('W', 'P') },
      messages: [message({ wmgId: 'm1', deliveryInstantISO: '2024-01-01T00:00:00Z', body: '', author: { wprKey: 'W' } })],
    }))
    expect(result.messages[0]!.message).toBe('')
  })

  it('handles HTML entities in message body', () => {
    const result = parseConvo(convo({
      viewers: { v1: viewer('W', 'P') },
      messages: [message({
        wmgId: 'm1',
        deliveryInstantISO: '2024-01-01T00:00:00Z',
        body: '<p>Temperature &gt; 100&deg;F &amp; rising</p>',
        author: { wprKey: 'W' },
      })],
    }))
    expect(result.messages[0]!.message).toContain('Temperature > 100')
    expect(result.messages[0]!.message).toContain('& rising')
  })

  it('handles <br> tags as whitespace', () => {
    const result = parseConvo(convo({
      viewers: { v1: viewer('W', 'P') },
      messages: [message({
        wmgId: 'm1',
        deliveryInstantISO: '2024-01-01T00:00:00Z',
        body: 'Line one<br>Line two<br/>Line three',
        author: { wprKey: 'W' },
      })],
    }))
    // cheerio $.text() joins text nodes; <br> contributes nothing
    expect(result.messages[0]!.message).toContain('Line one')
    expect(result.messages[0]!.message).toContain('Line two')
    expect(result.messages[0]!.message).toContain('Line three')
  })
})
