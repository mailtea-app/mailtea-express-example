import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Mailtea } from "mailtea-sdk";

import { createApp } from "../app.js";
import { startMockMailtea } from "./mock-mailtea.mjs";

const FROM = "Acme <hello@acme.com>";
const TO = "reader@mailtea.test";

/** Starts an app on an ephemeral port and returns a `fetch` bound to its base. */
async function listen(app) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();

  return {
    async request(path, init) {
      const res = await fetch(`http://127.0.0.1:${port}${path}`, init);
      return { status: res.status, body: await res.json() };
    },
    async close() {
      await new Promise((resolve) => server.close(resolve));
    }
  };
}

describe("Mailtea + Express example", () => {
  let mock;
  let api;

  before(async () => {
    mock = await startMockMailtea();
    const mailtea = new Mailtea("mt_pat_test", { baseUrl: mock.url });
    api = await listen(createApp({ mailtea, from: FROM }));
  });

  after(async () => {
    await api.close();
    await mock.close();
  });

  it("POST /send sends through Mailtea and returns the email id", async () => {
    const res = await api.request("/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ to: TO, subject: "Hello from Express" })
    });

    assert.equal(res.status, 202);
    assert.match(res.body.id, /^txemail_/);

    const sent = mock.last;
    assert.equal(sent.method, "POST");
    assert.equal(sent.path, "/v1/emails");
    assert.match(sent.authorization, /^Bearer /);
    assert.equal(sent.body.from, FROM);
    assert.equal(sent.body.to, TO);
    assert.equal(sent.body.subject, "Hello from Express");
    assert.match(sent.body.html, /<p>/);
  });

  it("GET /emails/:id reports the delivery status", async () => {
    const res = await api.request("/emails/txemail_abc123");

    assert.equal(res.status, 200);
    assert.equal(res.body.id, "txemail_abc123");
    assert.equal(res.body.status, "delivered");

    assert.equal(mock.last.method, "GET");
    assert.equal(mock.last.path, "/v1/emails/txemail_abc123");
    assert.match(mock.last.authorization, /^Bearer /);
  });

  it("rejects a bad recipient with 400 and never calls the API", async () => {
    const before = mock.requests.length;

    const res = await api.request("/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ to: "not-an-email", subject: "Hello" })
    });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /`to`/);
    assert.equal(mock.requests.length, before, "no request should reach Mailtea");
  });

  it("rejects a missing subject with 400", async () => {
    const res = await api.request("/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ to: TO, subject: "   " })
    });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /`subject`/);
  });

  it("rejects a malformed JSON body with 400", async () => {
    const res = await api.request("/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{ not json"
    });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /valid JSON/);
  });

  it("answers 502, not 500, when Mailtea is unreachable", async () => {
    // Port 1 is privileged and never listening, so the connection is refused.
    // `fetch` rejects before there is any response to read, which means the SDK
    // never wraps it in a MailteaError — this is the raw TypeError path.
    const mailtea = new Mailtea("mt_pat_test", { baseUrl: "http://127.0.0.1:1" });
    const offline = await listen(createApp({ mailtea, from: FROM }));

    try {
      const res = await offline.request("/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to: TO, subject: "Hello" })
      });

      assert.equal(res.status, 502, "an unreachable upstream is a bad gateway, not our crash");
      assert.equal(res.body.code, "connection_failed");
    } finally {
      await offline.close();
    }
  });

  it("passes a Mailtea error status through to the response", async () => {
    // Pointing the client one path segment off makes the mock answer 404, which
    // is a genuine MailteaError from the SDK rather than a hand-made stub.
    const mailtea = new Mailtea("mt_pat_test", { baseUrl: `${mock.url}/wrong` });
    const broken = await listen(createApp({ mailtea, from: FROM }));

    try {
      const res = await broken.request("/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to: TO, subject: "Hello" })
      });

      assert.equal(res.status, 404, "the SDK's status should survive, not become a 500");
      assert.equal(res.body.error, "Not Found");
    } finally {
      await broken.close();
    }
  });
});
