from pathlib import Path

from flask import Flask, request, jsonify, send_file
import pandas as pd
import io
import json
import re
from datetime import datetime
from openpyxl import load_workbook
from openpyxl.styles.colors import COLOR_INDEX
from werkzeug.utils import secure_filename

app = Flask(__name__)
BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIST_DIR = BASE_DIR / 'frontend' / 'dist'
BACKUP_DIR = BASE_DIR / 'Sequence_Backup'

# --- ANTI-CACHING BLOCK FOR DEVELOPMENT ---
@app.after_request
def add_header(response):
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, post-check=0, pre-check=0, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '-1'
    return response
# ------------------------------------------


@app.errorhandler(413)
def request_entity_too_large(error):
    return jsonify({'error': 'Backup request is too large. Reduce uploaded source files or save fewer attachments.'}), 413

def parse_excel(file_bytes):
    try:
        df = pd.read_excel(io.BytesIO(file_bytes), header=0)
    except Exception:
        df = pd.read_csv(io.BytesIO(file_bytes), header=0)
        
    df.columns = df.columns.astype(str).str.strip()
    return df


def sanitize_backup_name(value, fallback='file'):
    filename = secure_filename(str(value or '').strip())
    return filename or fallback


def parse_json_field(name, fallback):
    raw_value = request.form.get(name)
    if not raw_value:
        return fallback
    try:
        return json.loads(raw_value)
    except json.JSONDecodeError:
        return fallback


def pdf_escape(value):
    return str(value).replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')


def wrap_pdf_line(text, width=96):
    words = str(text).split()
    if not words:
        return ['']
    lines = []
    current = ''
    for word in words:
        candidate = f"{current} {word}".strip()
        if len(candidate) > width and current:
            lines.append(current)
            current = word
        else:
            current = candidate
    lines.append(current)
    return lines


def create_text_pdf(title, sections):
    lines = [title, f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", ""]
    for section_title, section_lines in sections:
        lines.extend([section_title, "-" * min(len(section_title), 80)])
        for line in section_lines:
            lines.extend(wrap_pdf_line(line))
        lines.append("")

    page_size = 48
    pages = [lines[index:index + page_size] for index in range(0, len(lines), page_size)] or [[]]
    objects = []
    pages_kids = []

    def add_object(content):
        objects.append(content)
        return len(objects)

    catalog_id = add_object("<< /Type /Catalog /Pages 2 0 R >>")
    pages_id = add_object("")
    font_id = add_object("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")

    for page_lines in pages:
        text_commands = ["BT", "/F1 10 Tf", "50 790 Td", "14 TL"]
        for line in page_lines:
            text_commands.append(f"({pdf_escape(line)}) Tj")
            text_commands.append("T*")
        text_commands.append("ET")
        stream = "\n".join(text_commands)
        content_id = add_object(f"<< /Length {len(stream.encode('utf-8'))} >>\nstream\n{stream}\nendstream")
        page_id = add_object(
            f"<< /Type /Page /Parent {pages_id} 0 R /MediaBox [0 0 612 842] "
            f"/Resources << /Font << /F1 {font_id} 0 R >> >> /Contents {content_id} 0 R >>"
        )
        pages_kids.append(page_id)

    objects[pages_id - 1] = f"<< /Type /Pages /Kids [{' '.join(f'{kid} 0 R' for kid in pages_kids)}] /Count {len(pages_kids)} >>"

    pdf_parts = ["%PDF-1.4\n"]
    offsets = [0]
    for index, content in enumerate(objects, start=1):
        offsets.append(sum(len(part.encode('utf-8')) for part in pdf_parts))
        pdf_parts.append(f"{index} 0 obj\n{content}\nendobj\n")

    xref_offset = sum(len(part.encode('utf-8')) for part in pdf_parts)
    pdf_parts.append(f"xref\n0 {len(objects) + 1}\n")
    pdf_parts.append("0000000000 65535 f \n")
    for offset in offsets[1:]:
        pdf_parts.append(f"{offset:010d} 00000 n \n")
    pdf_parts.append(f"trailer\n<< /Size {len(objects) + 1} /Root {catalog_id} 0 R >>\nstartxref\n{xref_offset}\n%%EOF")
    return "".join(pdf_parts).encode('utf-8')


def flatten_count_dict(title, values):
    if not isinstance(values, dict) or not values:
        return [f"{title}: No data"]
    return [f"{title}: {key} = {value}" for key, value in sorted(values.items())]


def build_backup_pdf_bytes(line_type, summary, status_summary, inference_cards, mapped_row_count):
    sections = []
    sections.append((
        "Opening Summary",
        [
            f"Line type: {line_type}",
            f"Mapped report rows: {mapped_row_count}",
            f"Hold orders: {summary.get('total_hold', 0) if isinstance(summary, dict) else 0}",
            f"Skip vehicles: {summary.get('total_skipped', 0) if isinstance(summary, dict) else 0}",
        ],
    ))

    if isinstance(summary, dict):
        chart_lines = []
        chart_lines.extend(flatten_count_dict("Hold by model", summary.get('hold_stratification')))
        chart_lines.extend(flatten_count_dict("Skip by model", summary.get('skip_stratification')))
        chart_lines.extend(flatten_count_dict("Hold by type", summary.get('hold_type_stratification')))
        chart_lines.extend(flatten_count_dict("Skip by type", summary.get('skip_type_stratification')))
        chart_lines.extend(flatten_count_dict("Hold by work content", summary.get('hold_wc_stratification')))
        chart_lines.extend(flatten_count_dict("Skip by work content", summary.get('skip_wc_stratification')))
        chart_lines.extend(flatten_count_dict("Hold by region", summary.get('hold_region_stratification')))
        chart_lines.extend(flatten_count_dict("Skip by region", summary.get('skip_region_stratification')))
        sections.append(("Charts", chart_lines))

    status_lines = []
    if isinstance(status_summary, dict):
        status_lines.append(f"Production date: {status_summary.get('currentDay', '')}")
        status_lines.append(f"Vehicles in sequence: {status_summary.get('rowCount', 0)}")
        for shift in status_summary.get('shifts', []) or []:
            status_lines.append(f"{shift.get('label', 'Shift')}: {shift.get('rowCount', 0)} Vehicles in sequence")
            for status_name in ['engine', 'transmission', 'axle', 'frame']:
                status_lines.extend(flatten_count_dict(f"  {status_name.title()}", shift.get(status_name)))
        if not status_summary.get('shifts'):
            for status_name in ['engine', 'transmission', 'axle', 'frame']:
                status_lines.extend(flatten_count_dict(status_name.title(), status_summary.get(status_name)))
    sections.append(("Engine / Transmission / Axle / Frame Coverage", status_lines or ["No status summary available"]))

    shortage_lines = []
    for card in inference_cards if isinstance(inference_cards, list) else []:
        label = f"{card.get('part', '')} {card.get('partName', '')}".strip()
        if card.get('covered'):
            shortage_lines.append(f"{label}: Covered")
        else:
            shortage_lines.append(
                f"{label}: First shortage {card.get('shortageDate', '')} at {card.get('impactTime', '')}; "
                f"sequence {card.get('firstDaySequences', '')}; models {card.get('connectingModels', '')}"
            )
            for entry in card.get('forecast', []) or []:
                shortage_lines.append(
                    f"  {entry.get('date', '')}: Day plan {entry.get('dayPlan', 0)}, Shortage qty {entry.get('shortageQty', 0)}"
                )
    sections.append(("Shortage Impact Analysis", shortage_lines or ["No shortage impact cards available"]))

    return create_text_pdf("Day Opening Constraint Backup", sections)


def save_uploaded_file(file_storage, target_dir, prefix):
    if not file_storage or not file_storage.filename:
        return None
    safe_name = sanitize_backup_name(file_storage.filename, f"{prefix}.dat")
    target = target_dir / f"{prefix}_{safe_name}"
    file_storage.save(target)
    return target.name

def normalize_order_key(value):
    text = str(value).strip()
    if not text or text.lower() == 'nan':
        return ''
    text = text.replace('\u00a0', '').replace(' ', '')
    if text.endswith('.0'):
        text = text[:-2]
    digits = ''.join(ch for ch in text if ch.isdigit())
    return digits[-6:] if len(digits) >= 6 else digits


def normalize_fill_hex(cell):
    for color in (cell.fill.fgColor, cell.fill.start_color, cell.fill.bgColor):
        if color.type == 'rgb' and color.rgb:
            return str(color.rgb)[-6:].upper()
        if color.type == 'indexed' and color.indexed is not None:
            indexed_color = COLOR_INDEX[color.indexed]
            if indexed_color:
                return str(indexed_color)[-6:].upper()
    return ''


def combine_axle_status(colors):
    color_set = {color for color in colors if color}
    if not color_set:
        return ''
    if 'FF9900' in color_set:
        return 'WIP'
    if 'C0C0C0' in color_set:
        return 'NOT STARTED'
    if color_set == {'00FF00'}:
        return 'AVAILABLE'
    if color_set.issubset({'00FF00', 'FFFF00'}):
        return 'IN TRANSIT'
    return ''


def parse_axle_status_report(file_bytes):
    workbook = load_workbook(io.BytesIO(file_bytes), data_only=True)
    sheet = workbook.active
    order_colors = {}

    for row in sheet.iter_rows(min_row=2):
        if len(row) < 5:
            continue
        order_key = normalize_order_key(row[1].value)
        if not order_key:
            continue
        color_hex = normalize_fill_hex(row[4])
        if color_hex:
            order_colors.setdefault(order_key, []).append(color_hex)

    return {
        order_key: combine_axle_status(colors)
        for order_key, colors in order_colors.items()
        if combine_axle_status(colors)
    }


def parse_frame_status_report(file_bytes):
    workbook = load_workbook(io.BytesIO(file_bytes), data_only=True)
    sheet = workbook['Sheet1'] if 'Sheet1' in workbook.sheetnames else workbook['Sheet 1'] if 'Sheet 1' in workbook.sheetnames else workbook.active
    frame_statuses = {}

    for row in sheet.iter_rows(min_row=2):
        if len(row) < 30:
            continue
        dsn_key = normalize_order_key(row[2].value)
        if not dsn_key:
            continue
        status = str(row[29].value or '').strip()
        status_key = status.upper()
        part_shortage_note = str(row[30].value or '').strip() if len(row) > 30 else ''
        part_shortage_key = part_shortage_note.upper()
        if status_key in {'DICV DOL', 'TRANSIT', 'SMS FG'}:
            status = 'COVERED'
        elif status_key == 'TO BE PROD' and 'PART SHORTAGE' in part_shortage_key:
            status = 'Part Shortage'
        if status:
            frame_statuses[dsn_key] = status

    return frame_statuses


def analyze_sequence(df, shortages, engine_transmission_statuses=None, axle_statuses=None, frame_statuses=None, opening_hold_keys=None, line_type='HDT'):
    opening_hold_keys = {normalize_order_key(key) for key in (opening_hold_keys or []) if normalize_order_key(key)}
    line_type = str(line_type or 'HDT').strip().upper()

    if df.empty:
        return {
            'summary': { 
                'dsn_min': 0, 'dsn_max': 0, 'total_in_file': 0, 'total_hold': 0, 'total_skipped': 0, 
                'state_distribution': {}, 'hold_stratification': {}, 'skip_stratification': {}, 
                'hold_type_stratification': {}, 'skip_type_stratification': {}, 
                'hold_wc_stratification': {}, 'skip_wc_stratification': {},
                'hold_region_stratification': {}, 'skip_region_stratification': {},
                'shortage_parts': [] 
            },
            'hold_orders': [], 'skip_orders': [], 'gaps': [], 'preview_columns': [], 'preview_data': []
        }

    original_df = df.copy()

    # DYNAMIC COLUMN IDENTIFICATION
    dsn_col = next((c for c in original_df.columns if str(c).strip().upper() in ['DSN', 'DELIVERY SEQUENCE NUMBER']), None)
    if not dsn_col and len(original_df.columns) > 2:
        dsn_col = original_df.columns[2]

    serial_col = next((c for c in original_df.columns if str(c).strip().upper() == 'SERIAL NUMBER'), None)
    if not serial_col and len(original_df.columns) > 3:
        serial_col = original_df.columns[3]
        
    variant_col = next((c for c in original_df.columns if str(c).strip().upper() == 'VARIANT'), None)
    if not variant_col and len(original_df.columns) > 6:
        variant_col = original_df.columns[6]

    desc_col = next((c for c in original_df.columns if str(c).strip().upper() == 'DESCRIPTION'), None)
    if not desc_col and len(original_df.columns) > 7:
        desc_col = original_df.columns[7]
        
    status_col = next((c for c in original_df.columns if str(c).strip().upper() == 'STATUS'), None)
    if not status_col and len(original_df.columns) > 8:
        status_col = original_df.columns[8]
        
    state_col = next((c for c in original_df.columns if str(c).strip().upper() in ['VEHICLE ORDER STATE', 'STATE']), None)
    if not state_col and len(original_df.columns) > 9:
        state_col = original_df.columns[9]
        
    order_col = next((c for c in original_df.columns if str(c).strip().upper() in ['ORDER NUMBER', 'ORDER NO']), None)

    if not serial_col or not state_col:
        raise ValueError("Required columns (Column D, Column I, or Column J) could not be found in the uploaded file.")

    def get_vehicle_key(row):
        if order_col:
            order_key = normalize_order_key(row.get(order_col, ''))
            if order_key:
                return order_key
        serial_key = normalize_order_key(row.get(serial_col, '')) if serial_col else ''
        if serial_key:
            return serial_key
        return normalize_order_key(row.get(dsn_col, '')) if dsn_col else ''

    def get_vehicle_lookup_keys(row):
        keys = []
        candidate_cols = [order_col, serial_col, dsn_col]
        for fallback_idx in (1, 2, 3):
            if len(original_df.columns) > fallback_idx:
                candidate_cols.append(original_df.columns[fallback_idx])

        for column in candidate_cols:
            if not column:
                continue
            key = normalize_order_key(row.get(column, ''))
            if key and key not in keys:
                keys.append(key)

        return keys

    def get_first_mapped_value(mapping, row, default=''):
        for key in get_vehicle_lookup_keys(row):
            if key in mapping:
                return mapping[key]
        return default

    def is_released_hold_row(row):
        if not opening_hold_keys:
            return False
        vehicle_key = get_vehicle_key(row)
        current_state = str(row.get(state_col, '')).strip().upper()
        return bool(vehicle_key and vehicle_key in opening_hold_keys and current_state != 'HOLD')

    extra_cols = ['Order Number', 'Hold Status', 'Vehicle Start Time', 'Country']
    extra_cols = [c for c in extra_cols if c in original_df.columns]

    # =========================================================
    # LOGIC HELPERS: MODEL, WORK CONTENT, & REGION
    # =========================================================
    def is_bus_variant(variant_val):
        return str(variant_val).strip().upper().startswith(('V83', 'F83', 'M83', 'L83'))

    def extract_model(desc_val, variant_val=''):
        desc_str = str(desc_val).strip()
        if not desc_str or desc_str.lower() == 'nan':
            return 'Unknown'
        if line_type == 'MDT':
            if is_bus_variant(variant_val):
                return desc_str[:4] if len(desc_str) >= 4 else desc_str
            desc_upper = desc_str.upper()
            first_token = desc_str.split()[0] if desc_str.split() else ''
            if first_token.isdigit():
                return first_token
            if len(desc_upper) >= 6 and desc_upper[4:6] in ['RE', 'RD']:
                return desc_str[:6]
            if len(desc_upper) >= 5 and desc_upper[4] in ['R', 'C']:
                return desc_str[:5]
            return desc_str[:4] if len(desc_str) >= 4 else desc_str
        if len(desc_str) >= 6 and desc_str[5] in ['T', 'S', 'M']:
            return desc_str[:6]
        elif len(desc_str) >= 5:
            return desc_str[:5]
        return desc_str

    def get_work_content(variant_val, desc_val):
        if is_bus_variant(variant_val):
            return 'HWC'
        desc_str = str(desc_val).strip().upper()
        if len(desc_str) >= 5 and desc_str[4] == 'T' and '4X2' in desc_str:
            return 'LWC'
        if len(desc_str) >= 6 and desc_str[4:6] == 'CM':
            return 'HWC'
        if len(desc_str) >= 2:
            first_two = desc_str[:2]
            if first_two.isdigit() and int(first_two) > 30:
                return 'HWC'
        return 'LWC'
        
    def get_region(variant_val):
        if str(variant_val).strip().upper().startswith('V'):
            return 'Domestic'
        return 'Export'

    def get_engine_status_fallback(variant_val):
        variant_str = str(variant_val).strip().upper()
        if len(variant_str) >= 11 and variant_str[10] in ['U', 'T']:
            return 'Rapid Prime'
        return ''

    include_work_content = line_type != 'MDT'

    # Insert Data Columns into original_df
    original_df['Model'] = original_df.apply(lambda row: extract_model(row.get(desc_col, ''), row.get(variant_col, '')), axis=1)
    if include_work_content:
        original_df['Work Content'] = original_df.apply(lambda row: get_work_content(row.get(variant_col, ''), row.get(desc_col, '')), axis=1)
    original_df['Region'] = original_df[variant_col].apply(get_region)
    
    cols = list(original_df.columns)
    cols.remove('Model')
    if include_work_content:
        cols.remove('Work Content')
    cols.remove('Region')
        
    if desc_col in cols:
        desc_idx = cols.index(desc_col)
        cols.insert(desc_idx + 1, 'Model')
        if include_work_content:
            cols.insert(desc_idx + 2, 'Work Content')
            cols.insert(desc_idx + 3, 'Region')
        else:
            cols.insert(desc_idx + 2, 'Region')
    else:
        cols.append('Model')
        if include_work_content:
            cols.append('Work Content')
        cols.append('Region')
        
    original_df = original_df[cols]

    # =========================================================
    # ENGINE & TRANSMISSION STATUS MAPPING
    # =========================================================
    has_engine_transmission_report = engine_transmission_statuses is not None
    engine_transmission_statuses = engine_transmission_statuses or {}
    status_insert_idx = len(original_df.columns)
    hold_status_col = next((c for c in original_df.columns if str(c).strip().upper() == 'HOLD STATUS'), None)
    if hold_status_col:
        status_insert_idx = list(original_df.columns).index(hold_status_col) + 1

    if has_engine_transmission_report:
        engine_values = []
        transmission_values = []
        for _, row in original_df.iterrows():
            mapped_status = get_first_mapped_value(engine_transmission_statuses, row, {})
            engine_status = mapped_status.get('engine_status', '')
            if not engine_status:
                engine_status = get_engine_status_fallback(row.get(variant_col, '')) if variant_col else ''
            engine_values.append(engine_status)
            transmission_values.append(mapped_status.get('transmission_status', ''))

        original_df.insert(status_insert_idx, 'Engine status', engine_values)
        original_df.insert(status_insert_idx + 1, 'Transmission status', transmission_values)
        extra_cols.extend(['Engine status', 'Transmission status'])

    # =========================================================
    # AXLE STATUS MAPPING
    # =========================================================
    if axle_statuses:
        axle_values = []
        for _, row in original_df.iterrows():
            axle_values.append(get_first_mapped_value(axle_statuses, row))

        axle_insert_idx = len(original_df.columns)
        country_col = next((c for c in original_df.columns if str(c).strip().upper() == 'COUNTRY'), None)
        if country_col:
            axle_insert_idx = list(original_df.columns).index(country_col)

        original_df.insert(axle_insert_idx, 'Axle status', axle_values)
        extra_cols.append('Axle status')

    # =========================================================
    # FRAME STATUS MAPPING
    # =========================================================
    if frame_statuses and line_type == 'HDT':
        frame_values = []
        for _, row in original_df.iterrows():
            dsn_key = normalize_order_key(row.get(dsn_col, '')) if dsn_col else ''
            frame_values.append(frame_statuses.get(dsn_key, ''))

        frame_insert_idx = len(original_df.columns)
        if 'Axle status' in original_df.columns:
            frame_insert_idx = list(original_df.columns).index('Axle status') + 1

        original_df.insert(frame_insert_idx, 'Frame status', frame_values)
        extra_cols.append('Frame status')

    # =========================================================
    # PART SHORTAGE MAPPING LOGIC (WITH REF & QTY)
    # =========================================================
    cols = list(original_df.columns)
    insert_idx = len(cols)
    hold_status_col = next((c for c in cols if str(c).strip().upper() == 'HOLD STATUS'), None)
    if 'Transmission status' in cols:
        insert_idx = cols.index('Transmission status') + 1
    elif 'Engine status' in cols:
        insert_idx = cols.index('Engine status') + 1
    elif hold_status_col:
        insert_idx = cols.index(hold_status_col) + 1

    for part_num, details in shortages.items():
        var_set = details['variants']
        ref_order = details['ref_order']
        qty = details['qty']
        usage = max(int(details.get('usage', 1) or 1), 1)
        
        start_idx = 0
        if order_col and ref_order:
            matches = original_df.index[original_df[order_col].astype(str).str.strip() == ref_order].tolist()
            if matches:
                start_idx = matches[0]

        col_data = [''] * len(original_df)
        for i in range(len(original_df)):
            var = str(original_df.iloc[i].get(variant_col, '')).strip().upper()
            if var in var_set:
                if i < start_idx:
                    col_data[i] = 'Covered'
                else:
                    if qty >= usage:
                        col_data[i] = 'Covered'
                        qty -= usage
                    else:
                        col_data[i] = '⚠️ SHORTAGE'
        
        original_df.insert(insert_idx, part_num, col_data)
        insert_idx += 1
        extra_cols.append(part_num)

    def build_record_dict(row, seq_val):
        d = {
            'seq_val': seq_val,
            'dsn': str(row.get(dsn_col, '')),
            'serial': str(row.get(serial_col, '')),
            'vehicle_order_state': str(row.get(state_col, '')),
            'status': str(row.get(status_col, '')) if status_col else '',
            'description': str(row.get(desc_col, '')) if desc_col else '',
            'model': str(row.get('Model', '')),
            'variant': str(row.get(variant_col, '')) if variant_col else '',
            'work_content': str(row.get('Work Content', '')) if include_work_content else '',
            'region': str(row.get('Region', ''))
        }
        for c in extra_cols:
            val = row.get(c, '')
            d[c.lower().replace(' ', '_')] = '' if pd.isna(val) else str(val)
        return d

    # =========================================================
    # 1. HOLD LOGIC
    # =========================================================
    hold_mask = original_df[state_col].astype(str).str.strip().str.upper() == 'HOLD'
    hold_rows = original_df[hold_mask].copy()

    hold_records = []
    for _, r in hold_rows.iterrows():
        # Fallback seq_val for hold records
        raw_s = str(r.get(serial_col, '')).replace('.0', '').strip()
        seq_val = int(raw_s[-5:]) if len(raw_s) >= 5 and raw_s[-5:].isdigit() else 0
        hold_records.append(build_record_dict(r, seq_val))

    # =========================================================
    # 2. STRICT SEQUENCE SKIP LOGIC (Anomaly Block Tracking)
    # =========================================================
    df = original_df.copy()
    raw_serial = df[serial_col].astype(str).str.replace(r'\.0$', '', regex=True).str.strip()
    df['_seq_int'] = pd.to_numeric(raw_serial.str[-5:], errors='coerce')
    df = df.dropna(subset=['_seq_int'])
    df['_seq_int'] = df['_seq_int'].astype(int)

    gaps = []
    skip_records = []
    
    last_valid_seq = None
    is_in_anomaly_block = False
    current_anomaly_group = []
    anomaly_start_seq = None
    released_hold_anchor_seq = None

    for _, row in df.iterrows():
        current_seq = int(row['_seq_int'])
        status_val = str(row.get(status_col, '')).strip().upper() if status_col else ''

        if last_valid_seq is None:
            last_valid_seq = current_seq
            continue

        expected_next = last_valid_seq + 1
        released_hold_row = is_released_hold_row(row)

        if released_hold_anchor_seq is not None and current_seq == released_hold_anchor_seq + 1:
            last_valid_seq = current_seq
            released_hold_anchor_seq = None
            continue

        if current_seq == expected_next:
            last_valid_seq = current_seq
            released_hold_anchor_seq = None
            
            if is_in_anomaly_block:
                first_anomaly = current_anomaly_group[0]['_seq_int']
                last_anomaly = current_anomaly_group[-1]['_seq_int']
                skipped_range = f"{first_anomaly} – {last_anomaly}" if first_anomaly != last_anomaly else str(first_anomaly)

                gaps.append({
                    'from_dsn': anomaly_start_seq,
                    'to_dsn': current_seq,
                    'skipped_count': len(current_anomaly_group),
                    'skipped_range': skipped_range
                })
                
                current_anomaly_group = []
                is_in_anomaly_block = False
        else:
            if released_hold_row:
                released_hold_anchor_seq = current_seq
                continue

            if is_in_anomaly_block:
                current_anomaly_group.append(row)
                if status_val == 'TRIM LINE':
                    skip_records.append(build_record_dict(row, current_seq))
            else:
                if status_val == 'TRIM LINE':
                    is_in_anomaly_block = True
                    anomaly_start_seq = last_valid_seq
                    current_anomaly_group.append(row)
                    skip_records.append(build_record_dict(row, current_seq))
                elif line_type != 'MDT':
                    last_valid_seq = current_seq

    if is_in_anomaly_block and current_anomaly_group:
        first_anomaly = current_anomaly_group[0]['_seq_int']
        last_anomaly = current_anomaly_group[-1]['_seq_int']
        skipped_range = f"{first_anomaly} – {last_anomaly}" if first_anomaly != last_anomaly else str(first_anomaly)
        gaps.append({
            'from_dsn': anomaly_start_seq,
            'to_dsn': 'End of File',
            'skipped_count': len(current_anomaly_group),
            'skipped_range': skipped_range
        })

    # =========================================================
    # 3. GENERATE STRATIFICATIONS
    # =========================================================
    hold_strat = {}
    hold_type_strat = {'Bus': 0, 'Truck': 0}
    hold_wc_strat = {'HWC': 0, 'LWC': 0} if include_work_content else {}
    hold_region_strat = {'Domestic': 0, 'Export': 0}
    
    for r in hold_records:
        model = r.get('model', 'Unknown')
        hold_strat[model] = hold_strat.get(model, 0) + 1
        
        var_str = r.get('variant', '').strip().upper()
        if var_str.startswith(('V83', 'F83', 'M83', 'L83')):
            hold_type_strat['Bus'] += 1
            r['vehicle_type'] = 'Bus'
        else:
            hold_type_strat['Truck'] += 1
            r['vehicle_type'] = 'Truck'
            
        if include_work_content:
            wc = r.get('work_content', 'LWC')
            hold_wc_strat[wc] = hold_wc_strat.get(wc, 0) + 1
        
        reg = r.get('region', 'Export')
        hold_region_strat[reg] = hold_region_strat.get(reg, 0) + 1
        
    skip_strat = {}
    skip_type_strat = {'Bus': 0, 'Truck': 0}
    skip_wc_strat = {'HWC': 0, 'LWC': 0} if include_work_content else {}
    skip_region_strat = {'Domestic': 0, 'Export': 0}
    
    for r in skip_records:
        model = r.get('model', 'Unknown')
        skip_strat[model] = skip_strat.get(model, 0) + 1
        
        var_str = r.get('variant', '').strip().upper()
        if var_str.startswith(('V83', 'F83', 'M83', 'L83')):
            skip_type_strat['Bus'] += 1
            r['vehicle_type'] = 'Bus'
        else:
            skip_type_strat['Truck'] += 1
            r['vehicle_type'] = 'Truck'
            
        if include_work_content:
            wc = r.get('work_content', 'LWC')
            skip_wc_strat[wc] = skip_wc_strat.get(wc, 0) + 1
        
        reg = r.get('region', 'Export')
        skip_region_strat[reg] = skip_region_strat.get(reg, 0) + 1

    # =========================================================
    # 4. PREPARE FINAL JSON RESPONSE
    # =========================================================
    total_rows = len(original_df)
    total_hold = len(hold_records)
    total_skipped = len(skip_records)
    
    valid_seqs = df['_seq_int']
    dsn_min = int(valid_seqs.min()) if not valid_seqs.empty else 0
    dsn_max = int(valid_seqs.max()) if not valid_seqs.empty else 0
    
    return {
        'summary': {
            'dsn_min': dsn_min,
            'dsn_max': dsn_max,
            'total_in_file': total_rows,
            'total_hold': total_hold,
            'total_skipped': total_skipped,
            'hold_stratification': hold_strat,
            'skip_stratification': skip_strat,
            'hold_type_stratification': hold_type_strat,
            'skip_type_stratification': skip_type_strat,
            'hold_wc_stratification': hold_wc_strat,
            'skip_wc_stratification': skip_wc_strat,
            'hold_region_stratification': hold_region_strat,
            'skip_region_stratification': skip_region_strat,
            'shortage_parts': list(shortages.keys())
        },
        'hold_orders': hold_records,
        'skip_orders': skip_records,
        'gaps': gaps,
        'preview_columns': [str(c) for c in original_df.columns.tolist()],
        'preview_data': original_df.fillna('').astype(str).replace('nan', '').to_dict(orient='records')
    }

@app.route('/api/analyze', methods=['POST'])
def analyze():
    if 'file' not in request.files:
        return jsonify({'error': 'No main sequence file uploaded'}), 400
    
    f = request.files['file']
    if not f.filename.endswith(('.xlsx', '.xls', '.csv')):
        return jsonify({'error': 'Only .xlsx, .xls, and .csv files are supported'}), 400
        
    # Process Shortage Files & Inputs
    shortage_parts = request.form.getlist('shortage_parts')
    shortage_refs = request.form.getlist('shortage_refs')
    shortage_qtys = request.form.getlist('shortage_qtys')
    shortage_usages = request.form.getlist('shortage_usages')
    shortage_files = request.files.getlist('shortage_files')
    engine_status_file = request.files.get('engine_status_file')
    axle_status_file = request.files.get('axle_status_file')
    frame_status_file = request.files.get('frame_status_file')
    opening_hold_keys = request.form.getlist('opening_hold_keys')
    line_type = request.form.get('line_type', 'HDT')
    
    shortages = {}
    for i in range(min(len(shortage_parts), len(shortage_files))):
        part_num = shortage_parts[i].strip()
        ref_order = shortage_refs[i].strip() if i < len(shortage_refs) else ''
        try:
            qty = int(shortage_qtys[i].strip())
        except:
            qty = 0
        try:
            usage = int(shortage_usages[i].strip()) if i < len(shortage_usages) else 1
        except:
            usage = 1
        usage = max(usage, 1)
            
        file_obj = shortage_files[i]
        
        if part_num and file_obj.filename:
            try:
                df_part = parse_excel(file_obj.read())
                # Ensure Column F (Index 5) exists for Variant extraction
                if len(df_part.columns) > 5:
                    variants = df_part.iloc[:, 5].astype(str).str.strip().str.upper().tolist()
                    shortages[part_num] = {
                        'variants': set(variants),
                        'ref_order': ref_order,
                        'qty': qty,
                        'usage': usage
                    }
            except Exception as e:
                print(f"Error parsing shortage file for {part_num}: {e}")

    engine_transmission_statuses = None
    if engine_status_file and engine_status_file.filename:
        engine_transmission_statuses = {}
        try:
            df_status = parse_excel(engine_status_file.read())
            if len(df_status.columns) > 11:
                order_series = df_status.iloc[:, 2]
                engine_series = df_status.iloc[:, 9]
                transmission_series = df_status.iloc[:, 11]

                for order_value, engine_value, transmission_value in zip(order_series, engine_series, transmission_series):
                    order_key = normalize_order_key(order_value)
                    if order_key:
                        engine_transmission_statuses[order_key] = {
                            'engine_status': '' if pd.isna(engine_value) else str(engine_value).strip(),
                            'transmission_status': '' if pd.isna(transmission_value) else str(transmission_value).strip(),
                        }
        except Exception as e:
            print(f"Error parsing engine/transmission status file: {e}")

    axle_statuses = None
    if axle_status_file and axle_status_file.filename:
        try:
            axle_statuses = parse_axle_status_report(axle_status_file.read())
        except Exception as e:
            print(f"Error parsing axle status file: {e}")

    frame_statuses = None
    if frame_status_file and frame_status_file.filename:
        try:
            frame_statuses = parse_frame_status_report(frame_status_file.read())
        except Exception as e:
            print(f"Error parsing frame status file: {e}")

    try:
        df = parse_excel(f.read())
        result = analyze_sequence(df, shortages, engine_transmission_statuses, axle_statuses, frame_statuses, opening_hold_keys, line_type)
        return jsonify(result)
    except Exception as e:
        print(f"Server Error during analysis: {str(e)}")
        return jsonify({'error': f"Processing error: {str(e)}"}), 500


@app.route('/api/save-constraints', methods=['POST'])
def save_constraints():
    mapped_columns = parse_json_field('mapped_columns', [])
    summary = parse_json_field('summary', {})
    status_summary = parse_json_field('status_summary', {})
    inference_cards = parse_json_field('inference_cards', [])
    line_type = request.form.get('line_type', 'HDT')
    mapped_report_file = request.files.get('mapped_report_file')

    if not mapped_columns or not mapped_report_file or not mapped_report_file.filename:
        return jsonify({'error': 'No mapped report data available to save.'}), 400

    try:
        backup_date = datetime.now().strftime('%Y-%m-%d')
        backup_folder = BACKUP_DIR / backup_date
        source_folder = backup_folder / 'source_files'
        backup_folder.mkdir(parents=True, exist_ok=True)
        source_folder.mkdir(parents=True, exist_ok=True)

        mapped_df = pd.read_csv(mapped_report_file)
        mapped_columns = [str(column) for column in mapped_columns]
        for column in mapped_columns:
            if column not in mapped_df.columns:
                mapped_df[column] = ''
        mapped_df = mapped_df[mapped_columns]

        mapped_excel_path = backup_folder / 'Mapped_Day_Opening_Report.xlsx'
        mapped_csv_path = backup_folder / 'Mapped_Day_Opening_Report.csv'
        mapped_df.to_excel(mapped_excel_path, index=False)
        mapped_df.to_csv(mapped_csv_path, index=False, encoding='utf-8-sig')

        saved_files = [
            mapped_excel_path.name,
            mapped_csv_path.name,
        ]

        file_groups = [
            ('opening_report_file', 'opening_report'),
            ('mod_report_file', 'mod_report'),
            ('engine_status_file', 'engine_transmission_status'),
            ('axle_status_file', 'axle_status'),
            ('frame_status_file', 'frame_status'),
        ]
        for field_name, prefix in file_groups:
            saved_name = save_uploaded_file(request.files.get(field_name), source_folder, prefix)
            if saved_name:
                saved_files.append(f"source_files/{saved_name}")

        for index, shortage_file in enumerate(request.files.getlist('shortage_files'), start=1):
            saved_name = save_uploaded_file(shortage_file, source_folder, f"shortage_{index}")
            if saved_name:
                saved_files.append(f"source_files/{saved_name}")

        pdf_bytes = build_backup_pdf_bytes(line_type, summary, status_summary, inference_cards, len(mapped_df.index))
        pdf_path = backup_folder / 'Day_Opening_Summary.pdf'
        pdf_path.write_bytes(pdf_bytes)
        saved_files.append(pdf_path.name)

        return jsonify({
            'message': 'Constraints backup saved successfully.',
            'folder': str(backup_folder),
            'files': saved_files,
        })
    except Exception as e:
        print(f"Server Error during backup save: {str(e)}")
        return jsonify({'error': f"Backup save failed: {str(e)}"}), 500


@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def index(path):
    if path.startswith('api/'):
        return jsonify({'error': f'API route not found: /{path}'}), 404

    requested_file = FRONTEND_DIST_DIR / path
    if path and requested_file.is_file():
        return send_file(requested_file)

    built_index = FRONTEND_DIST_DIR / 'index.html'
    if built_index.exists():
        return send_file(built_index)

    return send_file(BASE_DIR / 'index.html')

if __name__ == '__main__':
    app.run(debug=True, port=5050)
