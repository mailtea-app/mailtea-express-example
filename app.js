import express from "express";
import { MailteaError } from "mailtea-sdk";

// Good enough to reject obvious junk before spending an API call. The real
// validation is Mailtea's; this is here so a typo comes back as a 400 from
// your own API rather than a 422 from someone else's.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Builds the API. Taking the client and the From address as arguments (rather
 * than reading `process.env` in here) is what lets the tests point the same
 * routes at a mock Mailtea server.
 */
export function createApp({ mailtea, from }) {
  const app = express();
  app.use(express.json());

  app.post("/send", async (req, res) => {
    const { to, subject } = req.body ?? {};

    if (typeof to !== "string" || !EMAIL_RE.test(to)) {
      return res.status(400).json({ error: "`to` must be a valid email address." });
    }
    if (typeof subject !== "string" || subject.trim() === "") {
      return res.status(400).json({ error: "`subject` must be a non-empty string." });
    }

    // Express 5 forwards a rejected promise to the error handler on its own, so
    // a failed send lands in `mailteaErrorHandler` below without a try/catch.
    const { id } = await mailtea.emails.send({
      from,
      to,
      subject,
      html: `<p>Sent from an Express route with Mailtea.</p>`
    });

    // 202: Mailtea has accepted the message, but delivery is still in flight —
    // which is exactly what `GET /emails/:id` is for.
    res.status(202).json({ id });
  });

  app.get("/emails/:id", async (req, res) => {
    const email = await mailtea.emails.get(req.params.id);

    res.json({
      id: email.id,
      subject: email.subject,
      status: email.status,
      created_at: email.created_at
    });
  });

  app.use(mailteaErrorHandler);
  return app;
}

/**
 * Mailtea's HTTP status is more useful to your caller than a blanket 500: a
 * 422 for an unverified domain and a 429 for a rate limit want different
 * client behaviour. `MailteaError` carries that status through, so pass it on.
 */
function mailteaErrorHandler(err, _req, res, _next) {
  if (err instanceof MailteaError) {
    // `status` is 0 for client-side faults (no API key, no global fetch), and
    // those are not the caller's fault — report them as a bad gateway.
    const status = err.status >= 400 && err.status <= 599 ? err.status : 502;
    return res.status(status).json({ error: err.message, code: err.code });
  }

  // express.json() rejects a malformed body with its own status.
  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Request body must be valid JSON." });
  }

  // A transport fault never reaches a response, so the SDK never gets to wrap
  // it: `fetch` rejects with its own TypeError and that is what lands here.
  // Mailtea being unreachable is an upstream problem, so it deserves the same
  // 502 a client-side MailteaError gets — not the 500 that means "we crashed".
  // Matching on the cause as well as the message keeps an ordinary TypeError
  // from your own code (a real bug) reporting itself honestly as a 500.
  if (err instanceof TypeError && err.message === "fetch failed" && err.cause) {
    return res.status(502).json({ error: "Could not reach Mailtea.", code: "connection_failed" });
  }

  console.error(err);
  res.status(500).json({ error: "Internal Server Error" });
}
