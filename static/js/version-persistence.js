/**
 * Version Persistence Module
 * Handles version selection persistence across page reloads and file uploads
 */

// ============= VERSION PERSISTENCE =============
export function initializeVersionPersistence(parseId, detectedVersion) {
  const selectEl = document.getElementById("complianceVersion");
  const validateBtn = document.getElementById("validateBtn");

  if (!selectEl) return;

  const storageKey = parseId ? `selectedComplianceVersion:${parseId}` : null;

  // If we have a parseId, prefer per-parse selection; otherwise, fall back to
  // detected
  if (storageKey) {
    try {
      const saved = localStorage.getItem(storageKey);
      if (
        saved &&
        selectEl.querySelector(`option[value="${CSS.escape(saved)}"]`)
      ) {
        selectEl.value = saved;
      } else if (
        detectedVersion &&
        selectEl.querySelector(`option[value="${CSS.escape(detectedVersion)}"]`)
      ) {
        selectEl.value = detectedVersion;
      }
    } catch (e) {
      console.warn("Failed to access localStorage:", e);
    }

    // Persist the selection scoped to this parseId
    selectEl.addEventListener("change", function () {
      try {
        localStorage.setItem(storageKey, selectEl.value || "");
      } catch (e) {
        console.warn("Failed to save selection:", e);
      }
    });

    // Also store on validate click (in case the user did not trigger change
    // event)
    if (validateBtn) {
      validateBtn.addEventListener("click", function () {
        try {
          localStorage.setItem(storageKey, selectEl.value || "");
        } catch (e) {
          console.warn("Failed to save selection on validate:", e);
        }
      });
    }
  } else if (
    detectedVersion &&
    selectEl.querySelector(`option[value="${CSS.escape(detectedVersion)}"]`)
  ) {
    selectEl.value = detectedVersion;
  }
}

// ============= TEMPLATE INTEGRATION =============
export function createVersionPersistenceScript(parseId, detectedVersion) {
  return `
    import { initializeVersionPersistence } from './static/js/version-persistence.js';

    document.addEventListener('DOMContentLoaded', function() {
      initializeVersionPersistence(${JSON.stringify(parseId)}, ${JSON.stringify(
        detectedVersion,
      )});
    });
  `;
}
