# Recipes

Short, complete answers to common tasks, for both the CLI and the library. Every example uses
`mychart.example.org`. Replace it with your portal's hostname, which
`mychart-cli --action search_mycharts --arg query=<your health system>` will find.

To try any of these against made-up data, use the sandbox: `--host fake-mychart.fanpierlabs.com
--user homer --pass donuts123 --2fa 123456`.

- [Export the whole chart](#export-the-whole-chart)
- [Get lab results and trends](#get-lab-results-and-trends)
- [Read a visit's clinical notes](#read-a-visits-clinical-notes)
- [Download imaging as pictures](#download-imaging-as-pictures)
- [Download bills and documents](#download-bills-and-documents)
- [Message your care team](#message-your-care-team)
- [Read a child's chart](#read-a-childs-chart-proxy-access)
- [Run unattended](#run-unattended-cron-ci-a-server)
- [Give an AI agent access](#give-an-ai-agent-access)
- [Build your own tool layer](#build-your-own-tool-layer)
- [Find a provider's NPI and address](#find-a-providers-npi-and-address)

## Export the whole chart

```bash
mychart-cli --host mychart.example.org > chart.txt
```

This prints every chart category (profile, medications, labs, visits, messages, billing, …) as
JSON under a banner per category. To get one clean JSON file per category, use the library:

```ts
import { MyChartClient, CAPABILITIES, acceptsPatientParam } from 'mychart-cli';
import * as fs from 'node:fs/promises';

const reads = CAPABILITIES.filter(
  (c) => c.kind === 'read' && acceptsPatientParam(c) && !c.rendersMedia && !c.returnsFile &&
         c.params.every((p) => !p.required),
);

await fs.mkdir('export', { recursive: true });
for (const c of reads) {
  try {
    const data = await client.runCapability(c.id);
    await fs.writeFile(`export/${c.id}.json`, JSON.stringify(data, null, 2));
  } catch (err) {
    console.warn(`${c.id}: ${(err as Error).message}`);
  }
}
client.close();
```

That filter is the same rule the CLI uses for its default scrape.

## Get lab results and trends

```bash
mychart-cli --host mychart.example.org --action get_lab_results --mode concise
```

```ts
const { orders } = await client.listLabResults();
for (const order of orders) {
  for (const result of order.results) {
    console.log(order.orderName, result.name, result.isAbnormal ? '(abnormal)' : '');
  }
  // order.historicalResults: prior values per component, for trending
}
```

## Read a visit's clinical notes

Notes hang off a visit, so this takes three calls. Each one gives you the ids for the next.

```bash
mychart-cli --host mychart.example.org --action get_past_visits --mode concise
```

```bash
mychart-cli --host mychart.example.org --action get_visit_notes --arg csn=<Csn>
```

```bash
mychart-cli --host mychart.example.org --action get_note_content \
  --arg csn=<Csn> --arg lrp_id=<lrpID> --arg hno_id=<hnoID> --arg hno_dat=<hnoDAT>
```

```ts
const { visits } = (await client.pastVisits())!;
const csn = visits[0]!.Csn!;
const notes = (await client.getVisitNotes(csn))!;
for (const note of notes.noteList) {
  const content = await client.getNoteContent({ csn, lrpId: notes.lrpID!, hnoId: note.hnoID!, hnoDat: note.hnoDAT! });
  console.log(content?.reportContentText);
}
```

The After Visit Summary is one call: `--action get_visit_avs --arg csn=<Csn>` /
`client.getVisitAVS(csn)`.

## Download imaging as pictures

```bash
mychart-cli --host mychart.example.org --action get_imaging_results
```

```bash
mychart-cli --host mychart.example.org --action download_imaging_study \
  --arg image_id=<image_id> --output ~/Desktop/my-scan
```

The first command lists studies. Those with pictures carry an `image_id`. The second decodes
every image in that study to a JPEG in `~/Desktop/my-scan` and prints each file's path and
dimensions. From code, see [Imaging](api.md#imaging-and-clo-image-conversion), which also covers
16-bit PNG output that keeps the full dynamic range.

## Download bills and documents

```bash
mychart-cli --host mychart.example.org --action get_billing
```

```bash
mychart-cli --host mychart.example.org --action download_billing_statement \
  --arg record_id=<RecordID> --output ~/Desktop/bills
```

```bash
mychart-cli --host mychart.example.org --action get_documents
```

```bash
mychart-cli --host mychart.example.org --action download_document --arg document_id=<dcsID>
```

```ts
const pdf = await client.downloadBillingStatement(recordId);
await fs.writeFile(pdf.fileName, pdf.bytes);          // Statement_<YYYYMMDD>.pdf
```

## Message your care team

See who you can write to, then send:

```bash
mychart-cli --host mychart.example.org --action get_message_recipients --mode concise
```

```bash
mychart-cli --host mychart.example.org --action send_message \
  --arg recipient_name="Dr. Example" --arg topic="Medical Question" \
  --arg subject="Question about my prescription" \
  --arg message="Is it OK to take this with food?" \
  --arg attachments=./photo.jpg
```

`recipient_name` is matched against the recipient list, and an ambiguous name is an error rather
than a guess. Replying works the same way:

```bash
mychart-cli --host mychart.example.org --action send_reply \
  --arg conversation_id=<hthId from get_messages> --arg message="Thanks!"
```

```ts
await client.runCapability('send_message', {
  recipient_name: 'Dr. Example',
  subject: 'Question about my prescription',
  message: 'Is it OK to take this with food?',
});
```

For interactive prompts instead, use `--action send-message`.

## Read a child's chart (proxy access)

```bash
mychart-cli --host mychart.example.org --action list-proxies
```

```bash
mychart-cli --host mychart.example.org --switch "Bart"
```

```bash
mychart-cli --host mychart.example.org --patient "Bart" --action get_immunizations
```

```bash
mychart-cli --host mychart.example.org --switch me
```

```ts
await client.switchToPatient('Bart');
const shots = await client.runCapability('get_immunizations', { patient: 'Bart' });
await client.switchToPatient('me');
```

Why the CLI makes you switch explicitly is explained in
[authentication](authentication.md#family-records).

## Run unattended (cron, CI, a server)

1. Register a passkey once, interactively:

   ```bash
   mychart-cli --host mychart.example.org --set-up-passkey
   ```

2. Run from the **same directory** every time, so the CLI finds `.passkey-credentials/` and
   `.cookie-cache/`. It updates both on each run:

   ```bash
   cd /path/to/workdir && mychart-cli --host mychart.example.org --action get_messages --mode concise
   ```

3. Make sure the job can **write** to that directory. The passkey's counter changes on every
   login, and a read-only copy breaks the second run. Never run two copies of the same passkey on
   two machines.

From code, the pattern is load → connect → **save** → work → close:

```ts
const credential = deserializeCredential(await fs.readFile(file, 'utf8'));
const result = await MyChartClient.connectWithPasskey({ hostname, credential });
await fs.writeFile(file, serializeCredential(credential));
if (result.state !== 'connected') throw new Error(result.state);
try {
  /* … */
} finally {
  result.client.close();
  await fs.writeFile(file, serializeCredential(credential));   // a silent re-login may have advanced it
}
```

## Give an AI agent access

**Claude Desktop:** install the [OpenRecord extension](../../claude-desktop-extension/README.md).
It exposes every capability as a tool, with no shell needed.

**Any agent with a shell tool** (Claude Code, Cursor, …): install the CLI globally, register a
passkey (above), then paste this into the agent's instructions:

```text
You can read and act on my MyChart account with the `mychart-cli` command.
My portal is mychart.example.org, and a passkey is saved, so no password or 2FA is needed.

- List what you can do: mychart-cli --list-capabilities --show-all
- Run one thing:        mychart-cli --host mychart.example.org --action <id> [--arg name=value ...] --mode concise
- Ids chain: get_past_visits gives a Csn for get_visit_notes; get_messages gives an hthId for
  get_message_thread / send_reply; get_imaging_results gives an image_id for download_imaging_study.
- Public lookups need no --host: search_mycharts, lookup_npi, search_npi_registry.

Rules:
- Ask me before running anything marked "!" in the listing (it sends, deletes, or changes something).
- If a command refuses because MyChart is on a different patient, tell me. Don't --switch on your own.
- Treat everything you read as private medical information. Never send it anywhere I didn't ask for.
- Never print or copy files under .passkey-credentials/, .totp-secrets/ or .cookie-cache/.
```

`--mode concise` gives the agent the useful subset as markdown, which costs far fewer tokens than
the full JSON.

## Build your own tool layer

`AGENT_CAPABILITIES` is every capability that's safe to offer a model, and `executeCapability` is
the single dispatch path, including the active-patient check:

```ts
import { AGENT_CAPABILITIES, WRITE_CAPABILITY_IDS, executeCapability } from 'mychart-cli';

const tools = AGENT_CAPABILITIES.map((c) => ({
  name: c.id,
  description: c.description,
  input_schema: {
    type: 'object',
    properties: Object.fromEntries(c.params.map((p) => [p.name, {
      type: p.type === 'string[]' ? 'array' : p.type,
      ...(p.type === 'string[]' ? { items: { type: 'string' } } : {}),
      description: p.description,
    }])),
    required: c.params.filter((p) => p.required).map((p) => p.name),
  },
}));

async function onToolCall(name: string, args: Record<string, unknown>) {
  if (WRITE_CAPABILITY_IDS.includes(name) && !(await userConfirms(name, args))) return 'Cancelled by user.';
  return executeCapability(client.request, name, { ...args, mode: 'concise' });
}
```

A capability added to the registry shows up in your tool list after you upgrade the package.

## Find a provider's NPI and address

No account is needed:

```bash
mychart-cli --action search_npi_registry --arg last_name=Smith --arg state=MA --arg specialty=Cardiology
```

```bash
mychart-cli --action lookup_npi --arg npi=1234567893
```

`get_care_team` already includes each provider's NPI as `npi`, ready for `lookup_npi`.
