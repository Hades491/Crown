# Dayline

Create an AI phone agent, share its number, and let anyone call it. After exactly 24 hours the line
answers **"This service is no longer available."** and stops working. Free to build, free to host, free to use.

## What it does

1. **Create** a line: project name, introduction, language, voice, option 1, option 2, and what happens for each.
2. Dayline gives it an **8-digit line number** and a link (`/c/<number>`).
3. **Anyone calls it** by dialling the number on the home page or opening the link: no app, no account.
   The agent speaks the introduction and both options, then listens for a keypad press or a spoken "one"/"two".
4. **After 24 hours** the line closes. Its text is erased 3 days later.

## Honest note about "real" phone numbers

A number that any ordinary phone can dial is a paid product from every telephony provider, so it cannot be free.
This free version therefore uses a **web-call line**: callers talk to the agent in their browser. The call engine
(`src/engine.js`) is deliberately independent of the browser, so a telephony adapter (Twilio, Exotel, Plivo) can be
added later without touching the dashboard, the data model or the 24-hour expiry.

## Run it locally

    npm install
    npm start            # http://localhost:3000
    npm test             # 21 end-to-end API checks, including the 24h expiry

Requires Node 20+.

## Deploy for free

**Render (easiest):** push this folder to a GitHub repo, then on render.com choose *New + > Blueprint* and select the
repo. `render.yaml` and the `Dockerfile` do the rest.

Free-tier caveats you should know about:

- Free web services **sleep after ~15 minutes idle**, so the first visitor waits ~30-60 s for a cold start.
- Free instances have **no persistent disk**, so SQLite data is lost on redeploy or restart. That fits a product
  whose lines live 24 hours, but accounts are lost too. For durable accounts, attach a disk (paid) or move the
  database to a free hosted Postgres (Neon, Supabase). Only `src/db.js` and the queries would change.
- Fly.io, Railway and a small VPS also work: it is a single Node process with one SQLite file in `DATA_DIR`.

## How it is built

| Piece | File |
|---|---|
| API, accounts, rate limits, headers | `src/server.js`, `src/security.js` |
| Projects, validation, 24h lifetime, sweeper | `src/projects.js` |
| Call engine (what to say next) | `src/engine.js` |
| Languages and system phrases | `src/catalog.js` |
| Dashboard and dialer | `public/app.js` |
| Call page: speech, keypad, mic, countdown | `public/call.js` |

- **Expiry** is enforced two ways: every call checks `expires_at` at the moment it happens (so a line stops
  exactly at 24h), and a sweeper runs every 30 s to mark lines expired and wipe their content after 3 days.
- **Voices** use the browser's built-in speech engine (free). Which languages and voices are available depends on
  the caller's device; captions always show what the agent is saying.
- **Voice input** uses the browser's speech recognition where supported (Chrome, Edge, Safari). The keypad always works.
- **Safety:** passwords hashed with bcrypt, httpOnly session cookies, same-origin checks, per-IP and per-user rate
  limits, strict Content-Security-Policy, input validation, link URLs limited to http(s), max 3 live lines per account.

## Known limits of this version

- No email verification or password reset (needs an email service).
- Rate limiting is in-memory, which is right for one instance. Use Redis if you scale out.
- Callers can only use the web line until a telephony adapter is added.
