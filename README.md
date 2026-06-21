# TikTok Scheduled Video Poster & Dashboard

A local web application and automation script designed to schedule and publish videos to your personal TikTok account at specific dates and times. 

It provides an Express backend server and a dark-mode web dashboard interface to configure API credentials, manage OAuth authentication, upload videos, and track publishing progress.

---

## Features

1. **Local Web Dashboard**: A single-page application built with modern dark-themed CSS styling (glassmorphism, vibrant buttons, custom cards, and micro-animations).
2. **Automated Token Management**: Automatically saves and refreshes TikTok's OAuth v2 access tokens using the 365-day refresh token.
3. **Smart Video Chunking**: Automatically splits large video files (>60MB) into sequential 10MB chunks to adhere to TikTok's Content Posting API constraints (5MB–64MB per chunk) and streams them using Node's native file system descriptors.
4. **Asynchronous Polling**: Tracks uploads through the TikTok publishing pipeline, checking status states (`PROCESSING_UPLOAD`, `PUBLISH_COMPLETE`, `FAILED`) and displaying progress bar loaders on the dashboard.
5. **Interactive UI Scheduler**: Drag-and-drop file uploader, character limit checkers, and preset shortcut scheduling buttons (+5 minutes, +1 hour, +1 day).

---

## Getting Started

### 1. Register a TikTok Developer App
To publish posts via the API, you must configure a developer application:
1. Visit [TikTok for Developers](https://developers.tiktok.com/) and register or sign in.
2. Select **My Apps** -> **Connect an App** (Choose **Web App**).
3. Under App settings, request permission for the **Content Posting API** (which includes the `video.publish` scope).
4. Register the following **Redirect URI** in your app credentials:
   ```text
   http://localhost:3000/callback
   ```

### 2. Launch the Local Application
1. Make sure dependencies are installed:
   ```bash
   npm install
   ```
2. Start the local server:
   ```bash
   node server.js
   ```
3. Open your browser and navigate to:
   ```text
   http://localhost:3000
   ```

### 3. Connect your Account
1. In the web dashboard, click the **Developer Keys** tab in the sidebar.
2. Input your App's **Client Key** and **Client Secret**.
3. Set your Redirect URI to `http://localhost:3000/callback` (or match the port you launched the server on).
4. Click **Save Configuration**.
5. Once saved, a **Connect TikTok Account** panel will appear at the bottom. Click it to navigate to TikTok's official consent screen.
6. Grant authorizations. Upon success, TikTok redirects you back to your local dashboard.

### 4. Schedule a Video
1. Go to the **Schedule Post** tab.
2. Select or drag and drop an MP4 video file.
3. Add a caption (up to 2,200 characters). You can click on the quick hashtag chips to quickly append popular tags.
4. Select a publication Date and Time in the future.
5. Click **Schedule Post**.
6. The video will upload locally to the server's database (`uploads/` directory). The server's background scheduler will monitor and begin publishing the video exactly at the designated time.

---

## File Structure

```text
tiktok api/
├── server.js            # Express server, scheduler loop & TikTok API interactions
├── config.json          # Local database storing keys, OAuth tokens & creator info (auto-created)
├── posts.json           # Local database storing the post queue (auto-created)
├── package.json         # NPM package dependencies (axios, express, multer, etc.)
├── uploads/             # Temporary folder storing queued MP4 videos (auto-created)
└── public/
    ├── index.html       # Single Page Application layout
    ├── style.css        # Glassmorphic dark-mode CSS styles
    └── app.js           # Client-side form handlers & automatic status pollers
```

---

## Technical Details

### Token Expiration
- Access tokens expire every 24 hours. The server checks this timestamp before initializing any upload, and if less than 5 minutes remain, it requests a new access token using the refresh token.
- Refresh tokens are valid for 365 days. The refresh token itself is refreshed periodically by TikTok when renewing the access token.

### Upload Stream Logic
TikTok's Content Posting API expects chunked streaming for uploads.
1. The server requests upload initialization via `https://open.tiktokapis.com/v2/post/publish/video/init/`.
2. It obtains a pre-signed AWS S3/CDN upload URL.
3. The server slices the video file byte-by-byte, constructing the exact range header:
   ```http
   Content-Range: bytes 0-10485759/30000000
   ```
4. It issues serial `PUT` requests to the S3 upload URL. Once finished, TikTok processes the upload asynchronously.
5. The scheduler polls the status endpoint every 20 seconds to monitor rendering until it is publicly published.
6. To conserve disk space, once a video is successfully published (or fails permanently), the temporary file in `uploads/` is deleted.

---

## Troubleshooting

- **Permissions Error (Private Video)**: If your TikTok Developer Application is in sandbox/development mode, posts will be visible **only to you** (`SELF_ONLY`) on TikTok. You must submit your developer app for official review/audit to publish videos publicly (`PUBLIC_TO_EVERYONE`).
- **Post Not Triggered**: Ensure your server script is continuously running (`node server.js` or using a process manager like `pm2`) at the scheduled time. If the script was offline during the scheduled time, it will automatically catch up and publish the video immediately once it is restarted.
- **Port Conflict**: If port `3000` is already in use, you can launch the server on another port by setting the `PORT` environment variable:
  ```bash
  PORT=4000 node server.js
  ```
  *(Remember to update the Redirect URI in your TikTok Developer Portal to match, e.g. `http://localhost:4000/callback`)*
