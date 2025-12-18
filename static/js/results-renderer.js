/**
 * Results Renderer Module
 * Renders validation results in the UI
 */

import { openClusterModal } from "./modal.js";

export function renderValidationResults(validationData, parsedData) {
  // Show results section
  const resultsSection = document.getElementById("resultsSection");
  if (resultsSection) {
    resultsSection.style.display = "block";
  }

  // Update summary stats
  const summary = validationData.summary || {};
  const totalEndpoints = summary.total_endpoints || 0;
  const compliantEndpoints = summary.compliant_endpoints || 0;
  const nonCompliantEndpoints = summary.non_compliant_endpoints || 0;
  const complianceRate = totalEndpoints > 0 
    ? Math.round((compliantEndpoints / totalEndpoints) * 100) 
    : 0;

  document.getElementById("totalEndpoints").textContent = totalEndpoints;
  document.getElementById("compliantEndpoints").textContent = compliantEndpoints;
  document.getElementById("nonCompliantEndpoints").textContent = nonCompliantEndpoints;
  document.getElementById("complianceRate").textContent = `${complianceRate}%`;

  // Render detailed results
  renderDetailedResults(validationData.endpoints || [], parsedData);

  // Scroll to results
  resultsSection?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderDetailedResults(endpoints, parsedData) {
  const detailedResults = document.getElementById("detailedResults");
  if (!detailedResults) return;

  let html = "";

  endpoints.forEach(endpoint => {
    const endpointId = endpoint.endpoint || 0;
    const isCompliant = endpoint.is_compliant !== false;
    
    html += `
      <div class="endpoint-card">
        <div class="endpoint-header">
          <div class="endpoint-title">
            <i class="fas fa-plug"></i>
            Endpoint ${endpointId}
          </div>
          <span class="compliance-badge ${isCompliant ? 'badge-compliant' : 'badge-non-compliant'}">
            ${isCompliant ? '✓ Compliant' : '✗ Non-Compliant'}
          </span>
        </div>

        <div class="endpoint-content">
          <div class="device-types">
    `;

    (endpoint.device_types || []).forEach(deviceType => {
      const deviceTypeName = deviceType.device_type_name || "Unknown";
      const deviceTypeId = deviceType.device_type_id || "Unknown";
      const deviceCompliant = deviceType.is_compliant !== false;

      html += `
        <div class="device-type-card ${deviceCompliant ? '' : 'non-compliant'}">
          <div class="device-type-header">
            <div class="device-type-name">
              <i class="fas fa-microchip"></i>
              ${deviceTypeName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
            </div>
            <div class="device-type-id">${deviceTypeId}</div>
          </div>
      `;

      // Revision issues
      const revisionIssues = (deviceType.revision_issues || []).filter(
        issue => issue.item_type === 'device_type'
      );
      if (revisionIssues.length > 0) {
        html += `
          <div class="revision-issues">
            <h4><i class="fas fa-exclamation-circle"></i> Device Type Revision Issues (${revisionIssues.length})</h4>
            <ul class="revision-list">
        `;
        revisionIssues.forEach(issue => {
          html += `
            <li class="revision-error">
              <i class="fas fa-times-circle"></i>
              <span class="issue-message">${issue.message || 'Revision issue'}</span>
            </li>
          `;
        });
        html += `</ul></div>`;
      }

      // Clusters
      if (deviceType.cluster_validations && deviceType.cluster_validations.length > 0) {
        html += `<div class="clusters-grid">`;
        
        deviceType.cluster_validations.forEach(cluster => {
          const clusterId = cluster.cluster_id || "Unknown";
          const clusterName = cluster.cluster_name || "Unknown";
          const clusterCompliant = cluster.is_compliant !== false;
          const hasEventWarnings = (cluster.event_warnings || []).length > 0;
          const isClusterMissing = (cluster.missing_elements || []).some(
            el => el.type === 'cluster'
          );

          // Get actual cluster data from parsed data
          const endpointData = (parsedData?.endpoints || []).find(
            ep => ep.id === endpointId || ep.endpoint === endpointId
          );
          const actualClusterData = endpointData?.clusters?.[clusterId] || {};

          html += `
            <div class="cluster-card ${!isClusterMissing ? 'clickable-cluster' : ''} ${clusterCompliant ? (hasEventWarnings ? 'warning' : '') : 'non-compliant'}"
                 data-cluster-id="${clusterId}"
                 data-endpoint-id="${endpointId}"
                 ${!isClusterMissing ? `onclick="openClusterModal('${clusterId}', '${endpointId}')" style="cursor: pointer;"` : ''}>
              <div class="cluster-header">
                <div class="cluster-info">
                  <div class="cluster-name">
                    <i class="fas fa-${isClusterMissing ? 'exclamation-triangle' : 'network-wired'}"></i>
                    ${clusterName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </div>
                  <div class="cluster-description">${isClusterMissing ? 'Cluster not found in device' : 'Click to view details'}</div>
                </div>
                <div class="cluster-actions">
                  <div class="cluster-id">${clusterId}</div>
                  ${!isClusterMissing ? `
                    <div class="view-button">
                      <i class="fas fa-eye"></i>
                    </div>
                  ` : ''}
                </div>
              </div>

              <div class="cluster-stats">
                <div class="compliance-status">
                  <span><i class="fas fa-list"></i> ${(cluster.cluster_type || 'server').charAt(0).toUpperCase() + (cluster.cluster_type || 'server').slice(1)}</span>
                  ${!clusterCompliant ? `
                    <span style="color: var(--error-color);">
                      <i class="fas fa-times"></i> Non-Compliant
                      ${cluster.missing_elements ? `(${cluster.missing_elements.length} missing)` : ''}
                      ${cluster.duplicate_elements?.length > 0 ? `
                        <span style="margin-left: 5px;">
                          <i class="fas fa-clone"></i> ${cluster.duplicate_elements.length} duplicates
                        </span>
                      ` : ''}
                    </span>
                  ` : `
                    <span style="color: var(--success-color);">
                      <i class="fas fa-check"></i> Compliant
                      ${hasEventWarnings ? `
                        <span style="color: var(--warning-color); margin-left: 5px;">
                          <i class="fas fa-exclamation-triangle"></i> Warnings
                        </span>
                      ` : ''}
                    </span>
                  `}
                </div>
          `;

          if (actualClusterData.attributes) {
            const attrCount = Object.keys(actualClusterData.attributes).length;
            const cmdCount = (
              (actualClusterData.commands?.GeneratedCommandList?.GeneratedCommandList || []).length +
              (actualClusterData.commands?.AcceptedCommandList?.AcceptedCommandList || []).length
            );

            html += `
              <div class="data-stats">
                <div class="stat-item">
                  <i class="fas fa-list"></i>
                  <span class="stat-count">${attrCount}</span>
                  <span class="stat-label">Attributes</span>
                </div>
                <div class="stat-item">
                  <i class="fas fa-list"></i>
                  <span class="stat-count">${cmdCount}</span>
                  <span class="stat-label">Commands</span>
                </div>
              </div>
            `;
          }

          html += `</div>`;

          // Store cluster data for modal (using data attributes instead of script tags)
          // We'll store this in a global object for modal access
          if (actualClusterData && Object.keys(actualClusterData).length > 0) {
            if (!window.clusterDataCache) {
              window.clusterDataCache = {};
            }
            const cacheKey = `${endpointId}_${clusterId}`;
            window.clusterDataCache[cacheKey] = {
              clusterData: actualClusterData,
              validationData: cluster
            };
          }

          html += `</div>`;
        });
        
        html += `</div>`;
      }

      html += `</div>`;
    });

    html += `
          </div>
        </div>
      </div>
    `;
  });

  detailedResults.innerHTML = html;

  // Re-initialize modal handlers after rendering
  // Wait a bit for DOM to update
  setTimeout(() => {
    if (window.initializeModalHandlers) {
      window.initializeModalHandlers();
    }
    // Also re-initialize copy buttons for new content
    import("./modal.js").then(module => {
      if (module.initializeCopyButtons) {
        module.initializeCopyButtons();
      }
    });
  }, 100);
}

