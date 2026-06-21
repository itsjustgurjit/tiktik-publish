import express from "express";
import multer from "multer";
import axios from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure directories exist
const UPLOADS_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueId = crypto.randomUUID();
    const ext = path.extname(file.originalname) || ".mp4";
    cb(null, `${uniqueId}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // limit to 500MB
});

const CONFIG_FILE = path.join(__dirname, "config.json");
const POSTS_FILE = path.join(__dirname, "posts.json");

// Helper: load config
function loadConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
    } catch (e) {
      console.error("Error parsing config.json, resetting...", e);
    }
  }
  return {};
}

// Helper: save config
function saveConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
}

// Helper: load posts
function loadPosts() {
  if (fs.existsSync(POSTS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(POSTS_FILE, "utf-8"));
    } catch (e) {
      console.error("Error parsing posts.json, resetting...", e);
    }
  }
  return [];
}

// Helper: save posts
function savePosts(posts) {
  fs.writeFileSync(POSTS_FILE, JSON.stringify(posts, null, 2), "utf-8");
}

// Helper: refresh token if needed
async function refreshAccessTokenIfNeeded() {
  const config = loadConfig();
  if (!config.refreshToken) {
    throw new Error("No refresh token available. Please connect your TikTok account.");
  }

  // Check if token is expired or expires in the next 5 minutes
  const now = Date.now();
  if (config.expiresAt && now < config.expiresAt - 5 * 60 * 1000) {
    // Access token is still valid
    return config.accessToken;
  }

  console.log("Access token expired or expiring soon. Refreshing...");
  try {
    const params = new URLSearchParams({
      client_key: config.clientKey,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
      refresh_token: config.refreshToken,
    });

    const res = await axios.post("https://open.tiktokapis.com/v2/oauth/token/", params, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    if (res.data.error || !res.data.access_token) {
      const errMsg = res.data.error_description || res.data.message || JSON.stringify(res.data);
      throw new Error(`TikTok Token Refresh Failed: ${errMsg}`);
    }

    const { access_token, refresh_token, expires_in, refresh_expires_in } = res.data;

    config.accessToken = access_token;
    config.refreshToken = refresh_token;
    config.expiresAt = Date.now() + expires_in * 1000;
    if (refresh_expires_in) {
      config.refreshExpiresAt = Date.now() + refresh_expires_in * 1000;
    }

    saveConfig(config);
    console.log("Access token successfully refreshed.");
    return access_token;
  } catch (err) {
    console.error("Error refreshing token:", err.response?.data || err.message);
    throw new Error(`Token refresh failed: ${err.response?.data?.error_description || err.message}`);
  }
}

// Helper: query creator info from TikTok
async function fetchCreatorInfo(accessToken) {
  const res = await axios.post(
    "https://open.tiktokapis.com/v2/post/publish/creator_info/query/",
    {},
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
    }
  );
  if (res.data.error && res.data.error.code !== "ok") {
    throw new Error(res.data.error.message);
  }
  return res.data.data;
}

// ----------------------------------------------------
// API ROUTES
// ----------------------------------------------------

// Get configuration state
app.get("/api/config", (req, res) => {
  const config = loadConfig();
  res.json({
    clientKey: config.clientKey || "",
    redirectUri: config.redirectUri || "",
    hasClientSecret: !!config.clientSecret,
    isConnected: !!config.refreshToken,
    creatorInfo: config.creatorInfo || null,
  });
});

// Update client keys
app.post("/api/config", (req, res) => {
  const { clientKey, clientSecret, redirectUri } = req.body;
  if (!clientKey || !clientSecret || !redirectUri) {
    return res.status(400).json({ error: "Missing required config parameters." });
  }

  const config = loadConfig();
  config.clientKey = clientKey;
  config.clientSecret = clientSecret;
  config.redirectUri = redirectUri;

  saveConfig(config);
  res.json({ success: true, message: "Configuration saved successfully." });
});

// Redirect to TikTok OAuth
app.get("/api/auth", (req, res) => {
  const config = loadConfig();
  if (!config.clientKey || !config.redirectUri) {
    return res.status(400).send("Please configure Client Key and Redirect URI first.");
  }

  const state = crypto.randomBytes(8).toString("hex");
  
  // Scopes required for video publish
  const scopes = ["user.info.basic", "video.publish"].join(",");

  const authUrl = `https://www.tiktok.com/v2/auth/authorize/?client_key=${config.clientKey}&scope=${scopes}&response_type=code&redirect_uri=${encodeURIComponent(config.redirectUri)}&state=${state}`;
  
  res.redirect(authUrl);
});

// OAuth Callback handler
app.get("/callback", async (req, res) => {
  const { code, error, error_description } = req.query;
  if (error) {
    console.error("OAuth callback error:", error, error_description);
    return res.redirect(`/index.html?auth=failed&error=${encodeURIComponent(error_description || error)}`);
  }

  if (!code) {
    return res.redirect(`/index.html?auth=failed&error=No code returned from TikTok`);
  }

  try {
    const config = loadConfig();
    const params = new URLSearchParams({
      client_key: config.clientKey,
      client_secret: config.clientSecret,
      code: code,
      grant_type: "authorization_code",
      redirect_uri: config.redirectUri,
    });

    console.log("Exchanging code for tokens...");
    const tokenRes = await axios.post("https://open.tiktokapis.com/v2/oauth/token/", params, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    if (tokenRes.data.error || !tokenRes.data.access_token) {
      const errMsg = tokenRes.data.error_description || tokenRes.data.message || JSON.stringify(tokenRes.data);
      throw new Error(`Token exchange error: ${errMsg}`);
    }

    const { access_token, refresh_token, expires_in, refresh_expires_in, open_id } = tokenRes.data;

    config.accessToken = access_token;
    config.refreshToken = refresh_token;
    config.expiresAt = Date.now() + expires_in * 1000;
    if (refresh_expires_in) {
      config.refreshExpiresAt = Date.now() + refresh_expires_in * 1000;
    }
    config.openId = open_id;

    console.log("Fetching creator profile details...");
    try {
      const creatorInfo = await fetchCreatorInfo(access_token);
      config.creatorInfo = creatorInfo;
    } catch (profileErr) {
      console.warn("Could not query creator info, using placeholder profiles:", profileErr.message);
      config.creatorInfo = {
        creator_username: "TikTok Creator",
        creator_nickname: "Creator",
        privacy_level_options: ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "SELF_ONLY"],
      };
    }

    saveConfig(config);
    res.redirect("/index.html?auth=success");
  } catch (err) {
    console.error("OAuth callback exchange failed:", err.response?.data || err.message);
    const details = err.response?.data?.error_description || err.message;
    res.redirect(`/index.html?auth=failed&error=${encodeURIComponent(details)}`);
  }
});

// Disconnect TikTok account
app.post("/api/disconnect", (req, res) => {
  const config = loadConfig();
  delete config.accessToken;
  delete config.refreshToken;
  delete config.expiresAt;
  delete config.refreshExpiresAt;
  delete config.openId;
  delete config.creatorInfo;

  saveConfig(config);
  res.json({ success: true, message: "Disconnected successfully." });
});

// Get scheduled/published posts
app.get("/api/posts", (req, res) => {
  const posts = loadPosts();
  // Return posts sorted newest first
  res.json(posts.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

// Schedule a post
app.post("/api/schedule", upload.single("video"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No video file provided." });
  }

  const { title, privacyLevel, scheduledTime } = req.body;
  if (!title) {
    // Cleanup uploaded file if validation fails
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: "Title/caption is required." });
  }

  // Parse time
  let postTime = new Date();
  if (scheduledTime) {
    postTime = new Date(scheduledTime);
    if (isNaN(postTime.getTime())) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Invalid scheduled time format." });
    }
  } else {
    // Schedule immediately (10 seconds from now)
    postTime.setSeconds(postTime.getSeconds() + 10);
  }

  const posts = loadPosts();
  const newPost = {
    id: crypto.randomUUID(),
    title,
    videoPath: req.file.path,
    videoName: req.file.originalname,
    scheduledTime: postTime.toISOString(),
    privacyLevel: privacyLevel || "SELF_ONLY",
    status: "scheduled",
    publishId: null,
    errorMessage: null,
    createdAt: new Date().toISOString(),
    publishedAt: null,
  };

  posts.push(newPost);
  savePosts(posts);

  res.json({ success: true, post: newPost });
});

// Delete a scheduled or published post
app.delete("/api/posts/:id", (req, res) => {
  const { id } = req.params;
  const posts = loadPosts();
  const postIndex = posts.findIndex((p) => p.id === id);

  if (postIndex === -1) {
    return res.status(404).json({ error: "Post not found." });
  }

  const post = posts[postIndex];

  // Attempt to delete video file
  if (post.videoPath && fs.existsSync(post.videoPath)) {
    try {
      fs.unlinkSync(post.videoPath);
    } catch (e) {
      console.error(`Failed to delete local video file: ${post.videoPath}`, e);
    }
  }

  posts.splice(postIndex, 1);
  savePosts(posts);

  res.json({ success: true, message: "Post deleted successfully." });
});

// Refresh token query manually
app.post("/api/refresh-token", async (req, res) => {
  try {
    const token = await refreshAccessTokenIfNeeded();
    res.json({ success: true, accessToken: token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// SCHEDULER QUEUE PROCESSOR
// ----------------------------------------------------

async function processQueue() {
  const posts = loadPosts();
  const now = new Date();
  
  // Find scheduled posts that are due
  const duePosts = posts.filter(
    (p) => p.status === "scheduled" && new Date(p.scheduledTime) <= now
  );

  for (const post of duePosts) {
    console.log(`Processing scheduled post: "${post.title}" (ID: ${post.id})`);
    post.status = "pending_upload";
    savePosts(posts);

    // Run execution asynchronously so it doesn't block the scheduler interval
    executePostUpload(post.id).catch((err) => {
      console.error(`Async execution failed for post ${post.id}:`, err);
    });
  }
}

async function executePostUpload(postId) {
  // Reload posts inside function to get fresh statuses
  let posts = loadPosts();
  let post = posts.find((p) => p.id === postId);
  if (!post) return;

  try {
    post.status = "uploading";
    savePosts(posts);

    // 1. Check and refresh tokens
    let token;
    try {
      token = await refreshAccessTokenIfNeeded();
    } catch (err) {
      throw new Error(`Token refresh failed: ${err.message}`);
    }

    // 2. Validate video file exists
    if (!fs.existsSync(post.videoPath)) {
      throw new Error(`Local video file not found at path: ${post.videoPath}`);
    }

    const stats = fs.statSync(post.videoPath);
    const fileSize = stats.size;

    // 3. Calculate chunks (TikTok requires chunks between 5MB and 64MB, last chunk up to 128MB)
    // If video is small, upload in one single chunk.
    const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB default
    let chunkSizeBytes = fileSize;
    let totalChunks = 1;

    if (fileSize > 60 * 1024 * 1024) {
      chunkSizeBytes = CHUNK_SIZE;
      totalChunks = Math.floor(fileSize / chunkSizeBytes);
      if (totalChunks === 0) totalChunks = 1;
    }

    console.log(`Initializing upload for "${post.title}". Size: ${fileSize} bytes, chunks: ${totalChunks}, chunk_size: ${chunkSizeBytes}`);

    // 4. Initialize upload with TikTok API
    const initPayload = {
      post_info: {
        title: post.title,
        privacy_level: post.privacyLevel,
        disable_comment: false,
        disable_duet: false,
        disable_stitch: false,
      },
      source_info: {
        source: "FILE_UPLOAD",
        video_size: fileSize,
        chunk_size: chunkSizeBytes,
        total_chunk_count: totalChunks,
      },
    };

    const initRes = await axios.post(
      "https://open.tiktokapis.com/v2/post/publish/video/init/",
      initPayload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
      }
    );

    if (initRes.data.error && initRes.data.error.code !== "ok") {
      const errMsg = initRes.data.error.message || JSON.stringify(initRes.data.error);
      throw new Error(`TikTok Video Init Failed: ${errMsg}`);
    }

    const { upload_url, publish_id } = initRes.data.data;
    post.publishId = publish_id;
    savePosts(posts);

    // 5. Upload chunks
    const fd = fs.openSync(post.videoPath, "r");
    try {
      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSizeBytes;
        let end = start + chunkSizeBytes - 1;
        if (i === totalChunks - 1) {
          end = fileSize - 1; // Last chunk gets everything left
        }
        const chunkLen = end - start + 1;
        const buffer = Buffer.alloc(chunkLen);
        fs.readSync(fd, buffer, 0, chunkLen, start);

        console.log(`Uploading chunk ${i + 1}/${totalChunks} (bytes ${start}-${end}/${fileSize})...`);
        
        await axios.put(upload_url, buffer, {
          headers: {
            "Content-Type": "video/mp4",
            "Content-Length": chunkLen,
            "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        });
      }
    } finally {
      fs.closeSync(fd);
    }

    console.log(`Upload complete for post ${post.id}. Verification publish ID: ${publish_id}`);
    post.status = "processing";
    savePosts(posts);

    // Start polling status
    pollPublishStatus(post.id, token, publish_id);

  } catch (err) {
    console.error(`Post upload failed for post ${post.id}:`, err.response?.data || err.message);
    const apiError = err.response?.data?.error?.message || err.response?.data?.message;
    post.status = "failed";
    post.errorMessage = apiError || err.message;
    savePosts(posts);
  }
}

// Poll the status of the post processing in TikTok's pipeline
async function pollPublishStatus(postId, token, publishId) {
  const maxAttempts = 90; // 90 attempts * 20 seconds = 30 minutes max
  let attempts = 0;

  const intervalId = setInterval(async () => {
    attempts++;
    let posts = loadPosts();
    let post = posts.find((p) => p.id === postId);

    // Stop if post was deleted or changed manually
    if (!post || post.status !== "processing") {
      clearInterval(intervalId);
      return;
    }

    try {
      const res = await axios.post(
        "https://open.tiktokapis.com/v2/post/publish/status/fetch/",
        { publish_id: publishId },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json; charset=UTF-8",
          },
        }
      );

      if (res.data.error && res.data.error.code !== "ok") {
        console.error(`Status check error for post ${postId}:`, res.data.error.message);
        // Do not fail immediately, might be a transient API error.
        if (attempts > 5) {
          throw new Error(res.data.error.message);
        }
        return;
      }

      const status = res.data.data.status;
      console.log(`Polling status for post ${postId}: ${status} (Attempt ${attempts}/${maxAttempts})`);

      if (status === "PUBLISH_COMPLETE") {
        clearInterval(intervalId);
        post.status = "published";
        post.publishedAt = new Date().toISOString();
        // Delete local file to save space once fully published
        if (post.videoPath && fs.existsSync(post.videoPath)) {
          try {
            fs.unlinkSync(post.videoPath);
            post.videoPath = null; // Clear file path once deleted
          } catch (e) {
            console.error("Failed to delete local video file after publish", e);
          }
        }
        savePosts(posts);
      } else if (status === "FAILED") {
        clearInterval(intervalId);
        post.status = "failed";
        post.errorMessage = res.data.data.fail_reason || "TikTok publishing pipeline failed.";
        savePosts(posts);
      } else if (attempts >= maxAttempts) {
        clearInterval(intervalId);
        post.status = "failed";
        post.errorMessage = "Timed out waiting for TikTok to process video.";
        savePosts(posts);
      }
    } catch (err) {
      console.error(`Error polling status for post ${postId}:`, err.message);
      if (attempts >= 10) {
        clearInterval(intervalId);
        post.status = "failed";
        post.errorMessage = `Error polling publish status: ${err.message}`;
        savePosts(posts);
      }
    }
  }, 20000); // Poll every 20 seconds
}

// Periodically run queue processor (every 10 seconds)
setInterval(processQueue, 10000);

// Start Server
app.listen(PORT, () => {
  console.log(`TikTok Scheduler Local Server running at http://localhost:${PORT}`);
  console.log(`Make sure your Redirect URI in the Developer Portal is set to http://localhost:${PORT}/callback`);
});
