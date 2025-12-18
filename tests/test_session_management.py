#!/usr/bin/env python3
"""
Test script to verify session management functionality.
This script tests the unique session creation and cleanup mechanisms.
"""
import json
import os
import shutil
import signal
import subprocess
import sys
import time
from datetime import datetime

import requests

# Configuration
BASE_URL = "http://localhost:5000"
SESSION_DATA_DIR = "session_data"


class TestSessionManagement:
    """Test session management functionality"""

    server_process = None

    @classmethod
    def setup_class(cls):
        """Setup the test environment"""
        print("Setting up test environment...")

        # Start the server in the background
        try:
            # Set up environment to include current directory in Python path
            env = os.environ.copy()
            current_dir = os.getcwd()
            if "PYTHONPATH" in env:
                env["PYTHONPATH"] = f"{current_dir}:{env['PYTHONPATH']}"
            else:
                env["PYTHONPATH"] = current_dir

            cls.server_process = subprocess.Popen(
                [sys.executable, "app/server.py"],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                preexec_fn=os.setsid,
                env=env,
            )

            # Wait for server to start
            time.sleep(5)  # Increased wait time

            # Test if server is running
            try:
                response = requests.get(f"{BASE_URL}/", timeout=10)
                if response.status_code == 200:
                    print("✅ Server started successfully")
                else:
                    print(
                        f"⚠️ Server responded with status: {response.status_code}"
                    )
            except requests.ConnectionError:
                print("❌ Server failed to start")
                # Print server logs for debugging
                if cls.server_process.poll() is not None:
                    stdout, stderr = cls.server_process.communicate()
                    print(f"Server stdout: {stdout.decode()}")
                    print(f"Server stderr: {stderr.decode()}")
                raise Exception("Server startup failed")

        except Exception as e:
            print(f"❌ Error starting server: {e}")
            raise

    @classmethod
    def teardown_class(cls):
        """Teardown the test environment"""
        print("Tearing down test environment...")

        # Kill the server process group
        if cls.server_process:
            try:
                # Kill the process group to ensure all child processes are terminated
                os.killpg(os.getpgid(cls.server_process.pid), signal.SIGTERM)
                cls.server_process.wait(timeout=5)
                print("✅ Server stopped successfully")
            except subprocess.TimeoutExpired:
                # Force kill if it doesn't stop gracefully
                os.killpg(os.getpgid(cls.server_process.pid), signal.SIGKILL)
                print("⚠️ Server force killed")
            except Exception as e:
                print(f"⚠️ Error stopping server: {e}")

    def test_session_creation(self):
        """Test that each browser session gets a unique session ID"""
        print("\n" + "=" * 50)
        print("Testing session creation...")
        print("=" * 50)

        # Create multiple session requests
        sessions = []
        for i in range(3):
            session = requests.Session()

            # Make a request to create a session
            try:
                response = session.get(f"{BASE_URL}/", timeout=10)
                if response.status_code == 200:
                    print(f"✅ Session {i+1} created successfully")

                    # Get session info
                    info_response = session.get(f"{BASE_URL}/api/session-info",
                                                timeout=10)
                    if info_response.status_code == 200:
                        session_info = info_response.json()
                        session_id = session_info["session_id"]
                        print(f"   Session ID: {session_id}")
                        sessions.append({
                            "session":
                            session,
                            "session_id":
                            session_id,
                            "directory":
                            session_info["session_directory"],
                        })
                    else:
                        print(
                            f"❌ Failed to get session info for session {i+1}")
                else:
                    print(
                        f"❌ Failed to create session {i+1}, status: {response.status_code}"
                    )
            except requests.RequestException as e:
                print(f"❌ Request failed for session {i+1}: {e}")

        # Verify all sessions have unique IDs
        session_ids = [s["session_id"] for s in sessions]
        if len(set(session_ids)) == len(session_ids):
            print("✅ All sessions have unique IDs")
        else:
            print("❌ Some sessions have duplicate IDs")
            print(f"   Session IDs: {session_ids}")

        # Verify session directories exist
        for i, session_data in enumerate(sessions):
            if os.path.exists(session_data["directory"]):
                print(
                    f"✅ Session {i+1} directory exists: {session_data['directory']}"
                )
            else:
                print(
                    f"❌ Session {i+1} directory missing: {session_data['directory']}"
                )

        assert len(sessions) == 3

    def test_session_data_isolation(self):
        """Test that session data is properly isolated"""
        print("\n" + "=" * 50)
        print("Testing session data isolation...")
        print("=" * 50)

        # Create sessions first
        sessions = self.test_session_creation()

        # Upload test data to first session
        if sessions:
            session1 = sessions[0]["session"]

            # Create a simple test file
            test_data = """[TOO] Endpoint: 0 Cluster: 0x001D Attribute 0x0000 DataVersion: 1
DeviceTypeList: 1 entries
[0]: {
  DeviceType: 22
  Revision: 1
}"""

            # Upload file to first session
            try:
                files = {"file": ("test.txt", test_data, "text/plain")}
                upload_response = session1.post(f"{BASE_URL}/",
                                                files=files,
                                                timeout=10)

                if upload_response.status_code == 200:
                    print("✅ File uploaded to session 1")

                    # Wait a moment for processing
                    time.sleep(1)

                    # Check if data exists in first session
                    info_response1 = session1.get(
                        f"{BASE_URL}/api/session-info", timeout=10)
                    if info_response1.status_code == 200:
                        session1_info = info_response1.json()
                        if session1_info["session_files"]:
                            print(
                                f"✅ Session 1 has {len(session1_info['session_files'])} data files"
                            )
                            for file_info in session1_info["session_files"]:
                                print(
                                    f"   - {file_info['name']} ({file_info['size']} bytes)"
                                )
                        else:
                            print("❌ Session 1 has no data files")

                    # Check if other sessions have data (they shouldn't)
                    for i, session_data in enumerate(sessions[1:], 2):
                        try:
                            info_response = session_data["session"].get(
                                f"{BASE_URL}/api/session-info", timeout=10)
                            if info_response.status_code == 200:
                                session_info = info_response.json()
                                if not session_info["session_files"]:
                                    print(
                                        f"✅ Session {i} correctly has no data")
                                else:
                                    print(
                                        f"❌ Session {i} incorrectly has data: {session_info['session_files']}"
                                    )
                            else:
                                print(
                                    f"⚠️ Could not get session info for session {i}"
                                )
                        except requests.RequestException as e:
                            print(f"⚠️ Request failed for session {i}: {e}")
                else:
                    print(
                        f"❌ Failed to upload file to session 1, status: {upload_response.status_code}"
                    )
            except requests.RequestException as e:
                print(f"❌ Upload request failed: {e}")
        else:
            print("❌ No sessions created for isolation test")

        return sessions

    def test_session_cleanup(self):
        """Test session cleanup functionality"""
        print("\n" + "=" * 50)
        print("Testing session cleanup...")
        print("=" * 50)

        # Get initial stats
        try:
            stats_response = requests.get(f"{BASE_URL}/api/session-stats",
                                          timeout=10)
            if stats_response.status_code == 200:
                initial_stats = stats_response.json()
                print(f"Initial sessions: {initial_stats['total_sessions']}")
                print(f"Active sessions: {initial_stats['active_sessions']}")
            else:
                print(
                    f"⚠️ Could not get initial stats, status: {stats_response.status_code}"
                )
        except requests.RequestException as e:
            print(f"⚠️ Failed to get initial stats: {e}")

        # Create a test session and then close it
        session = requests.Session()
        try:
            response = session.get(f"{BASE_URL}/", timeout=10)

            if response.status_code == 200:
                # Get session info
                info_response = session.get(f"{BASE_URL}/api/session-info",
                                            timeout=10)
                if info_response.status_code == 200:
                    session_info = info_response.json()
                    session_dir = session_info["session_directory"]
                    print(
                        f"Created test session: {session_info['session_id']}")

                    # Send cleanup request
                    cleanup_response = session.post(
                        f"{BASE_URL}/api/session-cleanup", timeout=10)
                    if cleanup_response.status_code == 200:
                        print("✅ Session cleanup request sent successfully")
                    else:
                        print(
                            f"❌ Session cleanup request failed, status: {cleanup_response.status_code}"
                        )
                else:
                    print(
                        f"❌ Failed to get session info, status: {info_response.status_code}"
                    )
            else:
                print(
                    f"❌ Failed to create test session, status: {response.status_code}"
                )
        except requests.RequestException as e:
            print(f"❌ Session cleanup test failed: {e}")

        # Wait a moment for cleanup
        time.sleep(2)

        # Get final stats
        try:
            stats_response = requests.get(f"{BASE_URL}/api/session-stats",
                                          timeout=10)
            if stats_response.status_code == 200:
                final_stats = stats_response.json()
                print(f"Final sessions: {final_stats['total_sessions']}")
                print(f"Active sessions: {final_stats['active_sessions']}")
            else:
                print(
                    f"⚠️ Could not get final stats, status: {stats_response.status_code}"
                )
        except requests.RequestException as e:
            print(f"⚠️ Failed to get final stats: {e}")

    def test_session_directory_structure(self):
        """Test that session directories are properly structured"""
        print("\n" + "=" * 50)
        print("Testing session directory structure...")
        print("=" * 50)

        if os.path.exists(SESSION_DATA_DIR):
            print(f"✅ Session data directory exists: {SESSION_DATA_DIR}")

            # List all session directories
            try:
                session_dirs = [
                    d for d in os.listdir(SESSION_DATA_DIR)
                    if os.path.isdir(os.path.join(SESSION_DATA_DIR, d))
                ]

                print(f"Found {len(session_dirs)} session directories")

                for session_dir in session_dirs[:3]:  # Check first 3
                    session_path = os.path.join(SESSION_DATA_DIR, session_dir)
                    try:
                        files = os.listdir(session_path)
                        print(
                            f"   {session_dir}: {len(files)} files - {files}")
                    except OSError as e:
                        print(
                            f"   {session_dir}: Error reading directory - {e}")
            except OSError as e:
                print(f"❌ Error reading session data directory: {e}")
        else:
            print(
                f"❌ Session data directory doesn't exist: {SESSION_DATA_DIR}")

    def run_all_tests(self):
        """Run all session management tests"""
        print("=" * 60)
        print("SESSION MANAGEMENT TESTS")
        print("=" * 60)

        try:
            # Test basic session functionality
            self.test_session_creation()
            self.test_session_data_isolation()
            self.test_session_cleanup()
            self.test_session_directory_structure()

            print("\n" + "=" * 60)
            print("SESSION TESTS COMPLETED")
            print("=" * 60)

        except requests.ConnectionError:
            print(
                "❌ Could not connect to server. Make sure the Flask app is running on localhost:5000"
            )
        except Exception as e:
            print(f"❌ Test failed with error: {e}")


def main():
    """Run all session management tests"""
    test_runner = TestSessionManagement()

    try:
        # Setup
        TestSessionManagement.setup_class()

        # Run tests
        test_runner.run_all_tests()

    except Exception as e:
        print(f"❌ Test setup failed: {e}")
    finally:
        # Cleanup
        TestSessionManagement.teardown_class()


if __name__ == "__main__":
    main()
