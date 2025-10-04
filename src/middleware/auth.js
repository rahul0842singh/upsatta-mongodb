module.exports = function requireApiKey(req, res, next) {
  const key = req.header("x-api-key");
  if (!process.env.API_KEY) {
    console.warn("[Auth] No API_KEY set in env — blocking write ops");
    return res.status(500).json({ ok: false, error: "Server not configured for write API" });
  }
  if (!key || key !== process.env.API_KEY) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
  next();
};
