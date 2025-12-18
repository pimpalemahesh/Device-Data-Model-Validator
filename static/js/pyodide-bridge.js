/**
 * Pyodide Bridge Module
 * Handles Python module loading and function calls via Pyodide
 */

let pyodide = null;
let pythonModulesLoaded = false;

// ============= PYODIDE INITIALIZATION =============
export async function initializePyodide() {
  if (pyodide) {
    return pyodide;
  }

  console.log("Loading Pyodide...");
  pyodide = await loadPyodide({
    indexURL: "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/",
  });

  console.log("Pyodide loaded, installing packages...");
  
  // Install required packages
  await pyodide.runPythonAsync(`
    import micropip
    await micropip.install(['pyodide-http'])
    import pyodide_http
    pyodide_http.patch_all()
  `);

  // Load dmv_tool package
  // Option 1: Try to install from wheel (if hosted)
  // Option 2: Load from bundled Python files
  console.log("Loading dmv_tool package...");
  
  const packageUrl = window.DMV_PACKAGE_URL || null;
  
  if (packageUrl) {
    try {
      await pyodide.runPythonAsync(`
        import micropip
        await micropip.install(['${packageUrl}'])
      `);
      pythonModulesLoaded = true;
      console.log("Python modules loaded from wheel");
    } catch (error) {
      console.warn("Failed to load from wheel, trying bundled modules:", error);
      await loadBundledModules();
    }
  } else {
    // Try bundled modules approach
    await loadBundledModules();
  }

  return pyodide;
}

// ============= LOAD BUNDLED MODULES =============
async function loadBundledModules() {
  // Load Python modules from bundled files or use micropip to install
  // This approach assumes Python source files are available or package is installable
  try {
    // First, try to install the package using micropip from PyPI or test PyPI
    try {
      await pyodide.runPythonAsync(`
        import micropip
        # Try installing from PyPI (if published) or test PyPI
        await micropip.install(['esp-matter-dm-validator'])
      `);
      pythonModulesLoaded = true;
      console.log("Python modules installed from PyPI");
    } catch (pipError) {
      console.warn("Could not install from PyPI, trying to load Python files directly:", pipError);
      
      // Alternative: Load Python source files if bundled
      // This requires the Python source to be available in the repository
      // For now, we'll assume the package is available via one of the methods above
      throw new Error("Python package not available. Please configure DMV_PACKAGE_URL or ensure package is installable.");
    }

    // Load validation data files into Pyodide filesystem
    const validationDataVersions = ['1.2', '1.3', '1.4', '1.4.1', '1.4.2', '1.5', 'master'];
    
    // Create data directory in Pyodide filesystem
    pyodide.runPython(`
      import os
      import sys
      # Set up data directory
      os.makedirs('/data', exist_ok=True)
      # Update BASE_DIR for validators to find data files
      # This will be used by load_chip_validation_data
    `);

    // Load validation data JSON files
    for (const version of validationDataVersions) {
      try {
        const response = await fetch(`data/validation_data_${version}.json`);
        if (response.ok) {
          const jsonData = await response.text();
          pyodide.FS.writeFile(`/data/validation_data_${version}.json`, jsonData);
        }
      } catch (e) {
        console.warn(`Could not load validation data for version ${version}:`, e);
      }
    }

    // Patch BASE_DIR in Python to point to /data
    // The conformance_checker uses BASE_DIR/data/validation_data_{version}.json
    pyodide.runPython(`
      import sys
      import os
      # Patch the BASE_DIR in conformance_checker module
      import validators.conformance_checker as cc
      
      # Override load_chip_validation_data to use /data directory
      original_load = cc.load_chip_validation_data
      def patched_load_chip_validation_data(spec_version):
        import json
        file_path = f"/data/validation_data_{spec_version}.json"
        try:
          with open(file_path, "r") as f:
            return json.load(f)
        except Exception as e:
          # Fallback to original if file not found
          print(f"Warning: Could not load {file_path}, trying original method: {e}")
          return original_load(spec_version)
      
      cc.load_chip_validation_data = patched_load_chip_validation_data
      
      # Also patch BASE_DIR if it's used elsewhere
      if hasattr(cc, 'BASE_DIR'):
        cc.BASE_DIR = '/data'
    `);

    pythonModulesLoaded = true;
    console.log("Bundled modules and data loaded");
  } catch (error) {
    console.error("Error loading bundled modules:", error);
    throw error;
  }
}

// ============= PYTHON FUNCTION WRAPPERS =============

/**
 * Parse wildcard logs using Python
 */
export async function parseDatamodelLogs(logData) {
  await ensurePyodideReady();
  
  try {
    // Escape the log data properly for Python
    const escapedLogData = logData
      .replace(/\\/g, '\\\\')
      .replace(/`/g, '\\`')
      .replace(/\${/g, '\\${');
    
    // Use Python's json module to properly serialize
    pyodide.runPython(`
      import json
      log_data_str = """${escapedLogData}"""
    `);
    
    const result = await pyodide.runPythonAsync(`
      from parsers.wildcard_logs import parse_datamodel_logs
      import json
      
      parsed = parse_datamodel_logs(log_data_str)
      json.dumps(parsed)
    `);
    
    return JSON.parse(result);
  } catch (error) {
    console.error("Error parsing logs:", error);
    throw new Error(`Failed to parse logs: ${error.message}`);
  }
}

/**
 * Detect specification version from parsed data
 */
export async function detectSpecVersion(parsedData) {
  await ensurePyodideReady();
  
  try {
    // Store parsed data in Python namespace
    pyodide.globals.set('parsed_data_json', JSON.stringify(parsedData));
    
    const result = await pyodide.runPythonAsync(`
      from validators.conformance_checker import detect_spec_version_from_parsed_data
      import json
      
      parsed_data = json.loads(parsed_data_json)
      version = detect_spec_version_from_parsed_data(parsed_data)
      version if version else "master"
    `);
    
    return result;
  } catch (error) {
    console.error("Error detecting version:", error);
    return null;
  }
}

/**
 * Validate device conformance
 */
export async function validateDeviceConformance(parsedData, specVersion) {
  await ensurePyodideReady();
  
  try {
    // Store data in Python namespace
    pyodide.globals.set('parsed_data_json', JSON.stringify(parsedData));
    pyodide.globals.set('spec_version_str', specVersion);
    
    const result = await pyodide.runPythonAsync(`
      from validators.conformance_checker import validate_device_conformance
      import json
      
      parsed_data = json.loads(parsed_data_json)
      spec_version = spec_version_str
      
      validation_results = validate_device_conformance(parsed_data, spec_version)
      json.dumps(validation_results)
    `);
    
    return JSON.parse(result);
  } catch (error) {
    console.error("Error validating conformance:", error);
    throw new Error(`Validation failed: ${error.message}`);
  }
}

/**
 * Get supported specification versions
 */
export async function getSupportedVersions() {
  await ensurePyodideReady();
  
  try {
    const result = await pyodide.runPythonAsync(`
      from configs.constants import SUPPORTED_SPEC_VERSIONS
      import json
      
      json.dumps(list(SUPPORTED_SPEC_VERSIONS))
    `);
    
    return JSON.parse(result);
  } catch (error) {
    console.error("Error getting supported versions:", error);
    return ['1.2', '1.3', '1.4', '1.4.1', '1.4.2', '1.5', 'master'];
  }
}

// ============= HELPER FUNCTIONS =============
async function ensurePyodideReady() {
  if (!pyodide) {
    await initializePyodide();
  }
  if (!pythonModulesLoaded) {
    throw new Error("Python modules not loaded");
  }
}

// Initialize Pyodide when module loads
let initializationPromise = null;

export function getPyodide() {
  if (!initializationPromise) {
    initializationPromise = initializePyodide();
  }
  return initializationPromise;
}

// Auto-initialize on module load
getPyodide().then(() => {
  console.log("Pyodide bridge ready");
  // Hide loading indicator and show main content
  const loadingEl = document.getElementById('pyodide-loading');
  const mainContent = document.getElementById('mainContent');
  if (loadingEl) loadingEl.style.display = 'none';
  if (mainContent) mainContent.style.display = 'block';
  
  // Dispatch custom event
  window.dispatchEvent(new CustomEvent('pyodide-ready'));
}).catch(error => {
  console.error("Failed to initialize Pyodide:", error);
  const loadingEl = document.getElementById('pyodide-loading');
  if (loadingEl) {
    loadingEl.innerHTML = `
      <div style="text-align: center; color: #d32f2f;">
        <i class="fas fa-exclamation-triangle fa-3x" style="margin-bottom: 20px;"></i>
        <h3>Failed to Load Python Runtime</h3>
        <p>${error.message}</p>
        <p style="margin-top: 20px;">Please refresh the page to try again.</p>
      </div>
    `;
  }
});

