
import fs from 'fs';
import * as cheerio from 'cheerio';
import { type Conversation, type InputFormat, type Message, type User } from '../types';
import { logger } from '../../../shared/logger';


// This file parses the JSON response from the conersation details API and 
// returns a more reasonable format for the data without some of the extra fields that are not needed.


export function parseConvo(json: InputFormat): Conversation {
  const messages = json.messages;

  const plainTextMessages: Message[] = []
  for (const message of messages) {
    
      const $ = cheerio.load(message.body);

      const text = $.text().trim()


      plainTextMessages.push({
        message: text,
        messageId: message.wmgId,
        timestamp: message.deliveryInstantISO,
        userId: (message.author.wprKey ?? message.author.empKey)!
      })
  }

  const users: User[] = [];
  for (const user of Object.values(json.users)) {
    users.push({
      isProvider: true,
      name: user.name,
      photoUrl: user.photoUrl,
      allIds: {
        employeeId: user.empId,
        providerId: user.providerId
      },
      id: user.empId
    })
  }

  for (const viewer of Object.values(json.viewers)) {
    users.push({
      isProvider: false,
      name: viewer.name,
      photoUrl: '',
      allIds: {
        wprKey: viewer.wprId
      },
      id: viewer.wprId
    })
  }


  return {
    users: users,
    subject: json.subject,
    messages: plainTextMessages,
    id: json.hthId
  }
}



// Manual exploration entry point: `bun scrapers/myChart/messages/parseConvo.ts`.
// Guarded so importing this module (e.g. from tests) has no side effects.
if (import.meta.main) {
  const json = JSON.parse(fs.readFileSync('./sample_data/convo.json', 'utf-8'))
  logger.debug(JSON.stringify(parseConvo(json), null, 4))
}