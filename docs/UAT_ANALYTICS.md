# User Acceptance Testing (UAT) - Analytics & Reporting Module

This document outlines the test scenarios to verify the functionality, security, and export capabilities of the StokPal Analytics module.

## UAT-01: Access Control & Dashboard Integration
**Goal**: Verify that only authorized users (Admin/Treasurer) can see and access the analytics features.
*   **Step 1**: Log in as a user with a **Member** role. Observe the dashboard actions.
    *   *Expected Result*: The "📊 Analytics Reports" button is NOT visible.
*   **Step 2**: Log in as a user with an **Admin** or **Treasurer** role. Observe the dashboard actions.
    *   *Expected Result*: The "📊 Analytics Reports" button IS visible and clickable.

## UAT-02: Member Compliance Report
**Goal**: Verify correct calculation of member contribution compliance.
*   **Step 1**: Navigate to the Analytics page.
*   **Step 2**: Select "Member Contribution Compliance" and click **Generate Report**.
*   **Expected Result**:
    *   Table displays members with their "Compliance %" (Confirmed / Total Due).
    *   Summary cards show "Avg Compliance", "Total Confirmed", and "Total Missed".

## UAT-03: Payout History & Projections
**Goal**: Verify the payout schedule reporting.
*   **Step 1**: Select "Payout History & Projections" and click **Generate Report**.
*   **Expected Result**:
    *   Table lists payouts with "Paid" status for past dates and "Upcoming" for future dates.
    *   Summary cards show "Total Payout Volume" and the date of the "Next Payout".

## UAT-04: Date Filtering (Custom Report)
**Goal**: Verify date-range filtering for transactions.
*   **Step 1**: Select "Custom Contribution View".
*   **Step 2**: Select a "From Date" and "To Date" (e.g., last 30 days).
*   **Step 3**: Click **Generate Report**.
*   **Expected Result**: Only transactions within the specified date range appear in the table.

## UAT-05: CSV Export
**Goal**: Verify data portability.
*   **Step 1**: Generate any report.
*   **Step 2**: Click **📥 Export CSV**.
*   **Expected Result**: A CSV file is downloaded containing all the data currently visible in the report table.

## UAT-06: PDF/Print Export
**Goal**: Verify professional document generation.
*   **Step 1**: Generate any report.
*   **Step 2**: Click **🖨️ Print PDF**.
*   **Expected Result**: Browser print dialog opens. The preview shows a clean report layout with the StokPal logo, report title, and metadata, excluding UI elements like navigation bars and buttons.

## UAT-07: Cross-Group Security (RBAC)
**Goal**: Ensure permission checks are group-specific.
*   **Step 1**: Log in as a user who is an Admin in "Group A" but a regular Member in "Group B".
*   **Step 2**: Select "Group A" in the dropdown. -> *Expected*: Access is granted.
*   **Step 3**: Select "Group B" in the dropdown.
*   **Expected Result**: Access is denied. The "Generate Report" button is disabled, and an error message ("Access Denied") is displayed for Group B.
