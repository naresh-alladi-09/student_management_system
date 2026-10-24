import axios from "axios";

// Helper to sanitize and normalize the configured API Base URL
const sanitizeBaseUrl = () => {
  const envUrl =
    import.meta.env.VITE_API_BASE_URL ||
    import.meta.env.VITE_API_URL ||
    (import.meta.env.DEV ? "http://127.0.0.1:8000" : "");

  if (import.meta.env.PROD && !envUrl) {
    console.error(
      "[Security & Configuration Error] Production build missing VITE_API_BASE_URL. " +
      "Please set VITE_API_BASE_URL to your deployed Django backend URL in your hosting provider's environment variables."
    );
  }

  let sanitized = String(envUrl || "").trim().replace(/\/+$/, "");

  // If the user included /api at the end, strip it because service calls already prefix /api/
  if (sanitized.endsWith("/api")) {
    sanitized = sanitized.slice(0, -4).replace(/\/+$/, "");
  }

  return sanitized;
};

export const API_BASE_URL = sanitizeBaseUrl();

// 60-second timeout to allow Render / cloud free tier Web Services to wake up from cold sleep (~50s)
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Attach Auth Token to every request if available, EXCEPT for login / public endpoints
apiClient.interceptors.request.use(
  (config) => {
    if (import.meta.env.PROD && !API_BASE_URL) {
      return Promise.reject(
        new Error(
          "Production configuration error: VITE_API_BASE_URL environment variable is missing. " +
          "Configure VITE_API_BASE_URL in your deployment platform to point to your backend API."
        )
      );
    }

    const url = config.url || "";
    // Never send an old/stale token on login or health endpoints
    if (url.includes("/auth/login") || url.includes("/health")) {
      if (config.headers && config.headers.Authorization) {
        delete config.headers.Authorization;
      }
      return config;
    }

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

// Response interceptor: automatically wipe invalid/stale tokens on 401
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      const detail = String(error.response.data?.detail || "").toLowerCase();
      if (detail.includes("invalid token") || detail.includes("token")) {
        try {
          localStorage.removeItem("sms_auth_user");
        } catch {
          // ignore
        }
      }
    }
    return Promise.reject(error);
  }
);


// Diagnostic helper to ping backend status and health
export const pingBackend = async () => {
  try {
    const res = await apiClient.get("/api/health/", { timeout: 35000 });
    return { ok: true, data: res.data };
  } catch {
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
