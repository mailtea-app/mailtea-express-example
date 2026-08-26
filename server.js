import { Mailtea } from "mailtea-sdk";
import { createApp } from "./app.js";

for (const name of ["MAILTEA_API_KEY", "MAILTEA_FROM"]) {
  if (!process.env[name]) {
    console.error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
}

const mailtea = new Mailtea(process.env.MAILTEA_API_KEY, {
  // Only needed for local dev or a self-hosted Mailtea. Omit in production.
  baseUrl: process.env.MAILTEA_API_BASE_URL
});

const app = createApp({ mailtea, from: process.env.MAILTEA_FROM });
const port = Number(process.env.PORT ?? 3000);

app.listen(port, () => {
  console.log(`Listening on http://localhost:${port}`);
});
