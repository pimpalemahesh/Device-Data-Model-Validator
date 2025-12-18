# Matter Device Data Model Validator

A comprehensive tool for validating Matter device data models against official Matter specifications.

## 📋 Overview

This tool parses wildcard logs from Matter devices and validates the data model against official Matter specifications. It helps identify data model compliance issues early in the development process.

### ⚠️ Important Note

This tool does not guarantee full compliance with Matter specifications. It is intended to assist developers in identifying data model issues early in the development process.

Please note that the validator is currently undergoing active updates and does not provide complete end-to-end validation.

## 🔍 Validation Scope

### ✅ What This Tool Validates

- **Device Type & Cluster Revisions**: Verifies correct revision numbers for device types and clusters
- **Mandatory Clusters**: Checks that all mandatory clusters required by the device type are present
- **Mandatory Attributes & Commands**: Validates that all mandatory attributes and commands are implemented
- **Mandatory Features**: Confirms required features for specific device types are implemented
  (e.g., lighting feature required for level control cluster on extended color light device type)
- **Optional Feature Dependencies**: Validates required attributes and commands when optional features are enabled
  (Limited to single feature dependencies only)

### ⚠️ What This Tool Does NOT Validate

- **Optional Elements**: Optional clusters, attributes, commands, and events beyond mandatory requirements
- **Attribute Values**: Actual values and their bounds are not validated
- **Events**: Not present in wildcard logs, only warnings shown for mandatory events
- **Multiple Feature Dependencies**: Attributes and commands that depend on multiple features
  (e.g., UnoccupiedCoolingSetpoint attribute requires both COOL and OCC features)

## 🚀 Quick Start

### CLI Tool

```bash
pip install -r requirements.txt

python datamodel_parser.py <wildcard.txt> --chip-version <specification-version>
```

```
e.g.
python datamodel_parser.py wildcard_logs.txt --chip-version 1.4.2

#### Check output/validation_report.txt for results
```

### Web Tool

#### Local Development Setup

1. **Install Dependencies**:
   ```bash
   # Create a virtual environment (recommended)
   python3 -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   
   # Install required packages
   pip install -r requirements.txt
   ```

2. **Run the Flask Server**:
   ```bash
   python run_validator.py
   # OR
   python app/server.py
   ```

3. **Access the Application**:
   - Open your browser and navigate to: `http://localhost:5000`
   - The Flask server runs on port 5000 by default

#### GitHub Pages Deployment

For GitHub Pages (static hosting), the application uses Pyodide to run Python code in the browser. The Python package `esp-matter-dm-validator` is automatically loaded from PyPI or test PyPI.

**Note**: If you encounter package loading errors on GitHub Pages:
- Ensure the package is published to PyPI or test PyPI
- Check browser console for detailed error messages
- The application will try multiple fallback methods to load the package

1. **Generate Logs**: Run the following command on your device:
   ```
   ./chip-tool any read-by-id 0xFFFFFFFF 0xFFFFFFFF <node-id> 0xFFFF > wildcard_logs.txt
   ```
2. **Upload**: Drag & drop or choose your wildcard log file
3. **Select Version**: Choose Matter specification version (1.2, 1.3, 1.4, 1.4.1, 1.4.2, master)
4. **Validate**: Click "Validate Compliance"
5. **Review**: See  Detailed Compliance Results

## 🚨 Troubleshooting

### Common Issues

- **"No module named 'flask'"** → Run `pip install -r requirements.txt`
- **"No [TOO] entries found"** → Error in wildcard file format, check your uploaded file
- **"Version X.X not supported"** → This specification version is not supported yet
