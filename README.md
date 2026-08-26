# Mailtea + Express Example

This example shows how to use [Mailtea](https://mailtea.app) with Express 5 to
expose a small HTTP API that sends an email and then reports its delivery
status.

## Prerequisites

To get the most out of this guide, you'll need to:

- [Create an API key](https://studio.mailtea.app/api-keys)
- [Verify your domain](https://docs.mailtea.app/docs/documentation/domains)

## Instructions

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env` and add your API key:
   ```bash
   cp .env.example .env
   ```
   Set `MAILTEA_FROM` too — it has to be an address on a domain you have
   verified in Mailtea.
3. Run it:
   ```bash
   npm start
   ```
   That reads `.env` if there is one, and otherwise takes the variables from
   the environment — which is what you want on a host that injects them.

Then send one:

```bash
curl -X POST http://localhost:3000/send \
  -H "content-type: application/json" \
  -d '{"to": "reader@yourdomain.com", "subject": "Hello from Express"}'
```

```json
{ "id": "txemail_5f2c1a9e4b7d40c8ae31f6b0d9c27e14" }
```

Check where it got to:

```bash
curl http://localhost:3000/emails/txemail_5f2c1a9e4b7d40c8ae31f6b0d9c27e14
```

```json
{
  "id": "txemail_5f2c1a9e4b7d40c8ae31f6b0d9c27e14",
  "subject": "Hello from Express",
  "status": "delivered",
  "created_at": "2026-01-01T00:00:00.000Z"
}
```

## What this example covers

- Sending an email from an Express route with `mailtea.emails.send()`
- Reading delivery status back with `mailtea.emails.get()`
- Validating the request body and answering `400` before spending an API call
- Letting Express 5 forward a rejected promise straight to the error handler,
  so the send path needs no `try`/`catch`
- Mapping `MailteaError.status` onto the HTTP response, so a `422` for an
  unverified domain or a `429` for a rate limit reaches your caller intact
- Answering `502` when Mailtea itself is unreachable, so a network fault is
  not mistaken for a bug in your own service

## Tests

```bash
npm test
```

The tests run against a bundled mock Mailtea server, so they need no API key
and make no network calls.

## Learn more

- [Documentation](https://docs.mailtea.app)
- [API reference](https://docs.mailtea.app/docs/api-reference)
- [Node.js SDK](https://github.com/mailtea-app/mailtea-node) ·
  [Python SDK](https://github.com/mailtea-app/mailtea-python) ·
  [MCP server](https://github.com/mailtea-app/mailtea-mcp)
