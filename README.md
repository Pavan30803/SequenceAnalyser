# Sequence Analyzer Documentation

## Table of Contents

1. [Purpose](#purpose)
2. [System Overview](#system-overview)
3. [Repository Layout](#repository-layout)
4. [Technology Stack](#technology-stack)
5. [Quick Start](#quick-start)
6. [Runtime Modes](#runtime-modes)
7. [User Workflow](#user-workflow)
8. [Input File Requirements](#input-file-requirements)
9. [Backend Architecture](#backend-architecture)
10. [API Reference](#api-reference)
11. [Analysis Logic](#analysis-logic)
12. [Part Shortage Mapping](#part-shortage-mapping)
13. [Frontend Architecture](#frontend-architecture)
14. [Scheduling and Production Calendar Logic](#scheduling-and-production-calendar-logic)
15. [Charts, Tables, and Exports](#charts-tables-and-exports)
16. [Known Data Encoding Notes](#known-data-encoding-notes)
17. [Development Guide](#development-guide)
18. [Build and Deployment](#build-and-deployment)
19. [Testing and Validation](#testing-and-validation)
20. [Troubleshooting](#troubleshooting)
21. [Maintenance Notes](#maintenance-notes)
22. [Glossary](#glossary)

## Purpose

The Sequence Analyzer is a production-planning web application for analyzing vehicle sequence reports. It helps production, planning, and supply-chain teams identify:

- Vehicle orders that are explicitly marked as `HOLD`.
- Vehicles that appear to be skipped or trapped in an out-of-sequence block.
- Sequence gaps caused by abnormal serial-number movement.
- Impacted vehicle models, variants, HDT work-content classes, and domestic/export regions.
- Part-shortage impact when shortage files and remaining stock quantities are supplied.
- Opening and mid-day MOD report comparison using the same mapped constraints.
- Engine, transmission, and axle status mapping by order number.
- Engine, transmission, and axle status color highlighting in the preview.
- Scheduled production dates, line sequence numbers, release sequence numbers, and line-in-time values based on capacity and working-day rules.
- Current-day plan summary and aggregate delivery status views.

The application is built as a Flask backend with a React/Vite frontend. The backend performs file parsing and sequence analysis. The frontend handles the operator workflow, visual dashboards, schedule projection, CSV exports, and reason/outlook annotation.

## System Overview

At a high level, the system works like this:

1. The user opens the landing page and enters the analyzer.
2. The user selects either the HDT or MDT analyzer. Each can run in its own browser tab.
3. The user configures production capacity, start date, holidays, and optional shortage inputs.
4. The user uploads an opening report and, optionally, a MOD report, engine/transmission status report, and axle status report.
5. The frontend submits each available report and shared mapping metadata to `POST /api/analyze`.
6. The Flask backend reads the uploaded file into a Pandas DataFrame.
7. The backend detects required columns, classifies vehicle records, detects holds and skips, maps shortage/status columns, and returns JSON.
8. The React frontend normalizes the JSON response.
9. The frontend applies HDT or MDT production scheduling rules to the returned preview data.
10. Charts, anomaly tables, hold/skip tables, data preview, shortage heatmap, inference cards, current-day plan summary, and aggregate delivery status are rendered for the selected report view.
11. The user can annotate reasons/outlooks and export CSV data.

## Repository Layout

```text
SequenceAnalyser/
  app.py
  requirements.txt
  DOCUMENTATION.md
  Sequence_Analyzer_Project_Context.md
  index.html
  server.err.log
  server.out.log
  *.XLSX / *.xlsx
  frontend/
    package.json
    package-lock.json
    vite.config.js
    eslint.config.js
    index.html
    README.md
    public/
      favicon.svg
      icons.svg
    src/
      main.jsx
      App.jsx
      App.css
      index.css
      assets/
        hero.png
        react.svg
        vite.svg
```

Important files:

- `app.py`: Flask application, file parser, sequence analyzer, API endpoint, and static serving fallback.
- `requirements.txt`: Python dependencies for the backend.
- `frontend/src/App.jsx`: Main React application, analysis workflow, production scheduling, charts, tables, exports, and annotation logic.
- `frontend/src/App.css`: Primary component styling.
- `frontend/src/index.css`: Global theme and Bootstrap overrides.
- `frontend/vite.config.js`: Vite configuration with `/api` proxy to Flask on port `5050`.
- `index.html`: Legacy standalone HTML interface. Flask serves this only when the React build output is missing.
- `Sequence_Analyzer_Project_Context.md`: Earlier project context note.
- `server.err.log` and `server.out.log`: Local development server logs.
- Sample `.XLSX` workbooks: Example input/reference files for local validation.

## Technology Stack

Backend:

- Python 3.x
- Flask 3.1.0
- Pandas 2.2.3
- NumPy 1.26.4
- OpenPyXL 3.1.5 for modern Excel files
- xlrd 2.0.2 for older Excel files

Frontend:

- React 19
- Vite 8
- Bootstrap 5.3
- Bootstrap Icons
- Chart.js 4
- react-chartjs-2
- chartjs-plugin-datalabels

Development tooling:

- ESLint
- Vite development server
- Flask development server

## Quick Start

### 1. Install backend dependencies

From the repository root:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### 2. Install frontend dependencies

```powershell
cd frontend
npm install
```

### 3. Run the backend

From the repository root:

```powershell
python app.py
```

The Flask server runs at:

```text
http://127.0.0.1:5050
```

### 4. Run the frontend in development mode

In another terminal:

```powershell
cd frontend
npm run dev
```

Vite will print the frontend URL, commonly:

```text
http://localhost:5173
```

The Vite dev server proxies `/api` requests to:

```text
http://127.0.0.1:5050
```

## Runtime Modes

### Full development mode

Use this mode while editing React code:

- Flask backend: `python app.py`
- Vite frontend: `npm run dev`
- Browser: Vite URL, usually `http://localhost:5173`

In this mode, frontend changes hot-reload through Vite.

### Flask-only mode with built frontend

Use this mode when you want Flask to serve the compiled React app:

```powershell
cd frontend
npm run build
cd ..
python app.py
```

Then open:

```text
http://127.0.0.1:5050
```

Flask checks `frontend/dist`. If `frontend/dist/index.html` exists, Flask serves the built React app.

### Flask-only fallback mode

If `frontend/dist/index.html` does not exist, Flask falls back to the root-level `index.html`. This file appears to be an older standalone implementation and should be treated as a fallback or legacy UI.

## User Workflow

The current React UI supports this operator flow:

1. Enter from the landing page.
2. Choose `HDT` or `MDT`.
   - Clicking the inactive line opens a dedicated tab with that analyzer selected.
   - HDT and MDT keep separate saved workspaces in the browser.
3. Enter production capacity.
4. Select the production start date.
5. Open `Settings` to adjust shift timing, breaks, and lunch windows.
6. Upload one or more shortage variant files in Step 2.
   - Part number is derived from the uploaded filename.
   - Dots in the filename are ignored for the part number.
   - User can enter part name, reference order, available quantity, and usage quantity per vehicle for each uploaded file.
7. Upload Step 3 reports:
   - Opening Report: required first.
   - MOD Report: optional mid-day updated report.
   - Engine & Transmission Status Report: optional shared mapping file.
   - Axle Status Report: optional shared status mapping file based on Column B order and Column E color.
   - Frame Status Report: optional HDT shared status mapping file based on Column C DSN and Column AD status.
   - For MOD reports, enter the line sequence number for the first non-skip `TRIM LINE` vehicle.
8. Click `Analyze`.
9. Review Opening, MOD, or HDT Plan analytics using the report-view selector:
   - Hold count
   - Skip count
   - Hold/skip charts
   - Out-of-sequence anomaly blocks
   - Skip order table
   - Hold order table
   - Full data preview
   - Shortage impact cards
   - Aggregate Status Against Delivery, including A/B shift vehicle counts for HDT.
   - Plan message with current-day HDT counts or MDT BUS and longer-wheel-base counts.
10. Use `Save Constraints` below Data Preview to create the day-opening backup.
11. Optionally add skip/hold reasons and outlook dates.
12. Download CSV exports.

Inputs and analysis data are saved in the browser with IndexedDB. Refreshing the page restores the current line's workspace, including uploaded files, shortage mappings, report files, annotations, and analysis results. The `Reset` button clears the saved workspace for the current HDT or MDT tab.

The `Save Constraints` action creates a local backup folder:

```text
Sequence_Backup/YYYY-MM-DD/
```

The dated folder contains:

- `Mapped_Day_Opening_Report.xlsx`
- `Mapped_Day_Opening_Report.csv`
- `Day_Opening_Summary.pdf`
- `source_files/` copies of the opening report, optional MOD report, engine/transmission status report, axle status report, HDT frame status report, and shortage variant files uploaded for constraint mapping.

The PDF records the day-opening summary, chart breakdown values, aggregate engine/transmission/axle/frame coverage, and shortage impact analysis.

## Input File Requirements

### Supported formats

The backend accepts:

- `.xlsx`
- `.xls`
- `.csv`

The upload is rejected if the main sequence filename does not end with one of these extensions.

### Opening and MOD sequence reports

The analyzer attempts to discover important columns by name first, then falls back to positional indexes.

| Logical Field | Preferred Column Name | Fallback Position | Required |
| --- | --- | --- | --- |
| DSN | `DSN`, `Delivery Sequence Number` | Column C / index 2 | No |
| Serial Number | `Serial Number` | Column D / index 3 | Yes |
| Variant | `Variant` | Column G / index 6 | Needed for classification and shortage mapping |
| Description | `Description` | Column H / index 7 | Needed for model classification and HDT work-content classification |
| Status | `Status` | Column I / index 8 | Needed for skip detection |
| Vehicle Order State | `Vehicle Order State`, `State` | Column J / index 9 | Yes |
| Order Number | `Order Number`, `Order No` | Name only | Optional |

If the serial-number or state column cannot be found, backend processing raises an error.

The Opening Report and MOD Report use the same file requirements and analysis logic. Opening is the primary morning report. MOD is an optional mid-shift update that can be uploaded and analyzed later using the same mapped constraints from the opening report.

### Important optional columns

The backend preserves selected optional columns when present:

- `Order Number`
- `Hold Status`
- `Vehicle Start Time`
- `Country`

These are included in hold/skip records and preview output when available.

### Shortage variant files

Each shortage row can include a separate uploaded file. The frontend also supports multi-file upload, creating one shortage detail row for each file. For shortage files:

- Supported formats are the same as the main report.
- Variant values are extracted from Column F / index `5`.
- Values are normalized by trimming whitespace and converting to uppercase.
- Each matching variant in the main sequence is evaluated against available quantity.
- Part number is derived from the uploaded filename, with the extension removed and dots ignored.
- Part name is entered manually by the user and displayed in shortage impact analysis.
- Usage per vehicle defaults to `1`. If usage is higher, stock coverage is calculated by consuming that many parts per connected vehicle.

### Engine and transmission status report

The optional Engine & Transmission Status Report maps additional statuses into the Data Preview.

| Logical Field | Source Position | Notes |
| --- | --- | --- |
| Order Number | Column C / index 2 | Matching uses the last six digits of the numeric order value. |
| Engine status | Column J / index 9 | Inserted into Data Preview. |
| Transmission status | Column L / index 11 | Inserted into Data Preview. |

The backend matches this report to the sequence report by normalized order number. The inserted preview columns are named:

- `Engine status`
- `Transmission status`

They are inserted immediately to the right of `Hold Status` when `Hold Status` is available.

If an engine status is blank after mapping, the backend checks the 11th character from the left in the `Variant`. When that character is `U` or `T`, the engine status is filled as `Rapid Prime`.

### Axle status report

The optional Axle Status Report maps axle availability into the Data Preview.

| Logical Field | Source Position | Notes |
| --- | --- | --- |
| Order Number | Column B / index 1 | Matching uses the last six digits of the numeric order value. |
| Axle color | Column E / index 4 | Cell fill color is converted into a combined status. |

The backend groups all color entries for the same order and derives `Axle status`:

| Derived status | Color rule |
| --- | --- |
| `AVAILABLE` | All mapped color cells are green (`00FF00`). |
| `IN TRANSIT` | Mapped colors are only green (`00FF00`) and/or yellow (`FFFF00`). |
| `WIP` | Any mapped color is orange (`FF9900`). |
| `NOT STARTED` | Any mapped color is grey (`C0C0C0`). |

`Axle status` is inserted before `Country` when that column exists; otherwise, it is appended to the preview.

### Frame status report

The optional HDT Frame Status Report maps frame coverage into the Data Preview. The parser reads `Sheet1` / `Sheet 1` when present.

| Logical Field | Source Position | Notes |
| --- | --- | --- |
| DSN | Column C / index 2 | Matching uses the last six digits of the numeric DSN value. |
| Frame status | Column AD / index 29 | Status text is mapped directly into the preview. |
| Frame note | Column AE / index 30 | Used to detect `Part Shortage` when AD is `To Be Prod`. |

Frame status normalization:

| Source condition | Preview status |
| --- | --- |
| AD is `DICV DOL`, `Transit`, or `SMS FG` | `COVERED` |
| AD is `To Be Prod` and AE mentions `Part Shortage` | `Part Shortage` |
| AD is `To Be Prod` and AE does not mention part shortage | `To Be Prod` |

`Frame status` is inserted immediately to the right of `Axle status` when that column exists; otherwise, it is appended to the preview.

## Backend Architecture

The backend is contained in `app.py`.

### Flask app setup

```python
app = Flask(__name__)
BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIST_DIR = BASE_DIR / 'frontend' / 'dist'
```

The app defines:

- Anti-cache headers for local development.
- File parsing helpers.
- Analysis logic.
- Static frontend serving.
- The `/api/analyze` endpoint.

### Anti-caching behavior

Every response receives:

- `Cache-Control: no-store, no-cache, must-revalidate, post-check=0, pre-check=0, max-age=0`
- `Pragma: no-cache`
- `Expires: -1`

This is useful during development because browser refreshes always request fresh assets/data.

### File parsing

`parse_excel(file_bytes)` tries Excel first:

```python
pd.read_excel(io.BytesIO(file_bytes), header=0)
```

If Excel parsing fails, it falls back to CSV:

```python
pd.read_csv(io.BytesIO(file_bytes), header=0)
```

Column names are converted to strings and stripped of leading/trailing whitespace.

### Static serving

Routes:

- `/`
- `/<path:path>`

Serving order:

1. If a requested file exists under `frontend/dist`, serve it.
2. Else, if `frontend/dist/index.html` exists, serve it.
3. Else, serve the root-level `index.html`.

This allows the same Flask process to serve either the built React app or the legacy fallback page.

## API Reference

### `POST /api/analyze`

Analyzes one sequence file and optional shared mapping files. The frontend calls this endpoint separately for Opening and MOD reports when both are present.

Content type:

```text
multipart/form-data
```

#### Request fields

Main file:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `file` | File | Yes | Main sequence report. Must be `.xlsx`, `.xls`, or `.csv`. |

Shortage fields:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `shortage_parts` | Repeated string | No | Part numbers entered by the user. |
| `shortage_refs` | Repeated string | No | Reference order numbers where shortage counting begins. |
| `shortage_qtys` | Repeated string/integer | No | Available stock quantity after the reference order. |
| `shortage_usages` | Repeated string/integer | No | Part usage per connected vehicle. Defaults to `1`. |
| `shortage_files` | Repeated file | No | Variant mapping files. Variants are read from Column F. |

Status mapping fields:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `engine_status_file` | File | No | Engine/transmission status report. Column C order number maps to Column J engine status and Column L transmission status. |
| `axle_status_file` | File | No | Axle status workbook. Column B order number maps Column E fill colors to an axle status. |

MOD context fields:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `opening_hold_keys` | Repeated string | No | Vehicle/order keys that were `HOLD` in the Opening report. Used so released HOLD vehicles in MOD are not counted as skip vehicles only because their serial breaks sequence. |

Line context fields:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `line_type` | String | No | Analyzer line, `HDT` or `MDT`. Used for line-specific model derivation and frontend scheduling context. Defaults to `HDT`. |

The frontend sends repeated fields in matching order. The backend processes entries up to:

```python
min(len(shortage_parts), len(shortage_files))
```

#### Success response

Status:

```text
200 OK
```

Response shape:

```json
{
  "summary": {
    "dsn_min": 1,
    "dsn_max": 100,
    "total_in_file": 100,
    "total_hold": 2,
    "total_skipped": 3,
    "hold_stratification": {},
    "skip_stratification": {},
    "hold_type_stratification": {},
    "skip_type_stratification": {},
    "hold_wc_stratification": {},
    "skip_wc_stratification": {},
    "hold_region_stratification": {},
    "skip_region_stratification": {},
    "shortage_parts": []
  },
  "hold_orders": [],
  "skip_orders": [],
  "gaps": [],
  "preview_columns": [],
  "preview_data": []
}
```

#### Error responses

Missing main file:

```json
{
  "error": "No main sequence file uploaded"
}
```

Unsupported extension:

```json
{
  "error": "Only .xlsx, .xls, and .csv files are supported"
}
```

Processing error:

```json
{
  "error": "Processing error: <details>"
}
```

## Analysis Logic

The main analysis function is:

```python
analyze_sequence(df, shortages, engine_transmission_statuses=None, axle_statuses=None, opening_hold_keys=None, line_type='HDT')
```

It returns:

- Summary metrics.
- Hold order records.
- Skip order records.
- Gap/anomaly block records.
- Full preview columns and row data.

When an engine/transmission status report is supplied, the backend maps those statuses by normalized order number and inserts `Engine status` and `Transmission status` into the preview data. Order matching uses the last six digits of the numeric order value.

When an axle status report is supplied, the backend reads Column E cell colors with OpenPyXL, groups them by normalized Column B order number, derives `Axle status`, and inserts the result into the preview data.

### Empty file behavior

If the DataFrame is empty, the backend returns a valid empty response with zero counts and empty arrays. This protects the frontend from null/undefined response shapes.

### Column detection

The backend uses dynamic column detection so reports with slightly different headers can still be processed.

Column names are compared after:

- Converting to string.
- Stripping whitespace.
- Converting to uppercase where applicable.

When a known header is missing, positional fallback is used for key fields.

### Derived vehicle fields

The backend adds these derived columns to the preview:

- `Model`
- `Work Content`
- `Region`

They are inserted immediately after `Description` when possible.

### Model extraction

Model extraction is based on the `Description` field:

- Empty or missing descriptions become `Unknown`.
- For MDT bus variants, the model is the first four description characters.
- For other MDT descriptions that start with a numeric token, the model is that token. For example, `917 CHS` becomes `917`.
- For other MDT variants, description characters 5-6 as `RE` or `RD` use the first six characters.
- For other MDT variants, description character 5 as `R` or `C` uses the first five characters.
- Other MDT descriptions use the first four characters.
- If the description has at least six characters and character 6 is `T`, `S`, or `M`, the model is the first six characters.
- Otherwise, if the description has at least five characters, the model is the first five characters.
- Shorter descriptions are used as-is.

### Work content classification

For HDT, `Work Content` is classified as `HWC` or `LWC`.

MDT does not use the High Work Content / Low Work Content concept, so `Work Content` is not added to MDT preview data, hold/skip tables, CSV exports, or W/C charts.

Rules:

- Variant starts with `V83`, `F83`, `M83`, or `L83`: `HWC`
- Description character 5 is `T` and description includes `4X2`: `LWC`
- Description characters 5-6 are `CM`: `HWC`
- First two description characters are numeric and greater than `30`: `HWC`
- Otherwise: `LWC`

### Region classification

`Region` is classified from the variant:

- Variant starts with `V`: `Domestic`
- Otherwise: `Export`

### Vehicle type classification

Vehicle type is added to hold and skip records:

- Variant starts with `V83`, `F83`, `M83`, or `L83`: `Bus`
- Otherwise: `Truck`

### Hold detection

A hold order is any row where:

```text
Vehicle Order State == HOLD
```

Comparison is normalized by stripping whitespace and converting to uppercase.

For each hold record, the backend derives `seq_val` from the last five digits of `Serial Number`.

### Skip/anomaly detection

Skip detection works on the numeric sequence represented by the last five digits of `Serial Number`.

Process:

1. Copy the enriched DataFrame.
2. Strip trailing `.0` from serial values.
3. Extract the last five characters.
4. Convert them to numeric `_seq_int`.
5. Drop rows that cannot produce a valid sequence integer.
6. Walk rows in file order and compare each sequence to the expected next sequence.

A row becomes a skip record only when:

- It is part of an out-of-sequence anomaly block, and
- Its `Status` is `TRIM LINE`.

For MDT, out-of-sequence rows in statuses other than `TRIM LINE` do not reset the last valid sequence anchor and are not counted as skip vehicles. For example, if the last valid `FRAME LOADED` serial is `70975`, a later `FRAME LOADED` row with serial `70956` is ignored for skip anchoring. The next `TRIM LINE` serial `70941` is treated as the skip vehicle, and serial `70976` resumes the normal sequence.

For HDT, the previous anchor behavior is retained: an out-of-sequence row outside `TRIM LINE` can become the new sequence anchor before later `TRIM LINE` rows are evaluated.

For MOD analysis, the frontend sends the vehicle/order keys that were `HOLD` in the Opening report. If one of those vehicles appears in MOD in a non-HOLD state, the backend treats it as released from HOLD and does not count that row as a skip vehicle solely because its serial number does not follow the sequence. Normal skip detection remains unchanged for other vehicles.

The analyzer tracks:

- `last_valid_seq`
- Whether it is currently inside an anomaly block
- The rows in the current anomaly group
- The serial where the anomaly began

When normal sequence resumes, the anomaly block is recorded in `gaps`.

### Gap records

Each gap contains:

| Field | Description |
| --- | --- |
| `from_dsn` | Last valid sequence before the anomaly block. |
| `to_dsn` | Sequence where normal flow resumes, or `End of File`. |
| `skipped_count` | Number of rows in the anomaly block. |
| `skipped_range` | First-to-last anomaly sequence range. |

## Part Shortage Mapping

Part shortage mapping lets the user estimate which vehicles are covered by remaining stock and which will face shortage.

### Shortage setup

For each shortage row, the user enters:

- Variant mapping file
- Part name
- Reference order
- Available quantity
- Usage quantity per vehicle, defaulting to `1`

Part number is derived from the uploaded variant filename. The extension is removed and dots in the filename are ignored.

The backend creates a `shortages` dictionary:

```python
{
  "PART_NUMBER": {
    "variants": {"VARIANT_A", "VARIANT_B"},
    "ref_order": "ORDER123",
    "qty": 10,
    "usage": 1
  }
}
```

### Reference order behavior

If `Order Number` exists in the main sequence and the reference order is found:

- Vehicles before the reference order are marked `Covered`.
- Counting starts at the reference order index.

If the reference order is not found:

- Counting starts from the beginning of the file.

### Quantity behavior

For rows where the main sequence variant is connected to the part:

- If the row is before `start_idx`, it is `Covered`.
- If available quantity is greater than or equal to the usage quantity, it is `Covered` and quantity decrements by the usage quantity.
- Once quantity reaches zero, connected rows are marked as shortage.

Example: if available quantity is `5` and usage is `2`, two vehicles are covered and the next connected vehicle is marked shortage.

### Preview columns

Each shortage part becomes an inserted preview column. It is inserted after `Hold Status` when that column exists; otherwise, it is appended near the end of the preview.

If an engine/transmission status report is uploaded, `Engine status` and `Transmission status` are inserted to the right of `Hold Status` before shortage columns. If an axle status report is uploaded, `Axle status` is inserted before `Country` when available, otherwise near the end of the preview.

### Frontend shortage heatmap

The frontend counts shortage markers per row and applies row classes:

- 1 shortage: light yellow
- 2 shortages: deeper yellow/orange
- 3 shortages: light red
- 4 or more shortages: stronger red

Covered cells receive a covered style. Shortage cells receive a prominent alert style.

## Frontend Architecture

The React app is centered in:

```text
frontend/src/App.jsx
```

It includes:

- Data normalization helpers.
- CSV export helpers.
- Shortage counting and heatmap helpers.
- Reason/outlook annotation helpers.
- Production scheduling functions.
- Chart data builders.
- Reusable UI components.
- Main application state and workflow.

### Application entry point

`frontend/src/main.jsx`:

- Imports Bootstrap CSS and JS.
- Imports Bootstrap Icons.
- Imports global CSS.
- Renders `<App />` into `#root`.

### Main state

The main `App` component stores:

- `reportFiles`: Opening and MOD uploaded sequence files.
- `reportUploadedAt`: Upload timestamps for Opening and MOD reports. The MOD timestamp is used for MOD line-in-time scheduling.
- `modStartSequence`: User-entered line sequence number for the first non-skip MOD `TRIM LINE` vehicle.
- `engineStatusFile`: Optional engine/transmission status report.
- `axleStatusFile`: Optional axle status report.
- `dragActiveReport`: Drag/drop UI state for report cards.
- `capacity`: Daily production capacity.
- `startDate`: Production start date.
- `lineType`: Current analyzer line, `HDT` or `MDT`.
- `holidayInput`: Current holiday date input.
- `holidays`: List of excluded dates.
- `shortages`: User-entered shortage rows.
- `analyses`: Normalized backend analysis results for Opening and MOD.
- `activeReport`: Selected analytics view, Opening, MOD, or HDT Plan.
- `reasonConfig`: Skip/hold reason and outlook annotations.
- `showLanding`: Whether landing screen is visible.
- `loading`: API request state.
- `toasts`: User feedback notifications.

The app also persists the workspace in IndexedDB using a separate key per line type. This persists files, mappings, annotations, analysis results, and active report view across refreshes.

### Key frontend functions

| Function | Responsibility |
| --- | --- |
| `normalizeData` | Converts backend JSON into stable frontend field names. |
| `createShortageRow` | Creates one editable shortage input row. |
| `runAnalysis` | Builds `FormData`, calls `/api/analyze` for each uploaded report, stores results. |
| `applySequence` | Adds line sequence, production date, line time, and release sequence to preview rows. |
| `applyReleaseSequence` | Adds `Release sequence` from the first `PBS` + `CREATED` row, preserving MOD baseline release numbers when available. |
| `buildOpeningHoldKeys` | Builds the Opening HOLD key list used for MOD released-HOLD handling. |
| `buildVehicleKeySet` | Builds lookup keys for skip rows so MOD scheduling can find the first non-skip `TRIM LINE` vehicle. |
| `buildCurrentDayStatusSummary` | Builds the Aggregate Status Against Delivery tables for engine, transmission, and axle status. |
| `buildPlanSummary` | Builds the HDT Plan message and current-day line-in vehicle list from the Opening report. |
| `buildInference` | Builds shortage impact cards from sequenced preview data. |
| `applySkipHoldReasons` | Inserts reason/outlook columns into preview data. |
| `readWorkspace` / `writeWorkspace` / `clearWorkspace` | Persist and restore the browser workspace via IndexedDB. |
| `triggerDownload` | Creates and downloads CSV files in the browser. |
| `buildPieData` | Produces Chart.js pie data. |
| `buildSimpleBarData` | Produces Chart.js bar data. |
| `buildBarOptions` | Configures bar chart labels, tooltips, and datalabel behavior. |

### Reusable frontend components

| Component | Purpose |
| --- | --- |
| `LandingPage` | Initial full-screen entry page. |
| `StatCard` | Summary KPI card. |
| `PieChartCard` | Hold/skip model pie chart panel. |
| `BarChartCard` | Type, work-content, and region chart panel. |
| `StatusSummaryTable` | Aggregate delivery status table for engine, transmission, or axle status counts. |
| `PlanSummaryView` | HDT current-day plan message and line-in vehicle list. |
| `ResultsTable` | Hold/skip detail table with reason/outlook editing. |
| `ReasonControls` | Group-level reason/outlook controls. |
| `OrderCell` | Table cell renderer for state-sensitive values. |
| `Toasts` | User notification stack. |
| `EmptyChart` | Empty chart placeholder. |

## Scheduling and Production Calendar Logic

Production scheduling is performed on the frontend after the backend returns preview data. The backend does not calculate production dates or line-in-time values.

### Starting point

For Opening reports, scheduling starts from the first preview row whose `Status` is:

```text
TRIM LINE
```

Rows before this point receive empty scheduling fields.

For MOD reports:

- The user enters the line sequence number for the first non-skip `TRIM LINE` vehicle.
- The frontend ignores rows that are present in the MOD Skip Orders list when choosing this first MOD scheduling anchor.
- The first non-skip `TRIM LINE` vehicle receives the user-entered line sequence number.
- MOD `Line in time` starts from the timestamp when the MOD file was uploaded.
- After the current shift ends, scheduling rolls to the next working day and then follows the same daily capacity and break logic as the Opening report.
- Rows above the first non-skip `TRIM LINE` scheduling anchor receive empty scheduling fields.

### Added scheduling columns

The frontend adds:

- `Line in sequence`
- `Production Date`
- `Line in time`
- `Release sequence`

These are inserted after `Status` when `Status` exists; otherwise, they are inserted at the beginning.

`Release sequence` starts from the first row whose `Status` is `PBS` and whose order state is `CREATED`. It follows the same daily capacity, Thursday adjustment, working-day, and holiday rules as line sequencing. For MOD reports, an existing Opening release-sequence baseline is reused when the same vehicle/order key is found.

### Working-day rules

`getNextWorkingDay` skips:

- Sundays
- User-entered holidays

Holiday dates use `YYYY-MM-DD` format.

### Capacity and takt time

The frontend uses different timing profiles for HDT and MDT.

HDT uses:

- Standard working minutes: `1070`
- Thursday working minutes: `1010`

For standard days:

```text
takt time = 1070 / capacity
```

For Thursdays:

```text
adjusted capacity = floor(capacity * 1010 / 1070)
takt time = 1010 / adjusted capacity
```

MDT uses a single-shift timing model:

- Working window: `07:00` to `16:45`
- Production minutes: `541`
- Thursday production minutes: `481`

For MDT:

```text
takt time = 541 / capacity
```

For MDT Thursdays:

```text
adjusted capacity = floor(capacity * 481 / 541)
takt time = 481 / adjusted capacity
```

### Shift start

Each production day starts at:

```text
07:00 AM
```

### Production breaks

HDT uses these break windows:

| Break | Start | End |
| --- | --- | --- |
| Morning short break | 09:30 | 09:37 |
| Lunch | 11:30 | 12:00 |
| Afternoon short break | 14:30 | 14:37 |
| Evening short break | 18:30 | 18:37 |
| Dinner | 20:30 | 21:00 |
| Midnight short break | 24:00 | 24:07 |

MDT uses the day-shift breaks only:

| Break | Start | End |
| --- | --- | --- |
| Morning short break | 09:30 | 09:37 |
| Lunch | 11:30 | 12:00 |
| Afternoon short break | 14:30 | 14:37 |

The scheduling functions skip over breaks when assigning line-in-time values.

On Thursdays, both HDT and MDT also include a planned stop from `08:30` to `09:30`.

### MOD shift end behavior

MOD line-in-time scheduling continues from the MOD upload time until the line-specific shift end:

- HDT: `02:20 AM` next day.
- MDT: `04:45 PM` same day.

After the shift end is reached, line sequence resets for the next working day.

## Charts, Tables, and Exports

### Charts

The dashboard renders:

- Hold orders by model as a pie chart.
- Skip orders by model as a pie chart.
- Hold orders by vehicle type.
- Hold orders by work content for HDT.
- Hold orders by region.
- Skip orders by vehicle type.
- Skip orders by work content for HDT.
- Skip orders by region.

Chart tooltips include useful breakdown details where available.

### Tables

The UI includes:

- Opening/MOD analytics view selector.
- Plan & Summary selector view.
- Aggregate Status Against Delivery panel.
- Out-of-sequence anomaly block table.
- Skip orders table.
- Hold orders table.
- Full data preview table.

The preview table includes all rows returned by the backend, derived backend columns, shortage columns, frontend scheduling columns, and optional reason/outlook fields.

When available, preview data also includes:

- `Engine status`
- `Transmission status`
- `Axle status`
- `Frame status` for HDT.

### Aggregate Status Against Delivery

The analytics view includes an `AGGREGATE STATUS AGAINST DELIVERY` panel for the current scheduled production day.

- HDT is split into `A shift` and `B shift`, using `Line in time` before or after `04:45 PM`.
- Shift headers show counts as `<count> Vehicles in sequence`.
- MDT shows one current-day aggregate table set.
- Each table counts statuses for `Engine status`, `Transmission status`, `Axle status`, and HDT `Frame status`.
- Engine and transmission summaries are shown in the first row. Axle and frame coverage summaries are shown below.
- For engine summary counts, `FG`, `Booked not yet stored`, and `Retrieval Trigger Received` are grouped under `FG`.

### Plan view

For Opening analysis, the report selector includes `Plan & Summary`.

For HDT, the Plan view shows a current-day plan message with:

- BUS order count and model split.
- BUS Podest opening FG count from the Podest state column.
- Rapid Prime count and model split.
- Vajra count and model split.
- Special variant counts for `40KL`, `28 ft Balancer`, and `4828RT`.
- BRO count based on descriptions ending in `RB`.
- Current-day line-in vehicle list from the Opening report.

For MDT, the Plan view shows:

- BUS order count and model split. BUS identification uses the same variant-prefix logic as HDT.
- BUS Podest opening FG count from the Podest state column.
- Longer wheel base vehicle count, calculated from current-day line-in Opening rows.
- Current-day line-in vehicle list from the Opening report.

MDT longer wheel base values are assigned from the description using the first matching rule:

| Description pattern | Value |
| --- | --- |
| `3160`, `3760`, `4250`, `4500`, or `3360` | `0` |
| `5100` | `0.2` |
| `5050`, `5300`, or `5900` | `0.22` |
| `6700` | `0.35` |
| Bus with `4800` | `0.22` |
| Truck with `4800`, or no matched pattern | `0` |

The assigned values are summed and rounded up to the next whole number for the displayed Longer wheel base vehicle count.

### Status color highlighting

Engine, transmission, and axle status cells keep their own colors even when the row is also highlighted by shortage impact.

Engine status colors:

| Color | Status text |
| --- | --- |
| Light green | `Consumes`, `Consumed`, `Dressing`, `FG`, `Booked not yet stored`, `Rapid Prime`, `Retrieval Trigger Received` |
| Light yellow | `Paint Area`, `Tested Buffer`, `Fly Wheel Buffer`, `Fly Wheel Area` |
| Light red | Any other non-empty engine status |

Transmission status colors:

| Color | Status text |
| --- | --- |
| Light green | `Dressing`, `Consumed`, `Retrieval Trigger Received`, `Retrieved`, `Retreived`, `FG` |
| Light yellow | `Test Completed Buffer`, `Re-Oil Filled Buffer` |
| Light red | Any other non-empty transmission status |

Axle status colors:

| Color | Status text |
| --- | --- |
| Light green | `AVAILABLE` |
| Light yellow | `IN TRANSIT` |
| Light orange | `WIP` |
| Light red | `NOT STARTED` |

Frame status colors:

| Color | Status text |
| --- | --- |
| Light green | `COVERED` |
| Light orange | `To Be Prod`, `Yet to Start`, `WIP` |
| Light red | `Part Shortage` |

### Reason and outlook annotations

The frontend supports reason/outlook annotation for both skip and hold orders.

Annotations can be entered:

- At group level by `model`.
- At group level by `variant`.
- At individual order level.

Individual order values override group-level values.

Annotations are frontend-only state. They are included in exported CSV data and persisted in browser IndexedDB, but they are not written to the backend database or files.

### CSV exports

The frontend can download:

- Full data preview CSV.
- Hold orders CSV.
- Skip orders CSV.

CSV values are quoted and internal quotes are escaped.

## Known Data Encoding Notes

Some existing source text contains mojibake versions of the warning symbol, such as:

```text
âš ï¸ SHORTAGE
```

The React frontend currently accepts both the intended warning marker and mojibake variants in `SHORTAGE_MARKERS`. This keeps shortage detection working even when the backend or file encoding emits the older encoded text.

If this project is cleaned up later, normalize the backend marker to a plain ASCII value such as:

```text
SHORTAGE
```

or a consistently encoded Unicode value, then update `SHORTAGE_MARKERS` accordingly.

## Development Guide

### Backend development

Run the Flask app:

```powershell
python app.py
```

The app uses `debug=True` and port `5050`.

Important backend functions:

- `parse_excel`: Reads uploaded Excel/CSV bytes into a DataFrame.
- `analyze_sequence`: Applies all domain analysis and returns JSON-compatible data.
- `analyze`: Flask route handler for `POST /api/analyze`.
- `index`: Static frontend/fallback route handler.

### Frontend development

Run Vite:

```powershell
cd frontend
npm run dev
```

Useful scripts:

```powershell
npm run dev
npm run build
npm run lint
npm run preview
```

### Adding a new backend field

To add a field to hold/skip records:

1. Add the value in `build_record_dict` in `app.py`.
2. Include the source column in `extra_cols` if it should be copied dynamically.
3. Update table/export columns in `frontend/src/App.jsx`.
4. Update this documentation if it changes the public response shape.

### Adding a new chart

To add a new chart:

1. Add or compute stratification in the backend summary, or derive it from `analysis.holdOrders` / `analysis.skipOrders` on the frontend.
2. Build Chart.js data using an existing helper or a new helper.
3. Render with `PieChartCard` or `BarChartCard`.
4. Add empty-state handling.

### Adding new shortage behavior

Shortage behavior spans backend and frontend:

- Backend: Maps variants to part columns and marks covered/shortage cells.
- Frontend: Counts shortage markers, styles rows/cells, and builds inference cards.

When changing shortage markers or shortage column semantics, update both sides together.

## Build and Deployment

### Build React assets

```powershell
cd frontend
npm run build
```

This creates:

```text
frontend/dist/
```

### Serve built assets through Flask

```powershell
cd ..
python app.py
```

Open:

```text
http://127.0.0.1:5050
```

### Production notes

The current `app.py` uses Flask's development server:

```python
app.run(debug=True, port=5050)
```

For production or shared internal hosting:

- Disable debug mode.
- Use a production WSGI server.
- Put the app behind an approved reverse proxy if needed.
- Review upload size limits.
- Review file retention and privacy requirements.
- Consider authentication if reports contain sensitive production data.

## Testing and Validation

There is no dedicated automated test suite currently checked into the repository.

Recommended manual validation:

1. Start Flask and Vite.
2. Open HDT and MDT analyzer tabs.
3. Upload a known-good opening sequence file.
4. Confirm total rows match the source file.
5. Confirm hold count against rows where state is `HOLD`.
6. Confirm skip count against known out-of-sequence `TRIM LINE` rows.
7. Add shortage files with known variants.
8. Confirm derived part numbers ignore dots in filenames.
9. Confirm covered rows and shortage rows match available quantity divided by usage quantity.
10. Upload an engine/transmission status report and confirm statuses map by order number.
11. Upload an axle status report and confirm `AVAILABLE`, `IN TRANSIT`, `WIP`, and `NOT STARTED` map from Column E colors.
12. Confirm blank engine statuses become `Rapid Prime` when the 11th variant character is `U` or `T`.
13. Confirm engine/transmission/axle status cell colors match their status groups.
14. Enter capacity and start date.
15. Confirm Opening scheduling starts at the first `TRIM LINE` row.
16. Confirm `Release sequence` starts from the first `PBS` + `CREATED` row.
17. Upload a MOD report, enter the MOD first non-skip `TRIM LINE` sequence, and confirm MOD scheduling starts from the MOD upload time.
18. Confirm Sundays, holidays, normal breaks, and the Thursday `08:30` to `09:30` planned stop are skipped.
19. Confirm Opening/MOD/Plan analytics can be switched where available.
20. Confirm Aggregate Status Against Delivery shows shift counts as `Vehicles in sequence`.
21. Confirm released HOLD vehicles in MOD show `Released` in Skip/Hold reason and are not counted as skip solely because their serial breaks sequence.
22. Refresh the browser and confirm workspace inputs/files/analysis restore.
23. Download CSV files and inspect columns.
24. Build frontend with `npm run build`.
25. Confirm Flask serves the built React app from `http://127.0.0.1:5050`.

Recommended future automated tests:

- Unit tests for `parse_excel`.
- Unit tests for model/work-content/region classification.
- Unit tests for hold detection.
- Unit tests for anomaly block detection.
- Unit tests for shortage quantity depletion.
- Frontend tests for scheduling and break skipping.
- Integration test for `POST /api/analyze` with sample files.

## Troubleshooting

### Flask server does not start

Check that backend dependencies are installed:

```powershell
pip install -r requirements.txt
```

Also confirm port `5050` is free.

### Frontend cannot call `/api/analyze`

Make sure Flask is running at:

```text
http://127.0.0.1:5050
```

In Vite dev mode, `frontend/vite.config.js` proxies `/api` to this address.

### Upload returns unsupported file error

The backend validates the filename extension. Confirm the uploaded file ends with:

- `.xlsx`
- `.xls`
- `.csv`

### Processing error says required columns cannot be found

The analyzer requires:

- `Serial Number` or a usable Column D fallback.
- `Vehicle Order State` / `State` or a usable Column J fallback.

Confirm the source report has a header row and the expected columns.

### Skip orders look lower than expected

Skip records are not every numeric gap. A row is counted as skip only if it is inside an anomaly block and has:

```text
Status == TRIM LINE
```

Rows with other statuses can affect sequence tracking but may not be counted as skip orders.

### Shortage mapping shows no impact

Check:

- The shortage file has variants in Column F.
- Variant strings match the main report after trimming and uppercase conversion.
- The derived part number is not blank after removing the file extension and dots.
- The shortage file was selected in the same row as the part number.
- Usage per vehicle is not higher than the available stock for the vehicles you expect to be covered.
- The reference order exists if you expect counting to begin at a specific point.

### Engine/transmission statuses are blank

Check:

- The status report was uploaded in Step 3.
- Order numbers are in Column C.
- Engine status is in Column J.
- Transmission status is in Column L.
- The status report order number matches the main report by the last six numeric digits.

### Axle statuses are blank

Check:

- The axle status report is an Excel workbook with visible fill colors.
- Order numbers are in Column B.
- Axle status colors are in Column E.
- The axle report order number matches the main report by the last six numeric digits.

### Saved workspace does not restore

The app stores workspace data in browser IndexedDB. Check:

- You are using the same browser and URL origin.
- Browser storage was not cleared.
- Private/incognito mode is not discarding IndexedDB data.
- You did not press `Reset`, which clears the current HDT/MDT workspace.

### React build is not served by Flask

Run:

```powershell
cd frontend
npm run build
```

Then restart Flask. Flask only serves the React build when `frontend/dist/index.html` exists.

### Legacy UI appears instead of React UI

This means `frontend/dist/index.html` is missing. Build the frontend or use the Vite dev server.

## Maintenance Notes

- Keep backend response keys stable because the frontend normalizes specific names such as `hold_orders`, `skip_orders`, `preview_columns`, and `preview_data`.
- Be cautious when changing serial-number parsing. Current business logic depends on the last five digits of `Serial Number`.
- Be cautious when changing `Status == TRIM LINE`. This is the anchor for skip detection and frontend scheduling.
- Workspace state, including reason/outlook annotations and uploaded files, is persisted in browser IndexedDB per line type. It is durable across refreshes in the same browser, but it is not server-side storage.
- The root `index.html` and React app overlap in responsibility. Prefer the React app for new development.
- The checked-in `frontend/node-v24.15.0-win-x64` and `frontend/node.zip` are large runtime artifacts. Consider whether they should remain in source control.
- Logs such as `server.err.log` and `server.out.log` are development artifacts. Consider ignoring them if they are not needed for audit/debug history.

## Glossary

| Term | Meaning |
| --- | --- |
| DSN | Delivery Sequence Number. |
| Serial Number | Source field whose last five digits are used as the sequence integer. |
| Hold Order | A vehicle row whose vehicle order state is `HOLD`. |
| Skip Order | A `TRIM LINE` vehicle row inside an out-of-sequence anomaly block. |
| Anomaly Block | A contiguous sequence of rows where the serial sequence does not follow the expected next value. |
| Variant | Vehicle variant code used for classification and shortage matching. |
| Model | Derived vehicle model from the description field. |
| HWC | High Work Content. |
| LWC | Low Work Content. |
| Domestic | Vehicle whose variant starts with `V`. |
| Export | Vehicle whose variant does not start with `V`. |
| Takt Time | Time interval between planned unit completions, calculated from available minutes and capacity. |
| Line in Sequence | Sequence number assigned to vehicles entering the line from `TRIM LINE`. |
| Release Sequence | Sequence number assigned from the first `PBS` + `CREATED` row. |
| Reference Order | Order number used as the point where shortage quantity counting starts. |
| Usage / Vehicle | Number of pieces of the same part consumed by one connected vehicle. |
| Connected Row | A row whose variant is listed in a shortage part's variant file. |
| Covered | A connected row that is still covered by available stock quantity. |
| Shortage | A connected row after available stock quantity has been exhausted. |
| HDT | Heavy-duty truck analyzer mode. |
| MDT | Medium-duty truck analyzer mode. |
| Opening Report | Morning report used as the first analysis baseline. |
| MOD Report | Mid-day updated report analyzed with the same mapped constraints. |
| Engine/Transmission Status Report | Optional report that maps order number to engine and transmission status. |
| Axle Status Report | Optional workbook that maps order number and cell color to axle status. |
| Aggregate Status Against Delivery | Current-day status summary for engine, transmission, and axle status against sequenced delivery rows. |
| Plan & Summary | Opening report view with current-day plan counts and line-in vehicle list. |
| Released HOLD | A vehicle that was `HOLD` in Opening and appears in MOD in any non-HOLD state. |
