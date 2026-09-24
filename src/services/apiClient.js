import axios from "axios";

// Helper to sanitize and normalize the configured API Base URL
const sanitizeBaseUrl = () => {
  const envUrl =
    import.meta.env.VITE_API_URL ||
    import.meta.env.VITE_API_BASE_URL ||
    "http://127.0.0.1:8000";

  let sanitized = String(envUrl).trim().replace(/\/+$/, "");

  // If the user included /api at the end, strip it because service calls already prefix /api/
  if (sanitized.endsWith("/api")) {
    sanitized = sanitized.slice(0, -4).replace(/\/+$/, "");
  }

  return sanitized;
};

export const API_BASE_URL = sanitizeBaseUrl();

// 60-second timeout to allow Render free tier Web Services to wake up from cold sleep (~50s)
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Attach Auth Token to every request if available
apiClient.interceptors.request.use(
  (config) => {
    try {
      const stored = localStorage.getItem("sms_auth_user");
      if (stored) {
        const user = JSON.parse(stored);
        if (user && user.token) {
          config.headers.Authorization = `Token ${user.token}`;
        }
      }
    } catch {
      // ignore
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Diagnostic helper to ping backend status and health
export const pingBackend = async () => {
  try {
    const res = await apiClient.get("/api/health/", { timeout: 35000 });
    return { ok: true, data: res.data };
  } catch (err) {
    // Fallback to root or schema if health check hasn't been deployed yet
    try {
      const res = await apiClient.get("/", { timeout: 35000 });
      return { ok: true, data: res.data };
    } catch (innerErr) {
      return {
        ok: false,
        error: innerErr.message || "Failed to reach backend",
        code: innerErr.code,
      };
    }
  }
};

export default apiClient;
