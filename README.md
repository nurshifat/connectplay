# ConnectPlay

A private gaming communication app using **Supabase** for auth/database/realtime and **LiveKit** for voice, video and game/screen streaming.

## 1. Install

```bash
npm install
```

## 2. Configure environment

Copy `.env.example` to `.env` and fill in:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `VITE_LIVEKIT_URL`
- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`

The LiveKit API secret is **server-only**. Never prefix it with `VITE_`.

## 3. Configure Supabase

Open Supabase Dashboard → SQL Editor and run the entire `supabase/schema.sql` file.

The script creates the tables, RLS policies, signup profile trigger, secure `create_or_get_dm` RPC, and realtime publication entries.

In Supabase Auth, configure your email/password provider. If email confirmation is enabled, users must confirm their email before signing in.

## 4. Configure LiveKit

Create a LiveKit Cloud project or run your own LiveKit server. Copy its WebSocket URL, API key and API secret into `.env`.

The app never sends the LiveKit secret to the browser. The Express server verifies the user's Supabase access token and checks conversation/community membership before issuing a 2-hour LiveKit token.

## 5. Run in VS Code

Open the project folder in VS Code and run:

```bash
npm run dev
```

This starts:

- Vite frontend: `http://localhost:5173`
- API/token server: `http://localhost:8787`

Vite proxies `/api/*` to the token server.

## 6. Test the real flows

Use two browser profiles/incognito windows with two different accounts:

1. Register both accounts.
2. Search one username from the other account.
3. Send and accept the friend request.
4. Open a DM.
5. Send messages from both windows.
6. Start a voice call, then video call.
7. Start screen/game sharing from one window.
8. Allow microphone/camera/screen permissions.
9. End the call and verify devices are released.

### Streaming note
The browser requests up to 1920×1080 screen capture. Actual resolution and frame rate are adaptive and depend on the browser, GPU/encoder, upload bandwidth and LiveKit/network conditions. Do not assume every device will deliver 1080p/60fps.

## Production

Build with `npm run build`, then run the Node server with `NODE_ENV=production npm start`. Put the Node server behind HTTPS. Configure the same environment variables on the server. For production, the frontend and `/api` token endpoint must be served from the same origin or the API must be configured with appropriate CORS.

## Free online deployment

This project includes `render.yaml` for a free Render web service. Render serves the built frontend and API from one HTTPS URL, so no paid CORS setup is needed.

1. Create a free account at Render and connect a GitHub repository containing this project. Git is not installed in the current workspace, so upload the project to GitHub from another computer or install Git first.
2. In Render, choose **New → Blueprint** and select the repository. Render reads `render.yaml`.
3. Enter these values when Render asks for environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET`. Use the values from your local `.env`; never upload `.env` to GitHub.
4. Deploy and open the free `onrender.com` URL. The service may sleep after inactivity on the free plan, so the first request can take a little longer.

Supabase and LiveKit must also remain within their free-tier limits. The app needs HTTPS in production because browsers require a secure origin for microphone, camera, and screen sharing.


## Voice, video and game streaming

ConnectPlay uses LiveKit as the SFU for real-time media. Add these values to `.env` before testing media:

```env
VITE_LIVEKIT_URL=wss://YOUR_PROJECT.livekit.cloud
LIVEKIT_URL=wss://YOUR_PROJECT.livekit.cloud
LIVEKIT_API_KEY=YOUR_API_KEY
LIVEKIT_API_SECRET=YOUR_API_SECRET
```

The API secret is server-only and must never be prefixed with `VITE_`.

In a direct message, use the phone button for voice, camera button for video, or monitor button for a game stream. The recipient gets an incoming-call overlay when their ConnectPlay app is open. For game streaming, click **Share Screen** in the LiveKit control bar and choose the game window. Browser audio sharing is supported when the browser offers it (for example, sharing a Chrome tab with tab audio).

For two different computers, `localhost` is only local to the machine. Deploy the Vite frontend and Express API (or run them behind one public HTTPS domain) so both friends can access the same ConnectPlay URL. LiveKit itself is already internet-facing once your LiveKit Cloud project is configured.
