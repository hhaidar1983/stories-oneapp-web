# Stories OneApp — Web

The staff-facing front-end for the checklist backbone: branch teams complete
Opening / Handover / Closing checklists (with photo/video evidence uploaded
straight to Blob storage), and head office reviews, flags, and approves — all
talking to the NestJS API.

**Vite + React + TypeScript + MSAL.** Matches the backend stack. This is the
production wiring of the `stories-oneapp-checklist` prototype: the same UX, but
the in-memory data is replaced by real API calls, Entra sign-in, and direct-to-
Blob uploads.

## Run it

```bash
npm install
cp .env.example .env      # set VITE_API_BASE to your API
npm run dev               # http://localhost:5173
```

With `VITE_MSAL_CLIENT_ID` empty the app runs in **demo mode**: it sends the
`x-user-id` header (matching the backend's dev auth) and lets you switch between
seeded users in the top bar — so you can click through the whole flow against a
locally-running API with no Entra tenant.

## Real Entra sign-in

Set these in `.env` and the app switches to MSAL popup sign-in, acquiring an API
access token and sending it as a bearer token:

```
VITE_MSAL_CLIENT_ID=<the SPA app registration client id>
VITE_MSAL_TENANT=<your tenant id>
VITE_API_SCOPE=api://<api-app-id>/access_as_user
```

## How it maps to the backend

| Screen / action | API call |
| --- | --- |
| Load a branch's checklists | `GET /branches/:id/checklists` |
| Capture a photo/video | `POST /media/upload-token` → `PUT` straight to Blob |
| Submit a checklist | `POST /submissions` (server validates + flags + stores) |
| Head-office feed | `GET /submissions?date=today` |
| Open + review | `GET /submissions/:id`, `POST /submissions/:id/review` |

Auth headers are attached centrally in `src/api.ts` — a bearer token in Entra
mode, `x-user-id` in demo mode. Media never passes through the API: the app gets
a one-off write-only URL and uploads the file directly to storage.

## Build & deploy

```bash
npm run build     # tsc --noEmit && vite build -> dist/
```

`dist/` is a static bundle — deploy to **Azure Static Web Apps** or the Blob
`$web` container behind the CDN. Set the `VITE_*` values as build-time env in
your pipeline. Add the SPA redirect URI to the Entra app registration.
