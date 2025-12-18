/**
 * File Upload Module
 * Handles file uploads, drag-and-drop, and form submission
 */

import { formatFileSize, showError, showLoading, hideLoading } from "./utils.js";
import { parseDatamodelLogs, detectSpecVersion, getSupportedVersions } from "./pyodide-bridge.js";

// ============= FILE UPLOAD INITIALIZATION =============
export function initializeFileUpload() {
  const uploadArea = document.getElementById("uploadArea");
  const fileInput = document.getElementById("fileInput");
  const uploadBtn = document.getElementById("uploadBtn");

  if (uploadBtn) {
    uploadBtn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (!window.isProcessing) {
        fileInput.click();
      }
    });
  }

  if (uploadArea) {
    uploadArea.addEventListener("click", function (e) {
      // Don't handle clicks on the button or file input
      if (
        e.target === uploadBtn ||
        e.target === fileInput ||
        uploadBtn.contains(e.target)
      ) {
        return;
      }

      if (!window.isProcessing) {
        fileInput.click();
      }
    });
  }

  if (fileInput) {
    fileInput.addEventListener("change", function (e) {
      if (window.isProcessing) {
        return;
      }

      const file = e.target.files[0];
      if (file) {
        window.isProcessing = true;
        handleFileSelection(file);
      }
    });
  }
}

// ============= DRAG AND DROP =============
export function initializeDragAndDrop() {
  const uploadArea = document.getElementById("uploadArea");

  if (!uploadArea) return;

  ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
    uploadArea.addEventListener(eventName, preventDefaults, false);
  });

  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  ["dragenter", "dragover"].forEach((eventName) => {
    uploadArea.addEventListener(eventName, highlight, false);
  });

  ["dragleave", "drop"].forEach((eventName) => {
    uploadArea.addEventListener(eventName, unhighlight, false);
  });

  function highlight(e) {
    uploadArea.classList.add("dragover");
  }

  function unhighlight(e) {
    uploadArea.classList.remove("dragover");
  }

  uploadArea.addEventListener("drop", handleDrop, false);

  function handleDrop(e) {
    if (window.isProcessing) return;

    const dt = e.dataTransfer;
    const files = dt.files;

    if (files.length > 0) {
      const file = files[0];
      // Set the file to the file input
      const fileInput = document.getElementById("fileInput");
      if (fileInput) {
        // Create a new FileList object
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        fileInput.files = dataTransfer.files;
      }
      window.isProcessing = true;
      handleFileSelection(file);
    }
  }
}

// ============= FILE HANDLING =============
export function handleFileSelection(file) {
  const uploadText = document.querySelector(".upload-text");
  const uploadSubtext = document.querySelector(".upload-subtext");

  if (file.type === "text/plain" || file.name.endsWith(".txt")) {
    if (uploadText) {
      uploadText.textContent = `Selected: ${file.name}`;
      uploadText.style.color = "var(--success-color)";
    }
    if (uploadSubtext) {
      uploadSubtext.textContent = `File size: ${formatFileSize(file.size)} | Ready to process`;
      uploadSubtext.style.color = "var(--success-color)";
    }

    // Small delay to ensure file input is properly set, then submit
    setTimeout(() => {
      submitFileForm();
    }, 100);
  } else {
    showError("Please select a .txt file");
    resetUploadArea();
  }
}

export async function submitFileForm() {
  const fileInput = document.getElementById("fileInput");

  if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
    console.error("File input not found or no file selected");
    showError("File input not found or no file selected");
    resetUploadArea();
    return;
  }

  const file = fileInput.files[0];
  console.log("Processing file:", file.name, "Size:", file.size);

  // Clear any stored version selection when uploading a new file
  sessionStorage.removeItem("selectedVersion");
  localStorage.removeItem("currentParsedData");
  localStorage.removeItem("currentValidationData");
  localStorage.removeItem("currentUploadedFilename");

  // Show loading UI
  showLoading();

  try {
    // Read file content
    const fileContent = await file.text();
    
    if (!fileContent.trim()) {
      throw new Error("File appears to be empty");
    }

    // Parse using Pyodide
    console.log("Parsing file with Pyodide...");
    const parsedData = await parseDatamodelLogs(fileContent);
    
    if (!parsedData || !parsedData.endpoints) {
      throw new Error("Failed to parse file data. Please check file format.");
    }

    // Store parsed data
    localStorage.setItem("currentParsedData", JSON.stringify(parsedData));
    localStorage.setItem("currentUploadedFilename", file.name);
    localStorage.setItem("currentParseId", Date.now().toString());

    // Detect version
    let detectedVersion = null;
    try {
      detectedVersion = await detectSpecVersion(parsedData);
      if (detectedVersion) {
        localStorage.setItem("detectedVersion", detectedVersion);
      }
    } catch (e) {
      console.warn("Version detection failed:", e);
    }

    // Load supported versions and populate dropdown
    const versions = await getSupportedVersions();
    populateVersionDropdown(versions, detectedVersion);

    // Show success section
    showUploadSuccess(file.name, detectedVersion);
    
  } catch (error) {
    console.error("Error processing file:", error);
    showError(`Error processing file: ${error.message}`);
    resetUploadArea();
  } finally {
    hideLoading();
    window.isProcessing = false;
  }
}

function populateVersionDropdown(versions, detectedVersion) {
  const versionSelect = document.getElementById("complianceVersion");
  if (!versionSelect) return;

  // Clear existing options except the first one
  while (versionSelect.options.length > 1) {
    versionSelect.remove(1);
  }

  // Add detected version first if available
  if (detectedVersion && versions.includes(detectedVersion)) {
    const option = document.createElement("option");
    option.value = detectedVersion;
    option.textContent = `${detectedVersion} (Auto-detected - Recommended)`;
    option.selected = true;
    versionSelect.appendChild(option);
  }

  // Add other versions
  versions.forEach(version => {
    if (version !== detectedVersion) {
      const option = document.createElement("option");
      option.value = version;
      option.textContent = version;
      versionSelect.appendChild(option);
    }
  });
}

function showUploadSuccess(filename, detectedVersion) {
  const uploadSection = document.getElementById("uploadSection");
  const uploadSuccessSection = document.getElementById("uploadSuccessSection");
  const uploadedFilename = document.getElementById("uploadedFilename");
  const autoDetectedVersion = document.getElementById("autoDetectedVersion");
  const detectedVersionText = document.getElementById("detectedVersionText");

  if (uploadedFilename) {
    uploadedFilename.textContent = filename;
  }

  if (detectedVersion && autoDetectedVersion && detectedVersionText) {
    detectedVersionText.textContent = `Auto-detected version: ${detectedVersion}`;
    autoDetectedVersion.style.display = "block";
  } else if (autoDetectedVersion) {
    autoDetectedVersion.style.display = "none";
  }

  if (uploadSection) uploadSection.style.display = "none";
  if (uploadSuccessSection) uploadSuccessSection.style.display = "block";
}

export function resetUploadArea() {
  const uploadText = document.querySelector(".upload-text");
  const uploadSubtext = document.querySelector(".upload-subtext");
  const fileInput = document.getElementById("fileInput");

  if (uploadText) {
    uploadText.textContent = "Drop your .txt file here or click to browse";
    uploadText.style.color = "";
  }
  if (uploadSubtext) {
    uploadSubtext.textContent =
      "Supports .txt files containing device log data";
    uploadSubtext.style.color = "";
  }
  if (fileInput) {
    fileInput.value = "";
  }

  // Reset processing flag to allow new uploads
  window.isProcessing = false;
}

// ============= UPLOAD NEW BUTTON =============
export function initializeUploadNewButton() {
  const uploadNewBtn = document.getElementById("uploadNewBtn");
  if (uploadNewBtn) {
    uploadNewBtn.addEventListener("click", function () {
      if (
        confirm("This will clear all current data and start over. Continue?")
      ) {
        // Set intentional navigation flag to prevent second popup
        window.isIntentionalNavigation = true;
        window.isValidationInProgress = false;

        // Clear all stored data
        localStorage.removeItem("currentParsedData");
        localStorage.removeItem("currentValidationData");
        localStorage.removeItem("currentUploadedFilename");
        localStorage.removeItem("currentParseId");
        localStorage.removeItem("detectedVersion");
        sessionStorage.removeItem("selectedVersion");
        
        // Clear version-specific storage
        const parseId = localStorage.getItem("currentParseId");
        if (parseId) {
          localStorage.removeItem(`selectedComplianceVersion:${parseId}`);
        }

        // Reset UI
        const uploadSection = document.getElementById("uploadSection");
        const uploadSuccessSection = document.getElementById("uploadSuccessSection");
        const resultsSection = document.getElementById("resultsSection");
        const fileInput = document.getElementById("fileInput");

        if (uploadSection) uploadSection.style.display = "block";
        if (uploadSuccessSection) uploadSuccessSection.style.display = "none";
        if (resultsSection) resultsSection.style.display = "none";
        if (fileInput) fileInput.value = "";

        resetUploadArea();
      }
    });
  }
}
