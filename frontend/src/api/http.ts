import axios from "axios";

const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || "",
  timeout: 300000,
});

http.interceptors.request.use((config) => {
  try {
    const raw = localStorage.getItem("auth-storage");
    if (raw) {
      const parsed = JSON.parse(raw) as { state?: { token?: string } };
      const t = parsed?.state?.token;
      if (t) config.headers.Authorization = `Bearer ${t}`;
    }
  } catch { /* ignore */ }
  return config;
});

http.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("auth-storage");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export default http;
