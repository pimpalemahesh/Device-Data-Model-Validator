/**
 * Modal Module
 * Handles cluster details modal functionality and interactive elements
 */

import { copyToClipboard, showCopySuccess } from "./utils.js";

// ============= MODAL INITIALIZATION =============
export function initializeModal() {
  // Close modal when pressing Escape key
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      closeClusterModal();
    }
  });
}

// ============= MODAL FUNCTIONS =============
export function openClusterModal(clusterId, endpointId) {
  // Try to get cluster data from cache first (for dynamically rendered content)
  const cacheKey = `${endpointId}_${clusterId}`;
  let clusterData = null;
  let validationData = null;

  if (window.clusterDataCache && window.clusterDataCache[cacheKey]) {
    clusterData = window.clusterDataCache[cacheKey].clusterData;
    validationData = window.clusterDataCache[cacheKey].validationData;
  } else {
    // Fallback: Find the cluster data from script tag (for static content)
    const clusterDataScript = document.querySelector(
      `.cluster-data[data-cluster-id="${clusterId}"][data-endpoint-id="${
        endpointId
      }"]`,
    );

    if (!clusterDataScript) {
      console.error("Cluster data not found");
      return;
    }

    try {
      clusterData = JSON.parse(clusterDataScript.textContent);
    } catch (e) {
      console.error("Error parsing cluster data:", e);
      return;
    }

    // Find validation data from embedded script tag
    const validationDataScript = document.querySelector(
      `.validation-data[data-cluster-id="${clusterId}"][data-endpoint-id="${
        endpointId
      }"]`,
    );

    if (validationDataScript) {
      try {
        validationData = JSON.parse(validationDataScript.textContent);
      } catch (e) {
        console.error("Error parsing validation data:", e);
      }
    }
  }

  // Update modal title
  const modalTitle = document.getElementById("modalTitle");
  modalTitle.innerHTML = `<i class="fas fa-network-wired"></i> Cluster ${
    clusterId
  } - Endpoint ${endpointId}`;

  // Build modal content
  const modalBody = document.getElementById("modalBody");
  modalBody.innerHTML = buildClusterContent(
    clusterData,
    clusterId,
    validationData,
  );

  // Show modal
  document.getElementById("clusterModal").style.display = "flex";
  document.getElementById("modalOverlay").style.display = "block";
  document.body.style.overflow = "hidden"; // Prevent background scrolling
}

export function closeClusterModal() {
  document.getElementById("clusterModal").style.display = "none";
  document.getElementById("modalOverlay").style.display = "none";
  document.body.style.overflow = "auto"; // Restore scrolling
}

// ============= MODAL CONTENT BUILDERS =============
function buildClusterContent(clusterData, clusterId, validationData) {
  let html = `
        <div class="cluster-summary">
            <h3>Cluster ${clusterId}</h3>
            <p><strong>Type:</strong> ${
              validationData?.cluster_type || "server"
            }</p>
            <p><strong>Compliance:</strong> ${
              validationData?.is_compliant ? "✅ Compliant" : "❌ Non-Compliant"
            }</p>
        </div>

        <!-- Element Type Legend -->
        <div class="element-legend">
            <h4><i class="fas fa-info-circle"></i> Element Types</h4>
            <div class="legend-items">
                <div class="legend-item">
                    <i class="fas fa-star mandatory-icon"></i>
                    <span>Mandatory (Required by Matter specification)</span>
                </div>
                <div class="legend-item">
                    <i class="fas fa-circle-plus optional-icon"></i>
                    <span>Optional (Added by application)</span>
                </div>
            </div>
        </div>
    `;

  // Missing Elements Section (if validation data is available)
  if (
    validationData &&
    validationData.missing_elements &&
    validationData.missing_elements.length > 0
  ) {
    html += buildMissingElementsSection(validationData.missing_elements);
  }

  // Duplicate Elements Section (if validation data is available)
  if (
    validationData &&
    validationData.duplicate_elements &&
    validationData.duplicate_elements.length > 0
  ) {
    html += buildDuplicateElementsSection(validationData.duplicate_elements);
  }

  // Revision Issues Section (cluster-specific)
  if (
    validationData &&
    validationData.revision_issues &&
    validationData.revision_issues.length > 0
  ) {
    html += buildRevisionIssuesSection(validationData.revision_issues);
  }

  // Event Information Section
  if (
    validationData &&
    validationData.event_warnings &&
    validationData.event_warnings.length > 0
  ) {
    html += buildEventInformationSection(validationData.event_warnings);
  }

  // Insert Cluster Metadata section before Attributes
  const metaSection = buildClusterMetaSection(clusterData.features, clusterData.revisions);
  if (metaSection) {
    html += metaSection;
  }

  // Attributes Section
  if (
    clusterData.attributes &&
    Object.keys(clusterData.attributes).length > 0
  ) {
    html += buildAttributesSection(clusterData.attributes, validationData);
  }

  // Commands Section
  if (clusterData.commands) {
    html += buildCommandsSection(clusterData.commands, validationData);
  }

  return html;
}

function buildMissingElementsSection(missingElements) {
  let html = `
        <div class="modal-section">
            <h3 style="color: var(--error-color);"><i class="fas fa-exclamation-triangle"></i> Missing Elements</h3>
            <div class="modal-items">
    `;

  // Group missing elements by type
  const groupedElements = {
    attribute: [],
    command: [],
    feature: [],
    cluster: [],
    feature_attribute: [],
    feature_command: [],
    feature_event: [],
  };

  missingElements.forEach((element) => {
    const type = element.type || "unknown";
    if (groupedElements[type]) {
      groupedElements[type].push(element);
    }
  });

  // Display each type of missing element
  Object.entries(groupedElements).forEach(([type, elements]) => {
    if (elements.length > 0) {
      let typeDisplayName = type;
      let iconClass = "network-wired";

      switch (type) {
        case "attribute":
          typeDisplayName = "Attributes";
          iconClass = "list";
          break;
        case "command":
          typeDisplayName = "Commands";
          iconClass = "terminal";
          break;
        case "feature":
          typeDisplayName = "Features";
          iconClass = "cog";
          break;
        case "cluster":
          typeDisplayName = "Clusters";
          iconClass = "network-wired";
          break;
        case "feature_attribute":
          typeDisplayName = "Feature-Specific Attributes";
          iconClass = "list-alt";
          break;
        case "feature_command":
          typeDisplayName = "Feature-Specific Commands";
          iconClass = "code";
          break;
        case "feature_event":
          typeDisplayName = "Feature-Specific Events";
          iconClass = "bell";
          break;
      }

      html += `
                <div class="missing-type-section">
                    <h4 style="color: var(--error-color); margin: 15px 0 10px 0;">
                        <i class="fas fa-${iconClass}"></i>
                        ${typeDisplayName} (${elements.length})
                    </h4>
            `;

      elements.forEach((element) => {
        // Special handling for feature-specific elements
        if (type.startsWith("feature_")) {
          html += `
                        <div class="modal-item missing-element">
                            <div class="modal-item-header">
                                <span class="modal-id-badge error">${
                                  element.id || "Unknown ID"
                                }</span>
                                <span class="modal-name error">${
                                  element.name || "Unknown Name"
                                }</span>
                            </div>
                            <div class="feature-context" style="margin-top: 5px; font-size: 0.9em; color: var(--text-secondary); background: var(--background-secondary); padding: 5px 8px; border-radius: 4px;">
                                <i class="fas fa-cog"></i> Required by feature: <strong>${
                                  element.feature_name || "Unknown Feature"
                                }</strong> (${
                                  element.feature_id || "Unknown ID"
                                })
                            </div>
                        </div>
                    `;
        } else {
          html += `
                        <div class="modal-item missing-element">
                            <div class="modal-item-header">
                                <span class="modal-id-badge error">${
                                  element.id || "Unknown ID"
                                }</span>
                                <span class="modal-name error">${
                                  element.name || "Unknown Name"
                                }</span>
                            </div>
                        </div>
                    `;
        }
      });

      html += "</div>";
    }
  });

  html += "</div></div>";
  return html;
}

function buildDuplicateElementsSection(duplicateElements) {
  let html = `
        <div class="modal-section">
            <h3 style="color: var(--error-color);"><i class="fas fa-clone"></i> Duplicate Elements</h3>
            <div class="duplicate-notice" style="background: rgba(244, 67, 54, 0.1); padding: 10px; border-radius: 8px; margin-bottom: 15px;">
                <i class="fas fa-exclamation-circle" style="color: var(--error-color);"></i>
                <span style="color: var(--error-color); margin-left: 8px;">Remove duplicate entries from the device.</span>
            </div>
            <div class="modal-items">
    `;

  // Group duplicate elements by type
  const groupedElements = {
    duplicate_attribute: [],
    duplicate_command: [],
  };

  duplicateElements.forEach((element) => {
    const type = element.type || "unknown";
    if (groupedElements[type]) {
      groupedElements[type].push(element);
    }
  });

  // Display each type of duplicate element
  Object.entries(groupedElements).forEach(([type, elements]) => {
    if (elements.length > 0) {
      let typeDisplayName = type;
      let iconClass = "clone";

      switch (type) {
        case "duplicate_attribute":
          typeDisplayName = "Duplicate Attributes";
          iconClass = "list";
          break;
        case "duplicate_command":
          typeDisplayName = "Duplicate Commands";
          iconClass = "terminal";
          break;
      }

      html += `
                <div class="duplicate-type-section">
                    <h4 style="color: var(--error-color); margin: 15px 0 10px 0;">
                        <i class="fas fa-${iconClass}"></i>
                        ${typeDisplayName} (${elements.length})
                    </h4>
            `;

      elements.forEach((element) => {
        const listTypeInfo = element.list_type ? ` in ${element.list_type}` : '';
        html += `
                    <div class="modal-item duplicate-element">
                        <div class="modal-item-header">
                            <span class="modal-id-badge error">${element.id || "Unknown ID"}</span>
                            <span class="modal-name error">${element.name || "Unknown Name"}</span>
                            <span class="duplicate-count-badge" style="background: var(--error-color); color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.8em; margin-left: 8px;">
                                ×${element.count || 2}
                            </span>
                        </div>
                        <div class="modal-values">
                            <div class="modal-value">
                                <span class="modal-value-label">Issue:</span>
                                <span class="modal-value-data">Found ${element.count || 2} times${listTypeInfo}</span>
                            </div>
                        </div>
                    </div>
                `;
      });

      html += "</div>";
    }
  });

  html += "</div></div>";
  return html;
}

function buildRevisionIssuesSection(revisionIssues) {
  let html = `
        <div class="modal-section">
            <h3 style="color: var(--error-color);"><i class="fas fa-exclamation-circle"></i> Revision Issues</h3>
            <div class="modal-items">
    `;

  revisionIssues.forEach((issue) => {
    html += `
            <div class="modal-item revision-issue">
                <div class="modal-item-header">
                    <span class="modal-id-badge error">${
                      issue.item_id || "N/A"
                    }</span>
                    <span class="modal-name error">${
                      issue.item_name || "Unknown Item"
                    }</span>
                </div>
                <div class="modal-values">
                    <div class="modal-value">
                        <span class="modal-value-label">Issue:</span>
                        <span class="modal-value-data">${issue.message}</span>
                    </div>
                    <div class="modal-value">
                        <span class="modal-value-label">Actual Revision:</span>
                        <span class="modal-value-data">${
                          issue.actual_revision || "Unknown"
                        }</span>
                    </div>
                    <div class="modal-value">
                        <span class="modal-value-label">Required Revision:</span>
                        <span class="modal-value-data">${
                          issue.required_revision || "Unknown"
                        }</span>
                    </div>
                </div>
            </div>
        `;
  });

  html += "</div></div>";
  return html;
}

function buildEventInformationSection(eventWarnings) {
  let html = `
        <div class="modal-section">
            <h3 style="color: var(--info-color);"><i class="fas fa-info-circle"></i> Event Information</h3>
            <div class="event-notice" style="background: rgba(33, 150, 243, 0.1); padding: 10px; border-radius: 8px; margin-bottom: 15px;">
                <i class="fas fa-lightbulb" style="color: var(--info-color);"></i>
                <span style="color: var(--info-color); margin-left: 8px;">Events are informational only and do not affect compliance status.</span>
            </div>
            <div class="modal-items">
    `;

  eventWarnings.forEach((warning) => {
    const isWarning = warning.severity === "warning";
    html += `
            <div class="modal-item event-item">
                <div class="modal-item-header">
                    <span class="modal-id-badge ${
                      isWarning ? "warning" : "info"
                    }">${warning.event_id || "Event"}</span>
                    <span class="modal-name ${
                      isWarning ? "warning" : "info"
                    }">${
                      warning.event_name || warning.type || "Event Information"
                    }</span>
                </div>
                <div class="modal-values">
                    <div class="modal-value">
                        <span class="modal-value-label">Message:</span>
                        <span class="modal-value-data">${warning.message}</span>
                    </div>
                    ${
                      warning.severity
                        ? `
                    <div class="modal-value">
                        <span class="modal-value-label">Severity:</span>
                        <span class="modal-value-data">${
                          warning.severity
                        }</span>
                    </div>
                    `
                        : ""
                    }
                </div>
            </div>
        `;
  });

  html += "</div></div>";
  return html;
}

// Add cluster metadata section for ClusterRevision and FeatureMap
function buildClusterMetaSection(featuresObj, revisionsObj) {
  if (!featuresObj || typeof featuresObj !== "object") return "";

  let clusterRevision = null;
  let featureMap = null;

  if (
    revisionsObj.ClusterRevision &&
    typeof revisionsObj.ClusterRevision === "object" &&
    "ClusterRevision" in revisionsObj.ClusterRevision
  ) {
    clusterRevision = revisionsObj.ClusterRevision.ClusterRevision;
  }

  if (
    featuresObj.FeatureMap &&
    typeof featuresObj.FeatureMap === "object" &&
    "FeatureMap" in featuresObj.FeatureMap
  ) {
    featureMap = featuresObj.FeatureMap.FeatureMap;
  }

  if (clusterRevision === null && featureMap === null) return "";

  const revDisplay =
    clusterRevision !== null ? `${clusterRevision}` : "Not Available";
  const fmapDisplay = featureMap !== null ? `${featureMap}` : "Not Available";

  return `
        <div class="modal-section">
            <h3><i class="fas fa-info-circle"></i> Cluster Metadata</h3>
            <div class="modal-items">
                <div class="modal-item">
                    <div class="modal-item-header">
                        <span class="modal-name">Cluster Revision</span>
                    </div>
                    <div class="modal-values">
                        <div class="modal-value">
                            <span class="modal-value-label">Value:</span>
                            <span class="modal-value-data">${revDisplay}</span>
                        </div>
                    </div>
                </div>
                <div class="modal-item">
                    <div class="modal-item-header">
                        <span class="modal-name">Feature Map</span>
                    </div>
                    <div class="modal-values">
                        <div class="modal-value">
                            <span class="modal-value-label">Value:</span>
                            <span class="modal-value-data">${fmapDisplay}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function buildAttributesSection(attributes, validationData) {
  let html = `
        <div class="modal-section">
            <h3><i class="fas fa-list"></i> Attributes</h3>
            <div class="modal-items">
    `;

  // Create name mapping from AttributeList
  const nameMap = {};
  if (attributes.AttributeList && attributes.AttributeList.AttributeList) {
    attributes.AttributeList.AttributeList.forEach((attr) => {
      if (typeof attr === "object" && attr !== null && attr.id) {
        nameMap[attr.id] = attr.name;
      }
    });
  }

  // Get optional attributes list from validation data
  const optionalAttributes = validationData?.optional_attributes || [];

  // Display all attributes
  Object.entries(attributes).forEach(([attrId, attrData]) => {
    // Skip empty attributes but show AttributeList
    if (attrData !== null && attrData !== undefined) {
      const attrName =
        nameMap[attrId] ||
        attrId.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());

      // Check if this attribute is in the optional list
      const isOptional = optionalAttributes.includes(attrId);
      const mandatoryIcon = isOptional
        ? '<i class="fas fa-circle-plus optional-icon" title="Optional element (Added by application)"></i>'
        : '<i class="fas fa-star mandatory-icon" title="Mandatory element (required by Matter specification)"></i>';
      const mandatoryClass = isOptional
        ? "optional-element"
        : "mandatory-element";

      html += `
                <div class="modal-item ${mandatoryClass}">
                    <div class="modal-item-header">
                        <span class="modal-id-badge">${attrId}</span>
                        <span class="modal-name">${attrName}</span>
                        <span class="element-type-indicator">${
                          mandatoryIcon
                        }</span>
                    </div>
                    <div class="modal-values">
            `;

      if (typeof attrData === "object" && attrData !== null) {
        Object.entries(attrData).forEach(([key, value]) => {
          const displayValue =
            typeof value === "object" ? JSON.stringify(value, null, 2) : value;
          html += `
                        <div class="modal-value">
                            <span class="modal-value-label">${key
                              .replace(/_/g, " ")
                              .replace(/\b\w/g, (l) => l.toUpperCase())}:</span>
                            <span class="modal-value-data">${
                              displayValue
                            }</span>
                        </div>
                    `;
        });
      } else {
        html += `
                    <div class="modal-value">
                        <span class="modal-value-label">Value:</span>
                        <span class="modal-value-data">${attrData}</span>
                    </div>
                `;
      }

      html += `
                    </div>
                </div>
            `;
    }
  });

  html += "</div></div>";
  return html;
}

function buildCommandsSection(commands, validationData) {
  let html = `
        <div class="modal-section">
            <h3><i class="fas fa-terminal"></i> Commands</h3>
            <div class="modal-items">
    `;

  // Get optional commands list from validation data
  const optionalCommands = validationData?.optional_commands || [];

  // Generated Commands
  if (
    commands.GeneratedCommandList &&
    commands.GeneratedCommandList.GeneratedCommandList
  ) {
    commands.GeneratedCommandList.GeneratedCommandList.forEach((cmd) => {
      let cmdId, cmdName;

      if (typeof cmd === "object" && cmd !== null) {
        cmdId = cmd.id || "Unknown";
        cmdName = cmd.name
          ? cmd.name.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
          : "Unknown Command";
      } else {
        // cmd is a number
        cmdId = `0x${parseInt(cmd).toString(16).toUpperCase().padStart(4, "0")}`;
        cmdName = `Command ${cmdId}`;
      }

      // Check if this command is in the optional list
      const isOptional = optionalCommands.includes(cmdId);
      const mandatoryIcon = isOptional
        ? '<i class="fas fa-circle-plus optional-icon" title="Optional element (Added by application)"></i>'
        : '<i class="fas fa-star mandatory-icon" title="Mandatory element (required by Matter specification)"></i>';
      const mandatoryClass = isOptional
        ? "optional-element"
        : "mandatory-element";

      html += `
                <div class="modal-item ${mandatoryClass}">
                    <div class="modal-item-header">
                        <span class="modal-id-badge">${cmdId}</span>
                        <span class="modal-name">${cmdName}</span>
                        <span class="modal-type-badge generated">Generated</span>
                        <span class="element-type-indicator">${
                          mandatoryIcon
                        }</span>
                    </div>
                </div>
            `;
    });
  }

  // Accepted Commands
  if (
    commands.AcceptedCommandList &&
    commands.AcceptedCommandList.AcceptedCommandList
  ) {
    commands.AcceptedCommandList.AcceptedCommandList.forEach((cmd) => {
      let cmdId, cmdName;

      if (typeof cmd === "object" && cmd !== null) {
        cmdId = cmd.id || "Unknown";
        cmdName = cmd.name
          ? cmd.name.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
          : "Unknown Command";
      } else {
        // cmd is a number
        cmdId = `0x${parseInt(cmd).toString(16).toUpperCase().padStart(4, "0")}`;
        cmdName = `Command ${cmdId}`;
      }

      // Check if this command is in the optional list
      const isOptional = optionalCommands.includes(cmdId);
      const mandatoryIcon = isOptional
        ? '<i class="fas fa-circle-plus optional-icon" title="Optional element (Added by application)"></i>'
        : '<i class="fas fa-star mandatory-icon" title="Mandatory element (required by Matter specification)"></i>';
      const mandatoryClass = isOptional
        ? "optional-element"
        : "mandatory-element";

      html += `
                <div class="modal-item ${mandatoryClass}">
                    <div class="modal-item-header">
                        <span class="modal-id-badge">${cmdId}</span>
                        <span class="modal-name">${cmdName}</span>
                        <span class="modal-type-badge accepted">Accepted</span>
                        <span class="element-type-indicator">${
                          mandatoryIcon
                        }</span>
                    </div>
                </div>
            `;
    });
  }

  html += "</div></div>";
  return html;
}

// ============= INTERACTIVE ELEMENTS =============
export function initializeInteractiveElements() {
  // Add smooth scrolling for anchor links
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", function (e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute("href"));
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });

  // Add click handlers for expandable sections
  initializeExpandableSections();

  // Add copy functionality for IDs and codes
  initializeCopyButtons();
}

export function initializeExpandableSections() {
  const deviceTypeCards = document.querySelectorAll(".device-type-card");

  deviceTypeCards.forEach((card) => {
    const header = card.querySelector(".device-type-header");
    if (header) {
      header.style.cursor = "pointer";
      header.addEventListener("click", function () {
        const content = card.querySelector(".clusters-grid");
        if (content) {
          const isVisible = content.style.display !== "none";
          content.style.display = isVisible ? "none" : "grid";

          // Add expand/collapse icon
          let icon = header.querySelector(".expand-icon");
          if (!icon) {
            icon = document.createElement("span");
            icon.className = "expand-icon";
            header.appendChild(icon);
          }
          icon.textContent = isVisible ? "▶" : "▼";
        }
      });
    }
  });
}

export function initializeCopyButtons() {
  // Add copy buttons to device type IDs and cluster IDs
  const deviceTypeIds = document.querySelectorAll(".device-type-id");
  const clusterIds = document.querySelectorAll(".cluster-id");

  [...deviceTypeIds, ...clusterIds].forEach((element) => {
    element.style.cursor = "pointer";
    element.title = "Click to copy";
    element.addEventListener("click", function () {
      copyToClipboard(this.textContent).then((success) => {
        if (success) {
          showCopySuccess(this);
        }
      });
    });
  });
}

// Make functions available globally for template usage
window.openClusterModal = openClusterModal;
window.closeClusterModal = closeClusterModal;

// Initialize modal handlers after DOM updates
window.initializeModalHandlers = function() {
  // Re-initialize copy buttons for newly rendered content
  initializeCopyButtons();
};
