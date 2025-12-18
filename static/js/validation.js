/**
 * Validation Module
 * Handles compliance validation, version selection, and progress tracking
 */

import {
  hideMessage,
  hideValidationLoader,
  showMessage,
  showValidationLoader,
  simulateProgress,
  updateProgress,
} from "./utils.js";
import { validateDeviceConformance } from "./pyodide-bridge.js";
import { renderValidationResults } from "./results-renderer.js";

// ============= VALIDATION INITIALIZATION =============
export function initializeValidationFunctionality() {
  initializeValidateButton();
  restoreSelectedVersion();
}

function initializeValidateButton() {
  const validateBtn = document.getElementById("validateBtn");
  const versionSelect = document.getElementById("complianceVersion");

  if (validateBtn && versionSelect) {
    validateBtn.addEventListener("click", async function () {
      const selectedVersion = versionSelect.value;

      // Validate version selection
      if (!selectedVersion) {
        showMessage(
          "validateMessage",
          "Please select a data model version to validate against",
          "error",
        );
        return;
      }

      // Get parsed data from storage
      const parsedDataStr = localStorage.getItem("currentParsedData");
      if (!parsedDataStr) {
        showMessage(
          "validateMessage",
          "No parsed data found. Please upload a file first.",
          "error",
        );
        return;
      }

      // Store the selected version
      sessionStorage.setItem("selectedVersion", selectedVersion);
      const parseId = localStorage.getItem("currentParseId");
      if (parseId) {
        localStorage.setItem(`selectedComplianceVersion:${parseId}`, selectedVersion);
      }

      // Set flags to prevent refresh warning during validation
      window.isValidationInProgress = true;
      window.isIntentionalNavigation = true;

      // Show validation loader
      showValidationLoader();
      hideMessage("validateMessage");

      // Simulate progress updates
      simulateProgress();

      try {
        const parsedData = JSON.parse(parsedDataStr);
        
        // Validate using Pyodide
        updateProgress(50, "Validating device conformance...");
        const validationResults = await validateDeviceConformance(parsedData, selectedVersion);

        // Store validation results
        localStorage.setItem("currentValidationData", JSON.stringify(validationResults));

        updateProgress(100, "Validation complete!");
        
        setTimeout(() => {
          hideValidationLoader();
          window.isValidationInProgress = false;
          window.isIntentionalNavigation = false;
          
          // Render results
          renderValidationResults(validationResults, parsedData);
        }, 1000);
      } catch (error) {
        // Reset flags on error
        window.isValidationInProgress = false;
        window.isIntentionalNavigation = false;
        hideValidationLoader();
        showMessage("validateMessage", `Validation failed: ${error.message}`, "error");
      }
    });
  }
}

// ============= VERSION SELECTION MANAGEMENT =============
function restoreSelectedVersion() {
  try {
    const versionSelect = document.getElementById("complianceVersion");
    const validateBtn = document.getElementById("validateBtn");

    if (!versionSelect) {
      console.debug("Version select element not found");
      return;
    }

    // Prefer per-parse persistence if parseId is available
    const parseId = versionSelect.dataset
      ? versionSelect.dataset.parseId
      : null;
    const detectedVersion = versionSelect.dataset
      ? versionSelect.dataset.detectedVersion
      : null;

    if (parseId) {
      const storageKey = `selectedComplianceVersion:${parseId}`;

      // Apply saved selection or fallback to detected version
      try {
        const saved = localStorage.getItem(storageKey);
        if (
          saved &&
          versionSelect.querySelector(`option[value="${CSS.escape(saved)}"]`)
        ) {
          versionSelect.value = saved;
        } else if (
          detectedVersion &&
          versionSelect.querySelector(
            `option[value="${CSS.escape(detectedVersion)}"]`,
          )
        ) {
          versionSelect.value = detectedVersion;
        }
      } catch (e) {
        console.warn("Failed to access localStorage:", e);
      }

      // Persist on change
      versionSelect.addEventListener("change", function () {
        try {
          localStorage.setItem(storageKey, versionSelect.value || "");
        } catch (e) {
          console.warn("Failed to save selection:", e);
        }
      });

      // Persist also on validate
      if (validateBtn) {
        validateBtn.addEventListener("click", function () {
          try {
            localStorage.setItem(storageKey, versionSelect.value || "");
          } catch (e) {
            console.warn("Failed to save selection on validate:", e);
          }
        });
      }

      return; // Done with per-parse logic
    }

    // Fallback to legacy sessionStorage-based behavior
    let storedVersion;
    try {
      storedVersion = sessionStorage.getItem("selectedVersion");
    } catch (e) {
      console.warn("Failed to access sessionStorage:", e);
      return;
    }

    if (storedVersion) {
      try {
        // Check if there's an auto-detected version option that's already
        // selected
        const autoDetectedOption =
          versionSelect.querySelector("option[selected]");

        // If there's an auto-detected version and this is a fresh load (no
        // validation in progress), prioritize the auto-detected version and
        // clear stored version
        if (autoDetectedOption && !window.isValidationInProgress) {
          try {
            sessionStorage.removeItem("selectedVersion");
          } catch (e) {
            console.warn("Failed to remove stored version:", e);
          }
          return;
        }

        // Otherwise, restore the stored version for re-validation scenarios
        versionSelect.value = storedVersion;

        const selectedOption = versionSelect.querySelector(
          `option[value="${CSS.escape(storedVersion)}"]`,
        );
        if (selectedOption) {
          const optionIndex = Array.from(versionSelect.options).indexOf(
            selectedOption,
          );
          if (optionIndex >= 0) {
            versionSelect.selectedIndex = optionIndex;
          }
        }
      } catch (e) {
        console.warn("Error processing stored version:", e);
      }
    }
  } catch (e) {
    console.error("Error in restoreSelectedVersion:", e);
  }
}
