# MyChart Messaging API - Reverse-Engineered

## New Message Flow (Medical Advice Request)

### Step 1: Get verification token
`GET /app/communication-center` -> parse `__RequestVerificationToken` from HTML

### Step 2: Get message menu
`POST /api/conversations/GetMessageMenuSettings` -> `{}`
Returns message types: "Ask a medical question" (type 1, menuItemId 32600), etc.

### Step 3: Get subtopics
`POST /api/medicaladvicerequests/GetSubtopics` -> `{organizationId: ""}`
Returns topic list with displayName + value (e.g. "Help with Booking an Appointment" -> "12")

### Step 4: Get recipients (providers)
`POST /api/medicaladvicerequests/GetMedicalAdviceRequestRecipients` -> `{organizationId: ""}`
Returns array of recipients with: displayName, userId, departmentId, poolId, providerId, recipientType, etc.

### Step 5: Get viewers (patient info)
`POST /api/medicaladvicerequests/GetViewers` -> `{organizationId: ""}`
Returns viewers array with wprId, name, isSelf

### Step 6: Get compose ID
`POST /api/conversations/GetComposeId` -> `{}`
Returns WP-encoded compose ID string

### Step 7: Send the message
`POST /api/medicaladvicerequests/SendMedicalAdviceRequest`
```json
{
  "recipient": {
    "displayName": "...",
    "userId": "WP-...",
    "poolId": "",
    "providerId": "WP-...",
    "departmentId": ""
  },
  "topic": {
    "title": "Help with Booking an Appointment",
    "value": "12"
  },
  "conversationId": "",
  "organizationId": "",
  "viewers": [{"wprId": "WP-..."}],
  "messageBody": ["the actual message text"],
  "messageSubject": "the subject line",
  "documentIds": [],
  "includeOtherViewers": false,
  "composeId": "WP-..."
}
```
Returns conversation ID string on success (200)

### Step 8: Cleanup
`POST /api/conversations/RemoveComposeId` -> `{composeId: "WP-..."}`

## Reply Flow

### Step 1: Get verification token (same as above)
### Step 2: Get viewers (same as above)
### Step 3: Get compose ID (same as above)

### Step 4: Send reply
`POST /api/conversations/SendReply`
```json
{
  "conversationId": "WP-...",
  "organizationId": "",
  "viewers": [{"wprId": "WP-..."}],
  "messageBody": ["the reply text"],
  "documentIds": [],
  "includeOtherViewers": false,
  "composeId": "WP-..."
}
```
Returns conversation ID string on success (200)

### Step 5: Cleanup (same as above)

## Key Insights
- `messageBody` is always an **array of strings** (single element for plain text)
- All POST requests need `Content-Type: application/json; charset=utf-8` and `__RequestVerificationToken` header
- organizationId is usually empty string for default org
- Draft auto-save uses `SaveMedicalAdviceRequestDraft` (new msg) or `SaveReplyDraft` (reply)
- Topic values: COVID=15, New Medical=10, Follow-Up=11, Lab Results=2, Imaging=6, Booking=12, Medication=7, Med Renewals=4, Referral=16, Form/Letter=3, Other=8
