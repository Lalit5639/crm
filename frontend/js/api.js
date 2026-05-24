const RENDER_API_BASE_URL = "https://crm-69o4.onrender.com";
const API_STORAGE_KEY = "API_BASE_URL";

function getApiBaseUrl() {
  const params = new URLSearchParams(window.location.search);
  const apiFromUrl = params.get("api");

  if (apiFromUrl) {
    localStorage.setItem(API_STORAGE_KEY, apiFromUrl.replace(/\/$/, ""));
  }

  if (window.location.hostname.endsWith(".onrender.com")) {
    localStorage.removeItem(API_STORAGE_KEY);
    return window.location.origin;
  }

  const savedApiUrl = localStorage.getItem(API_STORAGE_KEY);

  if (savedApiUrl && savedApiUrl !== "https://dharohar-crm.onrender.com") {
    return savedApiUrl.replace(/\/$/, "");
  }

  if (savedApiUrl === "https://dharohar-crm.onrender.com") {
    localStorage.removeItem(API_STORAGE_KEY);
  }

  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    return "http://localhost:5000";
  }

  return RENDER_API_BASE_URL;
}

const API_BASE_URL = getApiBaseUrl();

function apiUrl(path) {
  return `${API_BASE_URL}${path}`;
}

function ensureStatusBanner() {
  let banner = document.getElementById("apiStatus");

  if (!banner) {
    banner = document.createElement("div");
    banner.id = "apiStatus";
    banner.className = "hidden mx-6 mt-4 rounded-lg border px-4 py-3 text-sm";
    document.body.insertBefore(banner, document.body.firstChild);
  }

  return banner;
}

function showApiStatus(message, type = "error") {
  const banner = ensureStatusBanner();
  const styles = {
    error: "block border-red-200 bg-red-50 text-red-700",
    success: "block border-green-200 bg-green-50 text-green-700",
    info: "block border-blue-200 bg-blue-50 text-blue-700",
  };

  banner.className = `${styles[type] || styles.error} mx-6 mt-4 rounded-lg border px-4 py-3 text-sm`;
  banner.textContent = message;
}

function clearApiStatus() {
  const banner = document.getElementById("apiStatus");
  if (banner) {
    banner.className = "hidden mx-6 mt-4 rounded-lg border px-4 py-3 text-sm";
    banner.textContent = "";
  }
}

function buildApiErrorMessage(error) {
  if (error && error.name === "TypeError") {
    return `Backend is not reachable at ${API_BASE_URL}. Open ${API_BASE_URL}/api/status. If it shows 404, Render is not running this backend service.`;
  }

  if (error && error.message) {
    if (error.message.includes("status 404")) {
      return `Backend URL ${API_BASE_URL} is reachable but API routes are missing. Render is likely deployed as a Static Site or from the wrong root.`;
    }

    return error.message;
  }

  return "Something went wrong while talking to the API.";
}

function messageFromTextResponse(text, status) {
  const trimmedText = text.trim();

  if (!trimmedText) {
    return `Request failed with status ${status}`;
  }

  if (/<!doctype html|<html/i.test(trimmedText)) {
    const parser = new DOMParser();
    const document = parser.parseFromString(trimmedText, "text/html");
    const serverMessage = document.querySelector("pre")?.textContent || document.title;

    return serverMessage
      ? `Server error: ${serverMessage}`
      : `Server returned an HTML error page with status ${status}`;
  }

  return trimmedText;
}

async function apiFetch(path, options = {}) {
  try {
    const response = await fetch(apiUrl(path), options);

    let payload = null;
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      payload = await response.json();
    } else {
      const text = await response.text();
      payload = text ? { message: messageFromTextResponse(text, response.status) } : null;
    }

    if (!response.ok) {
      throw new Error(payload?.message || `Request failed with status ${response.status}`);
    }

    clearApiStatus();
    return payload;
  } catch (error) {
    const message = buildApiErrorMessage(error);
    showApiStatus(message, "error");
    throw new Error(message);
  }
}
