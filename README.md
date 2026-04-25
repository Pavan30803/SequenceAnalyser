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
- Impacted vehicle models, variants, work-content classes, and domestic/export regions.
- Part-shortage impact when shortage files and remaining stock quantities are supplied.
- Scheduled production dates, line sequence numbers, and line-in-time values based on capacity and working-day rules.

The application is built as a Flask backend with a React/Vite frontend. The backend performs file parsing and sequence analysis. The frontend handles the operator workflow, visual dashboards, schedule projection, CSV exports, and reason/outlook annotation.

## System Overview

At a high level, the system works like this:

1. The user opens the web application.
2. The user configures production capacity, start date, holidays, and optional shortage inputs.
3. The user uploads a main sequence report in `.xlsx`, `.xls`, or `.csv` format.
4. The frontend submits the report and shortage metadata to `POST /api/analyze`.
5. The Flask backend reads the uploaded file into a Pandas DataFrame.
6. The backend detects required columns, classifies vehicle records, detects holds and skips, maps shortage columns, and returns JSON.
7. The React frontend normalizes the JSON response.
8. The frontend applies production scheduling rules to the returned preview data.
9. Charts, anomaly tables, hold/skip tables, data preview, shortage heatmap, and inference cards are rendered.
10. The user can annotate reasons/outlooks and export CSV data.

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

1. Enter production capacity.
2. Select the production start date.
3. Add optional holidays.
4. Add optional shortage rows:
   - Part number
   - Reference order
   - Available quantity
   - Variant mapping file
5. Upload the main sequence report.
6. Click `Analyze`.
7. Review:
   - Hold count
   - Skip count
   - Hold/skip charts
   - Out-of-sequence anomaly blocks
   - Skip order table
   - Hold order table
   - Full data preview
   - Shortage impact cards
8. Optionally add skip/hold reasons and outlook dates.
9. Download CSV exports.

## Input File Requirements

### Supported formats

The backend accepts:

- `.xlsx`
- `.xls`
- `.csv`

The upload is rejected if the main sequence filename does not end with one of these extensions.

### Main sequence report

The analyzer attempts to discover important columns by name first, then falls back to positional indexes.

| Logical Field | Preferred Column Name | Fallback Position | Required |
| --- | --- | --- | --- |
| DSN | `DSN`, `Delivery Sequence Number` | Column C / index 2 | No |
| Serial Number | `Serial Number` | Column D / index 3 | Yes |
| Variant | `Variant` | Column G / index 6 | Needed for classification and shortage mapping |
| Description | `Description` | Column H / index 7 | Needed for model/work-content classification |
| Status | `Status` | Column I / index 8 | Needed for skip detection |
| Vehicle Order State | `Vehicle Order State`, `State` | Column J / index 9 | Yes |
| Order Number | `Order Number`, `Order No` | Name only | Optional |

If the serial-number or state column cannot be found, backend processing raises an error.

### Important optional columns

The backend preserves selected optional columns when present:

- `Order Number`
- `Hold Status`
- `Vehicle Start Time`
- `Country`

These are included in hold/skip records and preview output when available.

### Shortage variant files

Each shortage row can include a separate uploaded file. For shortage files:

- Supported formats are the same as the main report.
- Variant values are extracted from Column F / index `5`.
- Values are normalized by trimming whitespace and converting to uppercase.
- Each matching variant in the main sequence is evaluated against available quantity.

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

Analyzes a main sequence file and optional shortage files.

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
| `shortage_files` | Repeated file | No | Variant mapping files. Variants are read from Column F. |

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
analyze_sequence(df, shortages)
```

It returns:

- Summary metrics.
- Hold order records.
- Skip order records.
- Gap/anomaly block records.
- Full preview columns and row data.

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
- If the description has at least six characters and character 6 is `T`, `S`, or `M`, the model is the first six characters.
- Otherwise, if the description has at least five characters, the model is the first five characters.
- Shorter descriptions are used as-is.

### Work content classification

`Work Content` is classified as `HWC` or `LWC`.

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

- Part number
- Reference order
- Available quantity
- Variant mapping file

The backend creates a `shortages` dictionary:

```python
{
  "PART_NUMBER": {
    "variants": {"VARIANT_A", "VARIANT_B"},
    "ref_order": "ORDER123",
    "qty": 10
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
- If available quantity is greater than zero, it is `Covered` and quantity decrements.
- Once quantity reaches zero, connected rows are marked as shortage.

### Preview columns

Each shortage part becomes an inserted preview column. It is inserted after `Hold Status` when that column exists; otherwise, it is appended near the end of the preview.

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

- `selectedFile`: Main uploaded sequence file.
- `dragActive`: Drag/drop UI state.
- `capacity`: Daily production capacity.
- `startDate`: Production start date.
- `holidayInput`: Current holiday date input.
- `holidays`: List of excluded dates.
- `shortages`: User-entered shortage rows.
- `analysis`: Normalized backend analysis result.
- `reasonConfig`: Skip/hold reason and outlook annotations.
- `showLanding`: Whether landing screen is visible.
- `loading`: API request state.
- `toasts`: User feedback notifications.

### Key frontend functions

| Function | Responsibility |
| --- | --- |
| `normalizeData` | Converts backend JSON into stable frontend field names. |
| `createShortageRow` | Creates one editable shortage input row. |
| `runAnalysis` | Builds `FormData`, calls `/api/analyze`, stores result. |
| `applySequence` | Adds line sequence, production date, and line time to preview rows. |
| `buildInference` | Builds shortage impact cards from sequenced preview data. |
| `applySkipHoldReasons` | Inserts reason/outlook columns into preview data. |
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
| `ResultsTable` | Hold/skip detail table with reason/outlook editing. |
| `ReasonControls` | Group-level reason/outlook controls. |
| `OrderCell` | Table cell renderer for state-sensitive values. |
| `Toasts` | User notification stack. |
| `EmptyChart` | Empty chart placeholder. |

## Scheduling and Production Calendar Logic

Production scheduling is performed on the frontend after the backend returns preview data. The backend does not calculate production dates or line-in-time values.

### Starting point

Scheduling starts from the first preview row whose `Status` is:

```text
TRIM LINE
```

Rows before this point receive empty scheduling fields.

### Added scheduling columns

The frontend adds:

- `Line in sequence`
- `Production Date`
- `Line in time`

These are inserted after `Status` when `Status` exists; otherwise, they are inserted at the beginning.

### Working-day rules

`getNextWorkingDay` skips:

- Sundays
- User-entered holidays

Holiday dates use `YYYY-MM-DD` format.

### Capacity and takt time

The frontend uses:

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

### Shift start

Each production day starts at:

```text
07:00 AM
```

### Production breaks

The current React frontend uses these break windows:

| Break | Start | End |
| --- | --- | --- |
| Morning short break | 09:30 | 09:37 |
| Lunch | 11:30 | 12:00 |
| Afternoon short break | 14:30 | 14:37 |
| Evening short break | 18:30 | 18:37 |
| Dinner | 20:30 | 21:00 |
| Midnight short break | 24:00 | 24:07 |

The scheduling functions skip over breaks when assigning line-in-time values.

## Charts, Tables, and Exports

### Charts

The dashboard renders:

- Hold orders by model as a pie chart.
- Skip orders by model as a pie chart.
- Hold orders by vehicle type.
- Hold orders by work content.
- Hold orders by region.
- Skip orders by vehicle type.
- Skip orders by work content.
- Skip orders by region.

Chart tooltips include useful breakdown details where available.

### Tables

The UI includes:

- Out-of-sequence anomaly block table.
- Skip orders table.
- Hold orders table.
- Full data preview table.

The preview table includes all rows returned by the backend, derived backend columns, shortage columns, frontend scheduling columns, and optional reason/outlook fields.

### Reason and outlook annotations

The frontend supports reason/outlook annotation for both skip and hold orders.

Annotations can be entered:

- At group level by `model`.
- At group level by `variant`.
- At individual order level.

Individual order values override group-level values.

Annotations are frontend-only state. They are included in exported CSV data but are not persisted to the backend.

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
2. Upload a known-good main sequence file.
3. Confirm total rows match the source file.
4. Confirm hold count against rows where state is `HOLD`.
5. Confirm skip count against known out-of-sequence `TRIM LINE` rows.
6. Add a shortage file with known variants.
7. Confirm covered rows and shortage rows match available quantity.
8. Enter capacity and start date.
9. Confirm scheduling starts at the first `TRIM LINE` row.
10. Confirm Sundays and holidays are skipped.
11. Download CSV files and inspect columns.
12. Build frontend with `npm run build`.
13. Confirm Flask serves the built React app from `http://127.0.0.1:5050`.

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
- The part number is not blank.
- The shortage file was selected in the same row as the part number.
- The reference order exists if you expect counting to begin at a specific point.

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
- Reason/outlook annotation currently exists only in browser state. Add persistence before relying on it as a durable record.
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
| Reference Order | Order number used as the point where shortage quantity counting starts. |
| Connected Row | A row whose variant is listed in a shortage part's variant file. |
| Covered | A connected row that is still covered by available stock quantity. |
| Shortage | A connected row after available stock quantity has been exhausted. |
