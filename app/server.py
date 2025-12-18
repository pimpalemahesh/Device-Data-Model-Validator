# Copyright 2025 Espressif Systems (Shanghai) PTE LTD
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import json
import logging
import os
import shutil
import sys
import uuid
from datetime import datetime
from datetime import timedelta

from flask import Flask, jsonify, render_template, request, session, redirect

from dmv_tool.parsers.wildcard_logs import parse_datamodel_logs
from dmv_tool.validators.conformance_checker import (validate_device_conformance, detect_spec_version_from_parsed_data)
from dmv_tool.configs.constants import SUPPORTED_SPEC_VERSIONS

current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
sys.path.insert(0, parent_dir)
template_dir = os.path.join(parent_dir, "templates")
static_dir = os.path.join(parent_dir, "static")


def get_available_requirement_versions():
    """Get available validation data versions from dmv_tool package."""
    versions = SUPPORTED_SPEC_VERSIONS
    return sorted(versions)


def validate_device_compliance_from_data(parsed_data, spec_version=None):
    """Validate device compliance using dmv_tool functions.

    This is a wrapper around dmv_tool's validation functions that works
    with in-memory parsed_data instead of file paths.

    Args:
        parsed_data: Parsed device data dictionary
        spec_version: Matter specification version (None for auto-detection)

    Returns:
        Validation results dictionary
    """
    # Auto-detect version if not provided
    if spec_version is None:
        spec_version = detect_spec_version_from_parsed_data(parsed_data)
        if not spec_version:
            raise ValueError("Could not detect Matter specification version")

    # Validate device compliance
    validation_results = validate_device_conformance(parsed_data, spec_version)

    return validation_results

app = Flask(__name__, template_folder=template_dir, static_folder=static_dir)
app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024  # 50MB limit

app.config["SECRET_KEY"] = os.environ.get(
    "SECRET_KEY", "dev-secret-key-change-in-production"
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SESSION_DATA_DIR = "session_data"
os.makedirs(SESSION_DATA_DIR, exist_ok=True)


def get_session_id():
    """Get or create a unique session ID for the current browser session"""
    if "session_id" not in session:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        unique_id = str(uuid.uuid4())
        session["session_id"] = f"{timestamp}_{unique_id}"
        session.permanent = True
        app.permanent_session_lifetime = timedelta(
            hours=24
        )  # Session expires in 24 hours

        session_dir = get_session_directory(session["session_id"])
        os.makedirs(session_dir, exist_ok=True)
        logger.info(f"Created new session: {session['session_id']}")

    return session["session_id"]


def get_session_directory(session_id):
    """Get the directory path for session-specific data

    :param session_id:

    """
    return os.path.join(SESSION_DATA_DIR, session_id)


def get_session_file_path(session_id, file_type):
    """Get the file path for session-specific data

    :param session_id: param file_type:
    :param file_type:

    """
    session_dir = get_session_directory(session_id)
    return os.path.join(session_dir, f"{file_type}.json")


def cleanup_old_sessions():
    """Clean up session directories older than 24 hours"""
    try:
        cutoff_time = datetime.now() - timedelta(hours=24)

        for session_dir_name in os.listdir(SESSION_DATA_DIR):
            session_dir_path = os.path.join(SESSION_DATA_DIR, session_dir_name)

            if not os.path.isdir(session_dir_path):
                continue

            try:
                dir_mtime = datetime.fromtimestamp(os.path.getmtime(session_dir_path))
                if dir_mtime < cutoff_time:
                    shutil.rmtree(session_dir_path)
                    logger.info(f"Cleaned up old session directory: {session_dir_name}")
            except Exception as e:
                logger.error(
                    f"Error checking/removing session directory {session_dir_name}: {e}"
                )

    except Exception as e:
        logger.error(f"Error cleaning up old sessions: {e}")


def cleanup_disconnected_sessions():
    """Clean up sessions that have been disconnected/inactive"""
    try:
        cutoff_time = datetime.now() - timedelta(hours=2)

        for session_dir_name in os.listdir(SESSION_DATA_DIR):
            session_dir_path = os.path.join(SESSION_DATA_DIR, session_dir_name)

            if not os.path.isdir(session_dir_path):
                continue

            try:
                latest_access = datetime.fromtimestamp(
                    os.path.getmtime(session_dir_path)
                )

                for file_name in os.listdir(session_dir_path):
                    file_path = os.path.join(session_dir_path, file_name)
                    if os.path.isfile(file_path):
                        file_time = datetime.fromtimestamp(os.path.getmtime(file_path))
                        if file_time > latest_access:
                            latest_access = file_time

                if latest_access < cutoff_time:
                    shutil.rmtree(session_dir_path)
                    logger.info(
                        f"Cleaned up inactive session directory: {session_dir_name}"
                    )

            except Exception as e:
                logger.error(
                    f"Error checking session activity for {session_dir_name}: {e}"
                )

    except Exception as e:
        logger.error(f"Error cleaning up disconnected sessions: {e}")


def load_session_data(session_id, data_type):
    """Load data for a specific session

    :param session_id: param data_type:
    :param data_type:

    """
    file_path = get_session_file_path(session_id, data_type)
    try:
        if os.path.exists(file_path):
            with open(file_path, "r") as f:
                data = json.load(f)
                os.utime(file_path, None)
                return data
    except Exception as e:
        logger.error(
            f"Error loading session data {data_type} for session {session_id}: {e}"
        )
    return None


def save_session_data(session_id, data_type, data):
    """Save data for a specific session

    :param session_id: param data_type:
    :param data:
    :param data_type:

    """
    session_dir = get_session_directory(session_id)

    os.makedirs(session_dir, exist_ok=True)

    file_path = get_session_file_path(session_id, data_type)
    try:
        with open(file_path, "w") as f:
            json.dump(data, f, indent=2)

        os.utime(session_dir, None)
        return True
    except Exception as e:
        logger.error(
            f"Error saving session data {data_type} for session {session_id}: {e}"
        )
        return False


def clear_session_data(session_id):
    """Clear all data for a specific session

    :param session_id:

    """
    try:
        session_dir = get_session_directory(session_id)
        if os.path.exists(session_dir):
            shutil.rmtree(session_dir)
            logger.info(f"Cleared all data for session {session_id}")
        return True
    except Exception as e:
        logger.error(f"Error clearing session data for session {session_id}: {e}")
        return False


def cleanup_session_on_disconnect(session_id):
    """Clean up session data when user disconnects

    :param session_id:

    """
    try:
        session_dir = get_session_directory(session_id)
        if os.path.exists(session_dir):
            shutil.rmtree(session_dir)
            logger.info(f"Cleaned up session {session_id} on disconnect")
        return True
    except Exception as e:
        logger.error(f"Error cleaning up session {session_id} on disconnect: {e}")
        return False


@app.before_request
def before_request():
    """Clean up old sessions before each request"""
    cleanup_old_sessions()
    cleanup_disconnected_sessions()


@app.teardown_appcontext
def cleanup_on_teardown(exception=None):
    """Clean up session data if needed on request teardown

    :param exception: Default value = None)

    """
    if exception:
        logger.warning(f"Request ended with exception: {exception}")


@app.route("/", methods=["GET", "POST"])
def index():
    """Main page for file upload and results display"""
    session_id = get_session_id()
    parsed_data = None
    validation_data = None
    error = None
    uploaded_filename = None

    logger.info(f"Processing request for session: {session_id}")

    if request.method == "GET":
        validation_complete = request.args.get("validation_complete")
        upload_complete = request.args.get("upload_complete")
        if validation_complete or upload_complete:
            parsed_data = load_session_data(session_id, "parsed_data")
            validation_data = load_session_data(session_id, "validation_results")
            uploaded_filename_data = load_session_data(session_id, "uploaded_filename")
            uploaded_filename = (
                uploaded_filename_data.get("filename")
                if uploaded_filename_data
                else None
            )
        else:
            clear_session_data(session_id)
            parsed_data = None
            validation_data = None
    else:
        validation_data = load_session_data(session_id, "validation_results")

    if request.method == "POST":
        try:
            if "file" not in request.files:
                error = "No file uploaded"
                return render_template(
                    "index.html",
                    parsed_data=parsed_data,
                    validation_data=validation_data,
                    uploaded_filename=uploaded_filename,
                    error=error,
                )

            file = request.files["file"]
            if file.filename == "":
                error = "No file selected"
                return render_template(
                    "index.html",
                    parsed_data=parsed_data,
                    validation_data=validation_data,
                    uploaded_filename=uploaded_filename,
                    error=error,
                )

            if not file.filename.endswith(".txt"):
                error = "Please upload a .txt file"
                return render_template(
                    "index.html",
                    parsed_data=parsed_data,
                    validation_data=validation_data,
                    uploaded_filename=uploaded_filename,
                    error=error,
                )

            uploaded_filename = file.filename

            try:
                file.seek(0, 2)
                file_size = file.tell()
                file.seek(0)

                if file_size > 50 * 1024 * 1024:
                    error = "File too large. Maximum size is 50MB."
                    return render_template(
                        "index.html",
                        parsed_data=parsed_data,
                        validation_data=validation_data,
                        uploaded_filename=uploaded_filename,
                        error=error,
                    )

                try:
                    data = file.read().decode("utf-8")
                except UnicodeDecodeError:
                    try:
                        file.seek(0)
                        data = file.read().decode("latin-1")
                        logger.warning(
                            f"File {file.filename} decoded using latin-1 fallback"
                        )
                    except UnicodeDecodeError as e:
                        error = f"Unable to decode file. Please ensure it's a valid text file: {e}"
                        return render_template(
                            "index.html",
                            parsed_data=parsed_data,
                            validation_data=validation_data,
                            uploaded_filename=uploaded_filename,
                            error=error,
                        )

                logger.info(
                    f"Processing file: {file.filename}, size: {len(data)} bytes for session {session_id}"
                )

                if not data.strip():
                    error = "File appears to be empty"
                    return render_template(
                        "index.html",
                        parsed_data=parsed_data,
                        validation_data=validation_data,
                        uploaded_filename=uploaded_filename,
                        error=error,
                    )

            except Exception as file_error:
                logger.error(f"Error reading file {file.filename}: {file_error}")
                error = f"Error reading file: {str(file_error)}"
                return render_template(
                    "index.html",
                    parsed_data=parsed_data,
                    validation_data=validation_data,
                    uploaded_filename=uploaded_filename,
                    error=error,
                )

            try:
                clear_session_data(session_id)
            except Exception as clear_error:
                logger.warning(f"Failed to clear session data: {clear_error}")

            try:
                parsed_data = parse_datamodel_logs(data)
                if not parsed_data or not isinstance(parsed_data, dict):
                    error = "Failed to parse file data. Please check file format."
                    return render_template(
                        "index.html",
                        parsed_data=None,
                        validation_data=validation_data,
                        uploaded_filename=uploaded_filename,
                        error=error,
                    )
                logger.info(f"Successfully parsed data for session {session_id}")

                current_parse_id = str(uuid.uuid4())
                save_session_data(
                    session_id, "parse_id", {"parse_id": current_parse_id}
                )
            except Exception as parse_error:
                logger.error(
                    f"Error parsing data for session {session_id}: {parse_error}"
                )
                error = f"Error parsing file data: {str(parse_error)}"
                return render_template(
                    "index.html",
                    parsed_data=None,
                    validation_data=validation_data,
                    uploaded_filename=uploaded_filename,
                    error=error,
                )

            try:
                detected_version = detect_spec_version_from_parsed_data(parsed_data)
            except Exception as detection_error:
                logger.warning(
                    f"Version detection failed for session {session_id}: {detection_error}"
                )
                detected_version = None
            if detected_version:
                logger.info(
                    f"Auto-detected chip version: {detected_version} for session {session_id}"
                )
                session_data = {"detected_version": detected_version}
                if not save_session_data(session_id, "detected_version", session_data):
                    logger.warning("Could not save detected version")

                logger.info(
                    f"Auto-validating with detected version {detected_version} for session {session_id}"
                )
                try:
                    if (
                        not isinstance(detected_version, str)
                        or not detected_version.strip()
                    ):
                        logger.warning(
                            f"Invalid detected version format: {detected_version}"
                        )
                    else:
                        try:
                            validation_data = validate_device_compliance_from_data(
                                parsed_data, detected_version.strip()
                            )

                            if validation_data and isinstance(validation_data, dict):
                                if save_session_data(
                                    session_id,
                                    "validation_results",
                                    validation_data,
                                ):
                                    logger.info(
                                        f"Auto-validation completed for session {session_id} "
                                        f"({validation_data.get('summary', {}).get('total_endpoints', 0)} endpoints validated)"
                                    )
                                else:
                                    logger.warning(
                                        "Could not save auto-validation results"
                                    )
                            else:
                                logger.warning(
                                    "Validation returned invalid data structure"
                                )
                        except Exception as validation_error:
                            logger.error(
                                f"Validation process failed for session {session_id}: {validation_error}"
                            )
                except Exception as e:
                    logger.error(
                        f"Auto-validation failed for session {session_id}: {e}"
                    )

            if not save_session_data(session_id, "parsed_data", parsed_data):
                error = "Error saving parsed data"

            if not save_session_data(
                session_id, "uploaded_filename", {"filename": uploaded_filename}
            ):
                logger.warning("Could not save uploaded filename")

            return redirect("/?upload_complete=1")

        except Exception as e:
            logger.error(f"Error processing request for session {session_id}: {str(e)}")
            error = f"Error processing file: {str(e)}"

    detected_version_data = load_session_data(session_id, "detected_version")
    detected_version = (
        detected_version_data.get("detected_version") if detected_version_data else None
    )

    parse_id_data = load_session_data(session_id, "parse_id")
    current_parse_id = parse_id_data.get("parse_id") if parse_id_data else None

    if not validation_data:
        validation_data = load_session_data(session_id, "validation_results")

    return render_template(
        "index.html",
        parsed_data=parsed_data,
        validation_data=validation_data,
        uploaded_filename=uploaded_filename,
        detected_version=detected_version,
        auto_validated=bool(detected_version and validation_data),
        supported_versions=get_available_requirement_versions(),
        error=error,
        parse_id=current_parse_id,
    )


@app.route("/api/validate-compliance", methods=["POST"])
def validate_compliance():
    """API endpoint to validate compliance against a specific version"""
    try:
        session_id = get_session_id()
        data = request.get_json()
        if not data:
            return jsonify({"error": "No JSON data provided"}), 400

        chip_version = data.get("chip_version", "").strip()

        if not chip_version:
            return jsonify({"error": "chip_version is required"}), 400

        parsed_data = load_session_data(session_id, "parsed_data")
        if not parsed_data:
            return (
                jsonify(
                    {
                        "error": "No parsed data found. Please upload and parse a wildcard file first."
                    }
                ),
                400,
            )

        try:
            validation_data = validate_device_compliance_from_data(
                parsed_data, chip_version
            )
        except ValueError as e:
            return (
                jsonify({"error": str(e)}),
                400,
            )
        except Exception as e:
            logger.error(f"Validation error: {e}")
            return (
                jsonify({"error": f"Validation failed: {str(e)}"}),
                500,
            )

        if not save_session_data(session_id, "validation_results", validation_data):
            return jsonify({"error": "Error saving validation results"}), 500

        logger.info(
            f"Compliance validation completed for version {chip_version} for session {session_id}"
        )
        return jsonify(
            {
                "success": True,
                "message": f"Compliance validation completed for version {chip_version}",
                "summary": validation_data.get("summary", {}),
            }
        )

    except Exception as e:
        logger.error(f"Error in validate_compliance for session {session_id}: {str(e)}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/clear-data", methods=["POST"])
def clear_data():
    """API endpoint to clear parsed data and validation results for current session"""
    try:
        session_id = get_session_id()

        if clear_session_data(session_id):
            logger.info(f"Cleared data for session {session_id}")
            return jsonify({"success": True, "message": "Data cleared successfully"})
        else:
            return jsonify({"error": "Failed to clear session data"}), 500

    except Exception as e:
        logger.error(f"Error clearing data for session {session_id}: {e}")
        return jsonify({"error": f"Failed to clear data: {str(e)}"}), 500


@app.route("/api/session-cleanup", methods=["POST"])
def session_cleanup():
    """API endpoint to manually clean up current session (called on page unload)"""
    try:
        if "session_id" in session:
            session_id = session["session_id"]
            logger.info(f"Session cleanup requested for: {session_id}")
            return jsonify({"success": True, "message": "Session marked for cleanup"})
        else:
            return jsonify({"success": True, "message": "No active session"})
    except Exception as e:
        logger.error(f"Error in session cleanup: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/session-heartbeat", methods=["POST"])
def session_heartbeat():
    """API endpoint to keep session active (called periodically by client)"""
    try:
        session_id = get_session_id()

        session_dir = get_session_directory(session_id)
        if os.path.exists(session_dir):
            os.utime(session_dir, None)

        logger.debug(f"Heartbeat received for session: {session_id}")
        return jsonify({"success": True, "session_id": session_id})
    except Exception as e:
        logger.error(f"Error in session heartbeat: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/session-info", methods=["GET"])
def session_info():
    """API endpoint to get current session information (for debugging)"""
    try:
        session_id = get_session_id()
        session_dir = get_session_directory(session_id)

        session_exists = os.path.exists(session_dir)
        session_files = []
        session_size = 0

        if session_exists:
            try:
                for file_name in os.listdir(session_dir):
                    file_path = os.path.join(session_dir, file_name)
                    if os.path.isfile(file_path):
                        file_size = os.path.getsize(file_path)
                        file_mtime = datetime.fromtimestamp(os.path.getmtime(file_path))
                        session_files.append(
                            {
                                "name": file_name,
                                "size": file_size,
                                "modified": file_mtime.isoformat(),
                            }
                        )
                        session_size += file_size
            except Exception as e:
                logger.error(f"Error reading session directory: {e}")

        return jsonify(
            {
                "session_id": session_id,
                "session_directory": session_dir,
                "session_exists": session_exists,
                "session_files": session_files,
                "total_size": session_size,
                "timestamp": datetime.now().isoformat(),
            }
        )
    except Exception as e:
        logger.error(f"Error getting session info: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/session-stats", methods=["GET"])
def session_stats():
    """API endpoint to get overall session statistics (for admin/debugging)"""
    try:
        stats = {
            "total_sessions": 0,
            "active_sessions": 0,
            "total_size": 0,
            "oldest_session": None,
            "newest_session": None,
        }

        if not os.path.exists(SESSION_DATA_DIR):
            return jsonify(stats)

        cutoff_time = datetime.now() - timedelta(hours=2)

        for session_dir_name in os.listdir(SESSION_DATA_DIR):
            session_dir_path = os.path.join(SESSION_DATA_DIR, session_dir_name)

            if not os.path.isdir(session_dir_path):
                continue

            stats["total_sessions"] += 1

            try:
                dir_mtime = datetime.fromtimestamp(os.path.getmtime(session_dir_path))

                if dir_mtime > cutoff_time:
                    stats["active_sessions"] += 1

                if stats["oldest_session"] is None:
                    stats["oldest_session"] = dir_mtime.isoformat()
                else:
                    oldest_time = datetime.fromisoformat(stats["oldest_session"])
                    if dir_mtime < oldest_time:
                        stats["oldest_session"] = dir_mtime.isoformat()

                if stats["newest_session"] is None:
                    stats["newest_session"] = dir_mtime.isoformat()
                else:
                    newest_time = datetime.fromisoformat(stats["newest_session"])
                    if dir_mtime > newest_time:
                        stats["newest_session"] = dir_mtime.isoformat()

                for file_name in os.listdir(session_dir_path):
                    file_path = os.path.join(session_dir_path, file_name)
                    if os.path.isfile(file_path):
                        stats["total_size"] += os.path.getsize(file_path)

            except Exception as e:
                logger.error(
                    f"Error processing session directory {session_dir_name}: {e}"
                )

        return jsonify(stats)
    except Exception as e:
        logger.error(f"Error getting session stats: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/download/<data_type>")
def download_data(data_type):
    """API endpoint to download parsed data or validation results for current session

    :param data_type:

    """
    try:
        session_id = get_session_id()

        if data_type == "parsed":
            data = load_session_data(session_id, "parsed_data")
            filename = "parsed_data.json"
        elif data_type == "validation":
            data = load_session_data(session_id, "validation_results")
            filename = "validation_results.json"
        else:
            return jsonify({"error": "Invalid data type"}), 400

        if not data:
            return jsonify({"error": "Data not found for current session"}), 404

        response = jsonify(data)
        response.headers["Content-Disposition"] = f"attachment; filename={filename}"
        return response

    except Exception as e:
        logger.error(f"Error downloading data for session {session_id}: {str(e)}")
        return jsonify({"error": str(e)}), 500


def main():
    """Main function to run the Flask application"""
    app.run(debug=True, host="0.0.0.0", port=5000)


if __name__ == "__main__":
    main()
