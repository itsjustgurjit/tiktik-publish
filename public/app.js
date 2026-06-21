// ----------------------------------------------------
// STATE & CONFIGURATION
// ----------------------------------------------------
let activeTab = "dashboard";
let selectedVideoFile = null;
let currentConfig = null;

// DOM Elements
const sidebarNavItems = document.querySelectorAll(".nav-item");
const tabContents = document.querySelectorAll(".tab-content");
const pageTitleText = document.getElementById("pageTitleText");
const pageSubtitleText = document.getElementById("pageSubtitleText");
const toast = document.getElementById("toast");
const toastIcon = document.getElementById("toastIcon");
const toastMessage = document.getElementById("toastMessage");

// Stats elements
const statScheduled = document.getElementById("statScheduled");
const statPublished = document.getElementById("statPublished");
const statProcessing = document.getElementById("statProcessing");
const statFailed = document.getElementById("statFailed");

// Queue elements
const queueList = document.getElementById("queueList");
const btnRefreshQueue = document.getElementById("btnRefreshQueue");

// Account status elements
const accountWidget = document.getElementById("accountWidget");
const widgetAvatar = document.getElementById("widgetAvatar");
const widgetName = document.getElementById("widgetName");
const widgetConnected = accountWidget.querySelector(".widget-connected");
const widgetUnconnected = accountWidget.querySelector(".widget-unconnected");
const headerConnectionPill = document.getElementById("headerConnectionPill");

// Creator Panel elements
const creatorPanel = document.getElementById("creatorPanel");
const profileUnconnected = document.getElementById("profileUnconnected");
const profileConnected = document.getElementById("profileConnected");
const creatorAvatar = document.getElementById("creatorAvatar");
const creatorNickname = document.getElementById("creatorNickname");
const creatorUsername = document.getElementById("creatorUsername");
const creatorMaxDuration = document.getElementById("creatorMaxDuration");
const creatorPrivacyLevels = document.getElementById("creatorPrivacyLevels");
const creatorCommentsDefault = document.getElementById("creatorCommentsDefault");
const btnGoToSettings = document.getElementById("btnGoToSettings");
const btnDisconnectAccount = document.getElementById("btnDisconnectAccount");

// Drag and drop elements
const dropzone = document.getElementById("dropzone");
const videoFileInput = document.getElementById("videoFileInput");
const dropzonePrompt = dropzone.querySelector(".dropzone-prompt");
const dropzoneFile = document.getElementById("dropzoneFile");
const selectedFileName = document.getElementById("selectedFileName");
const selectedFileSize = document.getElementById("selectedFileSize");
const btnClearFile = document.getElementById("btnClearFile");

// Caption elements
const postCaption = document.getElementById("postCaption");
const charCount = document.getElementById("charCount");

// Settings Form elements
const settingsForm = document.getElementById("settingsForm");
const clientKeyInput = document.getElementById("clientKey");
const clientSecretInput = document.getElementById("clientSecret");
const redirectUriInput = document.getElementById("redirectUri");
const btnSaveConfig = document.getElementById("btnSaveConfig");
const connectionSettingsPanel = document.getElementById("connectionSettingsPanel");
const btnConnectTikTok = document.getElementById("btnConnectTikTok");
const authSuccessIcon = document.getElementById("authSuccessIcon");
const authFailIcon = document.getElementById("authFailIcon");
const authStatusTitle = document.getElementById("authStatusTitle");
const authStatusDesc = document.getElementById("authStatusDesc");

// Schedule Form elements
const scheduleForm = document.getElementById("scheduleForm");
const postPrivacy = document.getElementById("postPrivacy");
const postScheduledTime = document.getElementById("postScheduledTime");
const btnSubmitPost = document.getElementById("btnSubmitPost");

// ----------------------------------------------------
// TOAST NOTIFICATIONS
// ----------------------------------------------------
function showToast(message, type = "info") {
  toastMessage.textContent = message;
  toast.className = "toast"; // Reset
  
  if (type === "error") {
    toast.classList.add("error");
    toastIcon.setAttribute("data-lucide", "alert-triangle");
  } else {
    toastIcon.setAttribute("data-lucide", "info");
  }
  
  lucide.createIcons();
  toast.classList.remove("hidden");
  
  setTimeout(() => {
    toast.classList.add("hidden");
  }, 4000);
}

// ----------------------------------------------------
// NAVIGATION SETUP
// ----------------------------------------------------
const tabMetadata = {
  dashboard: {
    title: "Dashboard",
    subtitle: "Overview of your TikTok posts and schedule status."
  },
  schedule: {
    title: "Schedule Video Post",
    subtitle: "Upload and schedule a video for release on TikTok."
  },
  settings: {
    title: "Developer Configuration",
    subtitle: "Manage your TikTok Developer API credentials and authorizations."
  }
};

function switchTab(tabId) {
  activeTab = tabId;
  
  // Update sidebar links
  sidebarNavItems.forEach(item => {
    if (item.getAttribute("data-tab") === tabId) {
      item.classList.add("active");
    } else {
      item.classList.remove("active");
    }
  });

  // Update tab content displays
  tabContents.forEach(content => {
    if (content.id === `tab-${tabId}`) {
      content.classList.add("active");
    } else {
      content.classList.remove("active");
    }
  });

  // Update Header text
  const meta = tabMetadata[tabId];
  if (meta) {
    pageTitleText.textContent = meta.title;
    pageSubtitleText.textContent = meta.subtitle;
  }

  // Fetch updates when opening specific tabs
  if (tabId === "dashboard") {
    fetchPosts();
  }
}

sidebarNavItems.forEach(item => {
  item.addEventListener("click", (e) => {
    e.preventDefault();
    const tabId = item.getAttribute("data-tab");
    switchTab(tabId);
  });
});

btnGoToSettings.addEventListener("click", () => switchTab("settings"));

// ----------------------------------------------------
// API REQUESTS & DATA SYNC
// ----------------------------------------------------

// Load configuration
async function fetchConfig() {
  try {
    const res = await fetch("/api/config");
    const data = await res.json();
    currentConfig = data;

    // Fill settings inputs
    clientKeyInput.value = data.clientKey || "";
    redirectUriInput.value = data.redirectUri || "http://localhost:3000/callback";
    if (data.hasClientSecret) {
      clientSecretInput.placeholder = "•••••••••••••••••••••••••••••••• (Saved)";
      clientSecretInput.removeAttribute("required");
    } else {
      clientSecretInput.placeholder = "Enter your Client Secret";
      clientSecretInput.setAttribute("required", "true");
    }

    updateConnectionUI(data);
  } catch (err) {
    console.error("Failed to load config:", err);
    showToast("Error retrieving configuration state.", "error");
  }
}

// Update connection views
function updateConnectionUI(config) {
  // Update header pill
  const pulseDot = headerConnectionPill.querySelector(".pulse-dot");
  const pillSpan = headerConnectionPill.querySelector("span");

  if (config.isConnected) {
    // Header Connection Pill
    pulseDot.className = "pulse-dot green";
    pillSpan.textContent = "Connected";

    // Sidebar Account Widget
    widgetUnconnected.classList.add("hidden");
    widgetConnected.classList.remove("hidden");
    
    const avatarUrl = config.creatorInfo?.creator_avatar_url || "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&w=80&h=80&q=80";
    const nick = config.creatorInfo?.creator_nickname || "TikTok Creator";
    widgetAvatar.src = avatarUrl;
    widgetName.textContent = nick;

    // Creator profile card
    profileUnconnected.classList.add("hidden");
    profileConnected.classList.remove("hidden");
    creatorAvatar.src = avatarUrl;
    creatorNickname.textContent = nick;
    creatorUsername.textContent = `@${config.creatorInfo?.creator_username || "username"}`;
    
    // Limits
    const duration = config.creatorInfo?.max_video_post_duration_sec;
    creatorMaxDuration.textContent = duration ? `${duration} seconds (${Math.round(duration / 60)} min)` : "Not Specified";
    
    const levels = config.creatorInfo?.privacy_level_options || [];
    creatorPrivacyLevels.textContent = levels.length ? levels.join(", ") : "All Levels";
    
    const comments = config.creatorInfo?.comment_disabled;
    creatorCommentsDefault.textContent = comments ? "Yes" : "No";

    // Settings page authentication widget
    connectionSettingsPanel.classList.remove("hidden");
    authSuccessIcon.classList.remove("hidden");
    authFailIcon.classList.add("hidden");
    authStatusTitle.textContent = "Connected";
    authStatusDesc = `Logged in as @${config.creatorInfo?.creator_username || "creator"}.`;
    btnConnectTikTok.innerHTML = '<i data-lucide="refresh-cw"></i><span>Reconnect Account</span>';
    
    // Dynamic privacy select input populations
    if (levels.length > 0) {
      postPrivacy.innerHTML = "";
      levels.forEach(lvl => {
        const option = document.createElement("option");
        option.value = lvl;
        let label = lvl.replace(/_/g, " ");
        // Make it pretty
        if (lvl === "PUBLIC_TO_EVERYONE") label = "Public (Everyone)";
        if (lvl === "MUTUAL_FOLLOW_FRIENDS") label = "Friends (Mutual Followers)";
        if (lvl === "SELF_ONLY") label = "Private (Only Me)";
        option.textContent = label;
        if (lvl === "PUBLIC_TO_EVERYONE") option.selected = true;
        postPrivacy.appendChild(option);
      });
    }

  } else {
    // Header Connection Pill
    pulseDot.className = "pulse-dot red";
    pillSpan.textContent = "Not Connected";

    // Sidebar Account Widget
    widgetConnected.classList.add("hidden");
    widgetUnconnected.classList.remove("hidden");

    // Creator profile card
    profileConnected.classList.add("hidden");
    profileUnconnected.classList.remove("hidden");

    // Settings page connection widget
    if (config.clientKey && config.hasClientSecret) {
      connectionSettingsPanel.classList.remove("hidden");
      authSuccessIcon.classList.add("hidden");
      authFailIcon.classList.remove("hidden");
      authStatusTitle.textContent = "Not Authorized";
      authStatusDesc.textContent = "API Keys saved. You need to connect your TikTok account.";
      btnConnectTikTok.innerHTML = '<i data-lucide="link"></i><span>Connect TikTok Account</span>';
    } else {
      connectionSettingsPanel.classList.add("hidden");
    }
  }
  lucide.createIcons();
}

// Fetch posts list
async function fetchPosts() {
  try {
    const res = await fetch("/api/posts");
    const posts = await res.json();
    renderQueue(posts);
  } catch (err) {
    console.error("Failed to load posts:", err);
    showToast("Error retrieving scheduled queue.", "error");
  }
}

// Render queue items
function renderQueue(posts) {
  // Update stats counts
  let scheduled = 0;
  let published = 0;
  let processing = 0;
  let failed = 0;

  posts.forEach(p => {
    if (p.status === "scheduled" || p.status === "pending_upload") scheduled++;
    else if (p.status === "published") published++;
    else if (p.status === "uploading" || p.status === "processing") processing++;
    else if (p.status === "failed") failed++;
  });

  statScheduled.textContent = scheduled;
  statPublished.textContent = published;
  statProcessing.textContent = processing;
  statFailed.textContent = failed;

  if (posts.length === 0) {
    queueList.innerHTML = `
      <div class="empty-state">
        <i data-lucide="inbox"></i>
        <p>No posts in queue. Click "Schedule Post" to queue your first video.</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  queueList.innerHTML = "";
  posts.forEach(post => {
    const card = document.createElement("div");
    card.className = "queue-card";

    // Format release time
    const schedDate = new Date(post.scheduledTime);
    const dateStr = schedDate.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const timeStr = schedDate.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    const privacyText = post.privacyLevel.replace(/_/g, " ");

    // Setup visual status representation
    let statusClass = "status-scheduled";
    let statusLabel = "Scheduled";
    let isProcessingState = false;

    if (post.status === "pending_upload") {
      statusClass = "status-scheduled";
      statusLabel = "Pending...";
    } else if (post.status === "uploading") {
      statusClass = "status-uploading";
      statusLabel = "Uploading";
      isProcessingState = true;
    } else if (post.status === "processing") {
      statusClass = "status-processing";
      statusLabel = "Processing";
      isProcessingState = true;
    } else if (post.status === "published") {
      statusClass = "status-published";
      statusLabel = "Published";
    } else if (post.status === "failed") {
      statusClass = "status-failed";
      statusLabel = "Failed";
    }

    card.innerHTML = `
      <div class="card-icon-wrapper">
        <i data-lucide="video"></i>
      </div>
      <div class="card-details">
        <h4 class="card-title">${escapeHTML(post.title)}</h4>
        <div class="card-meta">
          <span><i data-lucide="clock"></i> ${dateStr} at ${timeStr}</span>
          <span><i data-lucide="lock"></i> ${privacyText}</span>
          <span class="status-badge ${statusClass}">${statusLabel}</span>
        </div>
        ${isProcessingState ? `
          <div class="progress-container">
            <div class="progress-bar animated"></div>
          </div>
        ` : ""}
        ${post.status === "failed" && post.errorMessage ? `
          <div class="error-message">
            <i data-lucide="alert-circle"></i>
            <span>${escapeHTML(post.errorMessage)}</span>
          </div>
        ` : ""}
      </div>
      <div class="card-actions">
        <button class="btn btn-secondary btn-icon-only btn-delete-post" data-id="${post.id}" title="Remove Post">
          <i data-lucide="trash-2"></i>
        </button>
      </div>
    `;

    queueList.appendChild(card);
  });

  // Attach delete events
  document.querySelectorAll(".btn-delete-post").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-id");
      if (confirm("Are you sure you want to remove this post? Any uploaded local files will be deleted.")) {
        await deletePost(id);
      }
    });
  });

  lucide.createIcons();
}

// Delete post
async function deletePost(id) {
  try {
    const res = await fetch(`/api/posts/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.success) {
      showToast("Post removed from queue.");
      fetchPosts();
    } else {
      showToast(data.error || "Failed to delete post", "error");
    }
  } catch (err) {
    console.error("Delete failed:", err);
    showToast("Network error deleting post", "error");
  }
}

// ----------------------------------------------------
// SETTINGS CONFIG FORM SUBMISSION
// ----------------------------------------------------
settingsForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  
  const clientKey = clientKeyInput.value.trim();
  const clientSecret = clientSecretInput.value.trim();
  const redirectUri = redirectUriInput.value.trim();

  try {
    const res = await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientKey, clientSecret, redirectUri })
    });

    const data = await res.json();
    if (data.success) {
      showToast("Configuration saved successfully.");
      clientSecretInput.value = ""; // Clear password field
      fetchConfig();
    } else {
      showToast(data.error || "Failed to save settings.", "error");
    }
  } catch (err) {
    console.error("Failed to save config:", err);
    showToast("Network error saving config.", "error");
  }
});

// Connect TikTok (Redirect)
btnConnectTikTok.addEventListener("click", () => {
  window.location.href = "/api/auth";
});

// Disconnect TikTok
btnDisconnectAccount.addEventListener("click", async () => {
  if (confirm("Are you sure you want to disconnect your TikTok account? This will clear active publishing tokens.")) {
    try {
      const res = await fetch("/api/disconnect", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        showToast("TikTok Account disconnected.");
        fetchConfig();
      }
    } catch (err) {
      console.error(err);
      showToast("Error disconnecting account.", "error");
    }
  }
});

// ----------------------------------------------------
// FILE UPLOAD AND DRAG-DROP
// ----------------------------------------------------
dropzone.addEventListener("click", () => {
  videoFileInput.click();
});

videoFileInput.addEventListener("change", (e) => {
  handleFileSelection(e.target.files[0]);
});

dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.classList.add("dragover");
});

dropzone.addEventListener("dragleave", () => {
  dropzone.classList.remove("dragover");
});

dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragover");
  if (e.dataTransfer.files.length > 0) {
    handleFileSelection(e.dataTransfer.files[0]);
  }
});

function handleFileSelection(file) {
  if (!file) return;

  if (file.type !== "video/mp4" && !file.name.endsWith(".mp4")) {
    showToast("Only MP4 video formats are supported.", "error");
    return;
  }

  // 500MB limit check
  if (file.size > 500 * 1024 * 1024) {
    showToast("File exceeds the 500MB upload limit.", "error");
    return;
  }

  selectedVideoFile = file;

  // Render file details in UI
  selectedFileName.textContent = file.name;
  selectedFileSize.textContent = formatBytes(file.size);

  dropzonePrompt.classList.add("hidden");
  dropzoneFile.classList.remove("hidden");
}

btnClearFile.addEventListener("click", (e) => {
  e.stopPropagation(); // Avoid triggering file chooser again
  selectedVideoFile = null;
  videoFileInput.value = "";
  dropzoneFile.classList.add("hidden");
  dropzonePrompt.classList.remove("hidden");
});

// ----------------------------------------------------
// CAPTION & FORM HELPERS
// ----------------------------------------------------
postCaption.addEventListener("input", (e) => {
  charCount.textContent = e.target.value.length;
});

window.addHashtag = function(tag) {
  const currentText = postCaption.value;
  const divider = currentText.length > 0 && !currentText.endsWith(" ") ? " " : "";
  postCaption.value = currentText + divider + tag + " ";
  postCaption.dispatchEvent(new Event("input"));
  postCaption.focus();
};

window.setQuickTime = function(minutesToAdd) {
  const now = new Date();
  now.setMinutes(now.getMinutes() + minutesToAdd);
  
  // Format for datetime-local (YYYY-MM-DDTHH:MM)
  const offset = now.getTimezoneOffset();
  const adjustedDate = new Date(now.getTime() - offset * 60 * 1000);
  const formatted = adjustedDate.toISOString().slice(0, 16);
  postScheduledTime.value = formatted;
};

// ----------------------------------------------------
// SCHEDULE FORM SUBMIT
// ----------------------------------------------------
scheduleForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!currentConfig || !currentConfig.isConnected) {
    showToast("Please link your TikTok Account in settings first.", "error");
    switchTab("settings");
    return;
  }

  if (!selectedVideoFile) {
    showToast("Please select a video file to publish.", "error");
    return;
  }

  const title = postCaption.value.trim();
  const privacy = postPrivacy.value;
  const time = postScheduledTime.value;

  if (!title) {
    showToast("Caption/description is required.", "error");
    return;
  }

  if (!time) {
    showToast("Scheduled release time is required.", "error");
    return;
  }

  const scheduledDate = new Date(time);
  if (scheduledDate <= new Date()) {
    showToast("Please select a release time in the future.", "error");
    return;
  }

  // Create form payload
  const formData = new FormData();
  formData.append("video", selectedVideoFile);
  formData.append("title", title);
  formData.append("privacyLevel", privacy);
  formData.append("scheduledTime", scheduledDate.toISOString());

  // Disable button and show upload state
  btnSubmitPost.disabled = true;
  btnSubmitPost.innerHTML = '<i data-lucide="loader" class="animated-spin"></i><span>Uploading to local server...</span>';
  lucide.createIcons();

  try {
    const res = await fetch("/api/schedule", {
      method: "POST",
      body: formData
    });

    const data = await res.json();
    if (data.success) {
      showToast("Post scheduled successfully!");
      // Reset form
      scheduleForm.reset();
      selectedVideoFile = null;
      videoFileInput.value = "";
      dropzoneFile.classList.add("hidden");
      dropzonePrompt.classList.remove("hidden");
      charCount.textContent = "0";

      // Redirect to dashboard
      switchTab("dashboard");
    } else {
      showToast(data.error || "Failed to schedule post.", "error");
    }
  } catch (err) {
    console.error("Submit failed:", err);
    showToast("Error uploading video to scheduler.", "error");
  } finally {
    btnSubmitPost.disabled = false;
    btnSubmitPost.innerHTML = '<i data-lucide="calendar"></i><span>Schedule Post</span>';
    lucide.createIcons();
  }
});

// Helper: Format bytes
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

// Helper: Escape HTML
function escapeHTML(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ----------------------------------------------------
// INITIALIZATION
// ----------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  // Check URL params for callback indicators
  const urlParams = new URLSearchParams(window.location.search);
  const authStatus = urlParams.get("auth");
  const authError = urlParams.get("error");

  if (authStatus === "success") {
    showToast("TikTok Account authorized successfully!");
  } else if (authStatus === "failed") {
    showToast(`OAuth Failed: ${authError || "Authorization canceled"}`, "error");
  }

  // Clear query parameters from URL
  if (authStatus) {
    const cleanUrl = window.location.pathname;
    window.history.replaceState({}, document.title, cleanUrl);
  }

  // Set default scheduled time to 1 hour in future
  setQuickTime(60);

  // Initialize Lucide icons
  lucide.createIcons();

  // Load config & posts
  fetchConfig();
  fetchPosts();

  // Refresh queue every 15 seconds automatically
  setInterval(fetchPosts, 15000);
  
  // Wire manual refresh button
  btnRefreshQueue.addEventListener("click", () => {
    btnRefreshQueue.classList.add("animated-spin");
    fetchPosts().finally(() => {
      setTimeout(() => btnRefreshQueue.classList.remove("animated-spin"), 500);
    });
  });
});
