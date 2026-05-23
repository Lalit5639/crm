const RENDER_API_BASE_URL = "https://dharohar-crm.onrender.com";

function getApiBaseUrl() {
  const params = new URLSearchParams(window.location.search);
  const apiFromUrl = params.get("api");

  if (apiFromUrl) {
    localStorage.setItem("API_BASE_URL", apiFromUrl.replace(/\/$/, ""));
  }

  const savedApiUrl = localStorage.getItem("API_BASE_URL");

  if (savedApiUrl) {
    return savedApiUrl.replace(/\/$/, "");
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
    return `Backend server is not reachable at ${API_BASE_URL}. Please check Render service and database settings.`;
  }

  if (error && error.message) {
    return error.message;
  }

  return "Something went wrong while talking to the API.";
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
      payload = text ? { message: text } : null;
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
