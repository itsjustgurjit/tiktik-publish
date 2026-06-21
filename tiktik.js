import axios from "axios";

async function refreshToken() {
  const res = await axios.post(
    "https://open.tiktokapis.com/v2/oauth/token/",
    {
      client_key: process.env.TIKTOK_CLIENT_KEY,
      client_secret: process.env.TIKTOK_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: process.env.TIKTOK_REFRESH_TOKEN
    }
  );

  return res.data.access_token;
}

