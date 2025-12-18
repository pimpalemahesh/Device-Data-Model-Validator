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

import argparse
import io
import json
import logging
import os
import sys

from dmv_tool.parsers.wildcard_logs import parse_datamodel_logs
from dmv_tool.validators.conformance_checker import (
    validate_device_conformance,
    detect_spec_version_from_parsed_data as detect_chip_version_from_parsed_data,
)


try:
    from tabulate import tabulate

    TABULATE_AVAILABLE = True
except ImportError:
    TABULATE_AVAILABLE = False
    print("Note: Install 'tabulate' for better table formatting: pip install tabulate")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def run_compliance_check(input_file, chip_version="auto"):
    """Run compliance check using core modules with auto-detection of chip version

    :param input_file: Path to input file
    :type input_file: str
    :param chip_version: Chip version for requirements ("auto" for auto-detection, or specific version) (Default value = "auto")
    :type chip_version: str
    :returns: Results with status and data
    :rtype: dict

    """
    try:
        if not os.path.exists(input_file):
            raise FileNotFoundError(f"Input file not found: {input_file}")

        if not input_file.endswith(".txt"):
            raise ValueError("Input file must be a .txt file")

        logger.info(f"Reading input file: {input_file}")
        with open(input_file, "r", encoding="utf-8") as f:
            data = f.read()

        if not data.strip():
            raise ValueError("Input file is empty")

        logger.info(f"File size: {len(data)} bytes")

        logger.info("Starting data parsing...")
        parsed_data = parse_datamodel_logs(data)
        logger.info("Data parsing completed successfully")

        final_chip_version = chip_version
        if chip_version == "auto":
            detected_version = detect_chip_version_from_parsed_data(parsed_data)
            if detected_version:
                final_chip_version = detected_version
                logger.info(f"Using auto-detected chip version: {final_chip_version}")
            else:
                final_chip_version = "master"
                logger.info(f"No version detected, using default: {final_chip_version}")
        else:
            logger.info(f"Using manually specified chip version: {final_chip_version}")

        os.makedirs("output", exist_ok=True)
        with open("output/parsed_data.json", "w") as f:
            json.dump(parsed_data, f, indent=2)
        logger.info("Parsed data saved to: output/parsed_data.json")

        logger.info(
            f"Loading element requirements for chip version: {final_chip_version}"
        )

        logger.info("Starting compliance validation...")
        validation_data = validate_device_conformance(parsed_data, final_chip_version)
        logger.info("Compliance validation completed")

        with open("output/validation_results.json", "w") as f:
            json.dump(validation_data, f, indent=2)
        logger.info("Validation results saved to: output/validation_results.json")

        report_text = generate_compliance_report_string(
            validation_data, final_chip_version,
            chip_version == "auto" and final_chip_version != "master"
        )

        with open("output/validation_report.txt", "w") as f:
            f.write(report_text)
        logger.info("Validation report saved to: output/validation_report.txt")

        return {
            "status": "success",
            "parsed_data": parsed_data,
            "validation_data": validation_data,
            "detected_version": final_chip_version,
            "version_auto_detected": chip_version == "auto"
            and final_chip_version != "master",
        }

    except Exception as e:
        logger.error(f"Error during compliance check: {str(e)}")
        return {"status": "error", "error": str(e)}


def get_validation_scope_info():
    """Get information about what the tool validates.


    :returns: Dictionary with validation scope information

    :rtype: dict

    """
    return {
        "mandatory_elements": [
            "Device Type revisions",
            "Cluster revisions",
            "Mandatory attributes (per Matter spec)",
            "Mandatory commands (per Matter spec)",
            "Mandatory features (when applicable)",
            "Duplicate attributes and commands detection",
        ],
        "excluded_from_validation": [
            "Optional elements beyond mandatory set and their dependencies",
            "Attributes values and their bounds",
            "Events (not present in wildcard logs)",
        ],
    }


def generate_compliance_report_string(validation_data, detected_version=None, version_auto_detected=False):
    """Generate the compliance report as a string instead of printing it

    :param validation_data: Validation results data
    :param detected_version: The chip version used for validation
    :param version_auto_detected: Whether version was auto-detected
    :returns: Formatted compliance report as string
    :rtype: str
    """
    import sys
    old_stdout = sys.stdout
    sys.stdout = captured_output = io.StringIO()

    try:
        print_compliance_summary(validation_data, detected_version, version_auto_detected)
        report_text = captured_output.getvalue()
    finally:
        sys.stdout = old_stdout

    return report_text

def print_table(headers, rows, title=None):
    """Print a formatted table using tabulate if available, otherwise simple format

    :param headers: param rows:
    :param title: Default value = None)
    :param rows:

    """
    if title:
        print(f"\n{title}")
        print("=" * len(title))

    if TABULATE_AVAILABLE:
        print(tabulate(rows, headers=headers, tablefmt="grid"))
    else:
        col_widths = [
            max(len(str(header)), max(len(str(row[i])) for row in rows) if rows else 0)
            for i, header in enumerate(headers)
        ]

        header_row = " | ".join(
            str(header).ljust(col_widths[i]) for i, header in enumerate(headers)
        )
        print(header_row)
        print("-" * len(header_row))

        for row in rows:
            row_str = " | ".join(
                str(row[i]).ljust(col_widths[i]) for i in range(len(headers))
            )
            print(row_str)
    print()


def print_compliance_summary(
    validation_data, detected_version=None, version_auto_detected=False
):
    """Print comprehensive compliance summary in tabular format with per-endpoint details

    :param validation_data: Validation results data
    :param detected_version: The chip version used for validation (Default value = None)
    :param version_auto_detected: Whether version was auto-detected (Default value = False)

    """
    if not validation_data:
        print("No validation data available")
        return

    summary = validation_data.get("summary", {})
    endpoints = validation_data.get("endpoints", [])

    total_endpoints = summary.get("total_endpoints", 0)
    compliant_endpoints = summary.get("compliant_endpoints", 0)
    non_compliant_endpoints = summary.get("non_compliant_endpoints", 0)
    total_revision_issues = summary.get("total_revision_issues", 0)
    total_event_warnings = summary.get("total_event_warnings", 0)
    total_duplicate_elements = summary.get("total_duplicate_elements", 0)

    print("\n" + "=" * 80)
    print("MATTER DEVICE COMPLIANCE REPORT")
    print("=" * 80)

    if detected_version:
        print(f"\n🔍 VERSION DETECTION")
        print("=" * 30)
        if version_auto_detected:
            print(f"✅ Auto-detected chip version: {detected_version}")
            print("   (Detected from SpecificationVersion in wildcard logs)")
        else:
            print(f"📋 Using specified chip version: {detected_version}")
        print(f"📚 Validation against Matter {detected_version} specification")

    compliance_rate = (
        (compliant_endpoints / total_endpoints * 100) if total_endpoints > 0 else 0
    )
    overall_status = (
        "✅ COMPLIANT" if non_compliant_endpoints == 0 else "❌ NON-COMPLIANT"
    )

    summary_data = [
        ["Total Endpoints", total_endpoints],
        ["Compliant Endpoints", compliant_endpoints],
        ["Non-Compliant Endpoints", non_compliant_endpoints],
        ["Compliance Rate", f"{compliance_rate:.1f}%"],
        ["Total Duplicate Elements", total_duplicate_elements],
        ["Total Revision Issues", total_revision_issues],
        ["Total Event Warnings", total_event_warnings],
        ["Overall Status", overall_status],
    ]

    print_table(["Metric", "Value"], summary_data, "📊 OVERALL COMPLIANCE SUMMARY")

    endpoint_overview_rows = []
    for endpoint in endpoints:
        endpoint_id = endpoint.get("endpoint", "Unknown")
        is_compliant = endpoint.get("is_compliant", False)
        device_types = endpoint.get("device_types", [])
        missing_count = len(endpoint.get("missing_elements", []))
        duplicate_count = len(endpoint.get("duplicate_elements", []))
        revision_issues_count = len(endpoint.get("revision_issues", []))
        event_warnings_count = len(endpoint.get("event_warnings", []))

        status = "✅ Compliant" if is_compliant else "❌ Non-Compliant"
        device_types_str = ", ".join(
            [
                dt.get("device_type_name", "Unknown")
                for dt in device_types
                if dt.get("device_type_name")
            ]
        )

        endpoint_overview_rows.append(
            [
                endpoint_id,
                status,
                (
                    device_types_str[:40] + "..."
                    if len(device_types_str) > 40
                    else device_types_str
                ),
                missing_count,
                duplicate_count,
                revision_issues_count,
                event_warnings_count,
            ]
        )

    print_table(
        [
            "Endpoint",
            "Status",
            "Device Type Names",
            "Missing",
            "Duplicates",
            "Rev Issues",
            "Warnings",
        ],
        endpoint_overview_rows,
        "🔌 ENDPOINTS QUICK OVERVIEW",
    )

    print("\n" + "=" * 80)
    print("📋 PER-ENDPOINT DETAILED COMPLIANCE ANALYSIS")
    print("=" * 80)

    for i, endpoint in enumerate(endpoints):
        endpoint_id = endpoint.get("endpoint", "Unknown")
        is_compliant = endpoint.get("is_compliant", False)
        device_types = endpoint.get("device_types", [])
        missing_elements = endpoint.get("missing_elements", [])
        duplicate_elements = endpoint.get("duplicate_elements", [])
        revision_issues = endpoint.get("revision_issues", [])
        event_warnings = endpoint.get("event_warnings", [])

        if device_types:
            device_type_rows = []
            for dt in device_types:
                if "error" in dt:
                    device_type_rows.append(
                        [
                            "Error",
                            "Error",
                            "❌ Error",
                            0,
                            dt.get("error", "Unknown error")[:50] + "...",
                        ]
                    )
                else:
                    dt_id = dt.get("device_type_id", "Unknown")
                    dt_name = dt.get("device_type_name", "Unknown")
                    dt_compliant = dt.get("is_compliant", False)
                    clusters_count = len(dt.get("cluster_validations", []))

                    status = "✅ Compliant" if dt_compliant else "❌ Non-Compliant"

                    device_type_rows.append([dt_id, dt_name, status, clusters_count])

            print_table(
                ["Type ID", "Type Name", "Status", "Clusters"],
                device_type_rows,
                f"📋 Endpoint {endpoint_id} Device Types",
            )

        cluster_rows = []
        for dt in device_types:
            if "cluster_validations" in dt:
                for cluster in dt.get("cluster_validations", []):
                    cluster_id = cluster.get("cluster_id", "Unknown")
                    cluster_name = cluster.get("cluster_name", "Unknown")
                    cluster_type = cluster.get("cluster_type", "server")
                    device_type_name = dt.get("device_type_name", "Unknown")
                    is_cluster_compliant = cluster.get("is_compliant", False)
                    missing_count = len(cluster.get("missing_elements", []))

                    cluster_revision_issues = cluster.get("revision_issues", [])
                    revision_summary = ""
                    if cluster_revision_issues:
                        error_count = len(
                            [
                                r
                                for r in cluster_revision_issues
                                if r.get("severity") == "error"
                            ]
                        )
                        warning_count = len(
                            [
                                r
                                for r in cluster_revision_issues
                                if r.get("severity") != "error"
                            ]
                        )
                        if error_count > 0:
                            revision_summary = f"🔴 {error_count} errors"
                            if warning_count > 0:
                                revision_summary += f", 🟡 {warning_count} warnings"
                        elif warning_count > 0:
                            revision_summary = f"🟡 {warning_count} warnings"
                    else:
                        revision_summary = "✅ OK"

                    status = (
                        "✅ Compliant" if is_cluster_compliant else "❌ Non-Compliant"
                    )

                    cluster_rows.append(
                        [
                            cluster_id,
                            cluster_name,
                            cluster_type.title(),
                            device_type_name,
                            status,
                            missing_count,
                            revision_summary,
                        ]
                    )

        if cluster_rows:
            print_table(
                [
                    "Cluster ID",
                    "Cluster Name",
                    "Type",
                    "Device Type Name",
                    "Status",
                    "Missing",
                    "Revisions",
                ],
                cluster_rows,
                f"🔧 Endpoint {endpoint_id} Complete Cluster Compliance",
            )

        endpoint_level_warnings = [
            w for w in event_warnings if not w.get("cluster_name")
        ]
        if endpoint_level_warnings:
            event_rows = []
            for warning in endpoint_level_warnings:
                severity = warning.get("severity", "info")
                icon = "🟡" if severity == "warning" else "ℹ️"

                event_rows.append(
                    [
                        warning.get("type", "Unknown"),
                        f"{icon} {severity.title()}",
                        (
                            warning.get("message", "")[:60] + "..."
                            if len(warning.get("message", "")) > 60
                            else warning.get("message", "")
                        ),
                    ]
                )

            print_table(
                ["Event Type", "Severity", "Message"],
                event_rows,
                f"💬 Endpoint {endpoint_id} General Event Warnings",
            )

        print(f"\n🔧 Endpoint {endpoint_id} Recommendations:")
        if not is_compliant:
            device_revision_issue = endpoint.get("revision_issues", [])
            if device_revision_issue:
                print(
                    f"\n   • Fix {len(device_revision_issue)} revision issues listed below"
                )
                for revision_issue in device_revision_issue:
                    print(
                        f"\t   • For {revision_issue.get('item_name', 'Unknown')}, revision on device is {revision_issue.get('actual_revision', 'Unknown')} but the required revision is {revision_issue.get('required_revision', 'Unknown')}"
                    )

            if missing_elements:
                print(
                    f"\n   • Fix {len(missing_elements)} missing elements listed below"
                )
                print(
                    f"   • Make sure to add the missing elements to the respective clusters"
                )
                for missing_element in missing_elements:
                    print(
                        f"\t   • {missing_element.get('name', 'Unknown')} {missing_element.get('type', 'Unknown')} is missing on {missing_element.get('cluster_name', 'Unknown')} cluster. {missing_element.get('message', '')}"
                    )

            if duplicate_elements:
                print(
                    f"\n   • Fix {len(duplicate_elements)} duplicate elements listed below"
                )
                print(
                    f"   • Remove duplicate entries from the respective clusters"
                )
                for duplicate_element in duplicate_elements:
                    print(
                        f"\t   • {duplicate_element.get('name', 'Unknown')} ({duplicate_element.get('id', 'Unknown')}) is duplicated {duplicate_element.get('count', 0)} times on {duplicate_element.get('cluster_name', 'Unknown')} cluster"
                    )

            total_cluster_revision_errors = 0
            for dt in device_types:
                for cluster in dt.get("cluster_validations", []):
                    cluster_revision_issues = cluster.get("revision_issues", [])
                    total_cluster_revision_errors += len(
                        [
                            r
                            for r in cluster_revision_issues
                            if r.get("severity") == "error"
                        ]
                    )

        else:
            print("   • ✅ Endpoint is compliant - no action needed")

        if event_warnings:
            print(f"\n   • ℹ️ Review the below event warnings (informational only)")
            for event_warning in event_warnings:
                (
                    print(
                        f"\t   •Make sure {event_warning.get('event_name', 'Unknown')} event is present on {event_warning.get('cluster_name', 'Unknown')} cluster"
                    )
                    if event_warning.get("type", "unknown") == "event_requirement"
                    else None
                )

    print(f"\n{'=' * 80}")
    print("🎯 OVERALL RECOMMENDATIONS")
    print(f"{'=' * 80}")

    if non_compliant_endpoints > 0:
        print(f"• Fix compliance issues in {non_compliant_endpoints} endpoint(s)")
        print("• Focus on endpoints marked as ❌ Non-Compliant above")
        print("• Check per-endpoint missing elements and revision issues")
        if total_duplicate_elements > 0:
            print(f"• Remove {total_duplicate_elements} duplicate element(s) from device clusters")
        if total_revision_issues > 0:
            print("• Update firmware to meet required revisions")
    else:
        print("🎉 CONGRATULATIONS: All endpoints are fully compliant!")
        print("• Device meets Matter specification requirements")
        print("• All required elements are present and properly implemented")

    if total_event_warnings > 0:
        print(
            f"• Review {total_event_warnings} event warnings (don't affect compliance)"
        )

    print(f"\n{'=' * 80}")
    print("📋 Validation Scope")
    print(f"{'=' * 80}")

    validation_scope = get_validation_scope_info()

    print("\n✅ MANDATORY ELEMENTS CHECKED:")
    for item in validation_scope["mandatory_elements"]:
        print(f"   • {item}")

    print("\n⚠️ NOT VALIDATED (OPTIONAL/PROVISIONAL/DISALLOWED/DEPRECATED):")
    for item in validation_scope["excluded_from_validation"]:
        print(f"   • {item}")

    print("\n📁 Detailed results saved in:")
    print("   • output/parsed_data.json - Raw parsed device data")
    print("   • output/validation_results.json - Complete validation results")
    print("=" * 80)


def run_cli_mode():
    """Run in CLI mode for terminal usage"""
    parser = argparse.ArgumentParser(
        description="Matter Device Compliance Parser - Tabular results with JSON export"
    )
    parser.add_argument("input_file", nargs="?", help="Input log file (.txt) to parse")
    parser.add_argument(
        "--chip-version",
        default="auto",
        help="Chip version for element requirements (default: auto-detect from logs, fallback: master). Supported: 1.2, 1.3, 1.4, 1.4.1, 1.4.2, master",
    )
    parser.add_argument(
        "--quiet",
        "-q",
        action="store_true",
        help="Result will not be shown in terminal. Only JSON files will be generated.",
    )

    args = parser.parse_args()

    if not args.input_file:
        print("Error: Wildcard file is required")
        return 2

    if args.quiet:
        logging.getLogger().setLevel(logging.ERROR)
    else:
        logging.getLogger().setLevel(logging.INFO)

    print(f"🔍 Running compliance check on: {args.input_file}")
    print(f"📋 Chip version: {args.chip_version}")

    results = run_compliance_check(args.input_file, args.chip_version)

    if results["status"] == "success":
        if not args.quiet:
            print_compliance_summary(
                results["validation_data"],
                results["detected_version"],
                results["version_auto_detected"],
            )

        summary = results["validation_data"].get("summary", {})
        if summary.get("non_compliant_endpoints", 1) == 0:
            if not args.quiet:
                print("\n✅ COMPLIANCE CHECK PASSED")
            return 0
        else:
            if not args.quiet:
                print("\n❌ COMPLIANCE CHECK FAILED")
            return 1
    else:
        print(f"\n🔴 ERROR: {results['error']}")
        return 2


def main():
    """Main function - run CLI mode"""
    return run_cli_mode()


if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)
