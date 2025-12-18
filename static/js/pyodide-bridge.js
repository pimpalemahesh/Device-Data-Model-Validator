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

  console.log("Pyodide loaded, loading micropip...");
  
  // First, load micropip package (required for installing other packages)
  await pyodide.loadPackage("micropip");
  
  console.log("Installing pyodide-http...");
  
  // Install pyodide-http for better HTTP support
  try {
    await pyodide.runPythonAsync(`
      import micropip
      await micropip.install(['pyodide-http'])
      import pyodide_http
      pyodide_http.patch_all()
    `);
  } catch (error) {
    console.warn("Could not install pyodide-http, continuing without it:", error);
  }

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
  
  // Check if we should use test PyPI (default to true)
  const useTestPyPI = (typeof window.DMV_USE_TEST_PYPI === 'undefined') || (window.DMV_USE_TEST_PYPI !== false);
  console.log(`[DEBUG] useTestPyPI: ${useTestPyPI}, window.DMV_USE_TEST_PYPI: ${window.DMV_USE_TEST_PYPI}`);
  
  if (useTestPyPI) {
    console.log("[DEBUG] Attempting to install from test PyPI first...");
    try {
      // Fetch package info from test PyPI JSON API
      console.log("Fetching package info from test PyPI...");
      const testPypiResponse = await fetch('https://test.pypi.org/pypi/esp-matter-dm-validator/json');
      
      if (!testPypiResponse.ok) {
        throw new Error(`Test PyPI API returned status ${testPypiResponse.status}`);
      }
      
      // Check content type before parsing
      const contentType = testPypiResponse.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        console.warn(`Test PyPI returned unexpected content type: ${contentType}`);
        throw new Error(`Test PyPI returned non-JSON content: ${contentType}`);
      }
      
      const packageInfo = await testPypiResponse.json();
      const latestVersion = packageInfo.info.version;
      console.log(`✅ Found version ${latestVersion} on test PyPI`);
      
      // Try to find a wheel file URL from the JSON response
      let wheelUrl = null;
      
      // The test PyPI JSON API returns URLs in the response
      if (packageInfo.urls && packageInfo.urls.length > 0) {
        // Find a wheel file (prefer universal wheel)
        const wheelFile = packageInfo.urls.find(url => 
          url.packagetype === 'bdist_wheel' && 
          (url.python_version === 'py3' || url.python_version === 'py2.py3' || !url.python_version)
        );
        if (wheelFile && wheelFile.url) {
          wheelUrl = wheelFile.url;
          console.log(`✅ Found wheel URL in package info: ${wheelUrl}`);
        }
      }
      
      // If no wheel found in URLs, try to construct URL from package name
      if (!wheelUrl) {
        console.log("Wheel URL not in package info, trying to construct...");
        const packageName = packageInfo.info.name;
        const packageNameUnderscore = packageName.replace(/-/g, '_');
        const firstLetter = packageName.substring(0, 1).toLowerCase();
        
        // Try different URL patterns for test PyPI
        const possibleUrls = [
          `https://test.pypi.org/packages/py3/${firstLetter}/${packageName}/${packageNameUnderscore}-${latestVersion}-py3-none-any.whl`,
          `https://test.pypi.org/packages/py2.py3/${firstLetter}/${packageName}/${packageNameUnderscore}-${latestVersion}-py2.py3-none-any.whl`,
          `https://test.pypi.org/packages/any/${firstLetter}/${packageName}/${packageNameUnderscore}-${latestVersion}-py3-none-any.whl`
        ];
        
        console.log("Testing possible wheel URLs...");
        // Try each URL until one works
        for (const url of possibleUrls) {
          try {
            const testResponse = await fetch(url, { method: 'HEAD' });
            if (testResponse.ok) {
              wheelUrl = url;
              console.log(`✅ Found wheel at: ${wheelUrl}`);
              break;
            }
          } catch (e) {
            // Try next URL
            continue;
          }
        }
      }
      
      if (!wheelUrl) {
        throw new Error("Could not determine wheel file URL from test PyPI");
      }
      
      console.log(`📦 Installing from test PyPI wheel: ${wheelUrl}`);
      
      // Install the wheel directly
      await pyodide.runPythonAsync(`
        import micropip
        await micropip.install(['${wheelUrl}'], deps=False)
      `);
      pythonModulesLoaded = true;
      console.log("✅ Successfully installed Python modules from test PyPI wheel");
      return; // Success, exit early
      
    } catch (testPypiError) {
      console.error("❌ Failed to install from test PyPI:", testPypiError);
      console.log("Falling back to regular PyPI...");
      // Fall through to regular PyPI attempt below
    }
  }
  
  // Fallback to regular PyPI (or if useTestPyPI is false)
  try {
    console.log("Attempting to install from regular PyPI...");
    await pyodide.runPythonAsync(`
      import micropip
      await micropip.install(['esp-matter-dm-validator'], deps=False)
    `);
    pythonModulesLoaded = true;
    console.log("✅ Python modules installed from PyPI");
  } catch (pipError) {
    console.error("❌ Could not install from PyPI:", pipError);
    
    // Last resort: try installing with index URL pointing to test PyPI
    try {
      console.log("Attempting to install from test PyPI using index URL...");
      await pyodide.runPythonAsync(`
        import micropip
        await micropip.install(['esp-matter-dm-validator'], deps=False, index_urls=['https://test.pypi.org/simple/'])
      `);
      pythonModulesLoaded = true;
      console.log("✅ Python modules installed from test PyPI via index URL");
    } catch (testPipError) {
      console.error("❌ Could not install from test PyPI index:", testPipError);
      throw new Error("Python package not available. Please configure DMV_PACKAGE_URL or ensure package is installable. Error: " + pipError.message);
    }
  }

  // Load validation data files into Pyodide filesystem
  console.log("Loading validation data files...");
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
        console.log(`✅ Loaded validation data for version ${version}`);
      }
    } catch (e) {
      console.warn(`⚠️ Could not load validation data for version ${version}:`, e);
    }
  }

  // Patch BASE_DIR in Python to point to /data
  // The conformance_checker uses BASE_DIR/data/validation_data_{version}.json
  try {
    await pyodide.runPythonAsync(`
      import sys
      import os
      # Patch the BASE_DIR in conformance_checker module
      import dmv_tool.validators.conformance_checker as cc
      
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
    console.log("✅ Successfully patched conformance_checker module");
  } catch (patchError) {
    console.warn("⚠️ Could not patch conformance_checker module (this is OK if validation data files are available in package):", patchError);
    // Continue anyway - the package might have its own data files
  }

  console.log("✅ Bundled modules and data loaded successfully");
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
      from dmv_tool.parsers.wildcard_logs import parse_datamodel_logs
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
      from dmv_tool.validators.conformance_checker import detect_spec_version_from_parsed_data
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
      from dmv_tool.validators.conformance_checker import validate_device_conformance
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
      from dmv_tool.configs.constants import SUPPORTED_SPEC_VERSIONS
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
    let errorMessage = error.message || 'Unknown error occurred';
    let troubleshootingTips = '';
    
    if (errorMessage.includes('Python package not available')) {
      troubleshootingTips = `
        <div style="margin-top: 20px; padding: 15px; background: #fff3cd; border-radius: 6px; text-align: left; max-width: 600px; margin-left: auto; margin-right: auto;">
          <h4 style="margin-top: 0; color: #856404;"><i class="fas fa-lightbulb"></i> Troubleshooting Tips:</h4>
          <ul style="margin: 10px 0; padding-left: 20px; color: #856404;">
            <li>Check your internet connection</li>
            <li>Try refreshing the page</li>
            <li>Check browser console for detailed error messages</li>
            <li>If deploying on GitHub Pages, ensure the package is available on PyPI</li>
            <li>For local development, use the Flask server instead: <code>python run_validator.py</code></li>
          </ul>
        </div>
      `;
    }
    
    loadingEl.innerHTML = `
      <div style="text-align: center; color: #d32f2f;">
        <i class="fas fa-exclamation-triangle fa-3x" style="margin-bottom: 20px;"></i>
        <h3>Failed to Load Python Runtime</h3>
        <p style="font-weight: 500;">${errorMessage}</p>
        ${troubleshootingTips}
        <p style="margin-top: 20px;">
          <button onclick="window.location.reload()" class="btn btn-primary" style="padding: 10px 20px; cursor: pointer;">
            <i class="fas fa-redo"></i> Refresh Page
          </button>
        </p>
      </div>
    `;
  }
});

