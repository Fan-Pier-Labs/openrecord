


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
}


export type MyChartMessage = {
  wmgId: string;
  isUnread: boolean;
  deliveryInstantISO: string;

  // This is HTML, but I'm stripping out all of the HTML and just keeping the text. I could add text later.
  body: string;
  author: {
    displayName: string;
    wprKey?: string;
    empKey?: string;
  };

  attachments: MessageAttachment[];
  tasks: MessageTask[];
};


export type InputFormat = {
  users: Record<string, {name: string, photoUrl: string, providerId: string, empId: string}>;
  viewers: Record<string, {wprId: string, name: string, isSelf: boolean, isShown: boolean, isSelected: boolean, organizationId: string}>;
  subject: string;
  messages: MyChartMessage[]

  // This is the ID of the conversation.
  hthId: string;
}



// Output types

export type Message = {
  messageId: string;
  userId: string;
  timestamp: string;
  message: string;
}

export type User = {
  // False for patients, True for employees / doctors etc
  isProvider: boolean;

  // Name of the person, E.g. "Alice"
  name: string;

  // Photo URL of the person
  photoUrl?: string;

  allIds?: {
    employeeId?: string;
    providerId?: string;
    wprKey?: string;
  }

  // This is one of the above IDs. 
  // for users, this is the wprKey. 
  // for providers, this is the empId.
  // this is also the id that is present on messages.
  id: string;
}

export type MessageAttachment = {
  name: string;
  url: string;
  mimeType?: string;
}

export type MessageTask = {
  taskId: string;
  description: string;
  status?: string;
}

export type Conversation = {
  users: User[]
  messages: Message[]
  subject: string;
  id: string;
}
