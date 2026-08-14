// Reset all fake-mychart in-memory state (sessions, passkeys, sent
// messages, booked appointments) back to the seed before a flow that
// needs a clean slate. Runs on the Maestro host, so localhost always
// means the machine running the tests.
// Maestro's http.post requires a body (OkHttp rejects body-less POSTs).
var response = http.post("http://localhost:4000/reset", { body: "{}" });
var failed =
  response.ok === false ||
  (typeof response.status === "number" && response.status >= 400);
if (failed) {
  throw new Error("fake-mychart reset failed: HTTP " + response.status);
}
