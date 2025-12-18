/**
 * Session Management Module
 * Handles user session lifecycle, cleanup, and heartbeat
 */

// Session management variables
let sessionId = null;
let heartbeatInterval = null;

// ============= SESSION INITIALIZATION =============
export function initializeSessionManagement() {
  // Generate a unique session identifier for this browser tab
  sessionId = Date.now() + "_" + Math.random().toString(36).substr(2, 9);

  // Set up session cleanup on page unload
  window.addEventListener("beforeunload", function () {
    sessionCleanup();
  });

  // Set up session cleanup on page hide (mobile support)
  window.addEventListener("pagehide", function () {
    sessionCleanup();
  });

  // Set up visibility change handler
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") {
      // Page is hidden, start cleanup timer
      setTimeout(function () {
        if (document.visibilityState === "hidden") {
          sessionCleanup();
        }
      }, 300000); // 5 minutes
    }
  });

  // Start heartbeat to keep session active
  startSessionHeartbeat();

  console.log("Session management initialized for session:", sessionId);
}

// ============= RELOAD CLEANUP =============
// No server-side cleanup needed for client-side app

// ============= HEARTBEAT MANAGEMENT =============
function startSessionHeartbeat() {
  // No server-side heartbeat needed for client-side app
  // Just update localStorage timestamp
  heartbeatInterval = setInterval(function () {
    try {
      localStorage.setItem("sessionHeartbeat", Date.now().toString());
    } catch (e) {
      console.log("Heartbeat update failed:", e);
    }
  }, 300000); // 5 minutes
}

function sessionCleanup() {
  try {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
    }

    // Cleanup is handled automatically by browser storage expiration
    // Optionally clear old data here if needed
    console.log("Session cleanup for:", sessionId);
  } catch (error) {
    console.log("Session cleanup failed:", error);
  }
}

// ============= PAGE PROTECTION =============
export function initializePageProtection() {
  // Add warning for page refresh when data is present
  window.addEventListener("beforeunload", function (event) {
    // Don't show warning if validation is in progress or user intentionally
    // navigating
    if (window.isValidationInProgress || window.isIntentionalNavigation) {
      return;
    }

    // Check if there's parsed data or validation data present
    const hasParsedData = window.parsedData !== null;
    const hasValidationData = window.validationData !== null;

    if (hasParsedData || hasValidationData) {
      // Show confirmation dialog
      const message =
        "All data will be erased if you refresh the page. Are you sure you want to continue?";
      event.preventDefault();
      event.returnValue = message; // For older browsers
      return message;
    }
  });
}

// ============= DATA HANDLING =============
export function initializeDataHandling() {
  // Initialize data availability for other functions
  initializeGlobalDataAccess();
}

export function initializeGlobalDataAccess() {
  // These will be set by the template when data is available
  window.validationData = window.validationData || null;
  window.parsedData = window.parsedData || null;
}

// ============= URL PARAMETER CLEANUP =============
export function cleanUpURLParameter() {
  // Clean up URL parameter after validation completion or upload completion
  const urlParams = new URLSearchParams(window.location.search);
  const hasValidationComplete = urlParams.get("validation_complete");
  const hasUploadComplete = urlParams.get("upload_complete");
  if (hasValidationComplete || hasUploadComplete) {
    // Reset all flags since navigation is now complete
    window.isValidationInProgress = false;
    window.isIntentionalNavigation = false;

    // Remove the parameter(s) from URL without triggering a page reload
    const newUrl = window.location.pathname;
    window.history.replaceState({}, document.title, newUrl);
  }
}
