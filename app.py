"""
Flask web application for 3GPP EN-DC Configurations Explorer & Filter
Source: https://www.sqimway.com/nr_endc.php
"""

import os
import io
import csv
import re
from flask import Flask, render_template, request, jsonify, Response, send_file
import data_manager

app = Flask(__name__)

# Ensure data is loaded
endc_data = data_manager.get_endc_data()

def parse_band_inputs(val):
    """
    Parses user band input (e.g. '1, 3, B7, n78, 28') into a list of integers.
    """
    if not val:
        return []
    if isinstance(val, list):
        items = val
    else:
        items = re.split(r'[,;\s\+]+', str(val))
    res = set()
    for item in items:
        item = str(item).strip()
        if not item:
            continue
        m = re.search(r'(\d+)', item)
        if m:
            res.add(int(m.group(1)))
    return sorted(list(res))

def filter_records(records, lte_bands, nr_bands, match_mode='all', category='all', search_text=''):
    """
    Filters EN-DC records according to user criteria.
    """
    filtered = []
    lte_set = set(lte_bands)
    nr_set = set(nr_bands)
    search_lower = search_text.strip().lower() if search_text else ''

    for r in records:
        r_lte = set(r.get('lte_bands', []))
        r_nr = set(r.get('nr_bands', []))

        # 1. Band Matching
        if lte_set and not nr_set:
            if match_mode == 'all':
                if not lte_set.issubset(r_lte):
                    continue
            elif match_mode == 'any':
                if not (lte_set & r_lte):
                    continue
            elif match_mode == 'exact':
                if r_lte != lte_set:
                    continue
        elif nr_set and not lte_set:
            if match_mode == 'all':
                if not nr_set.issubset(r_nr):
                    continue
            elif match_mode == 'any':
                if not (nr_set & r_nr):
                    continue
            elif match_mode == 'exact':
                if r_nr != nr_set:
                    continue
        elif lte_set and nr_set:
            if match_mode == 'all':
                if not (lte_set.issubset(r_lte) and nr_set.issubset(r_nr)):
                    continue
            elif match_mode == 'any':
                if not ((lte_set & r_lte) or (nr_set & r_nr)):
                    continue
            elif match_mode == 'exact':
                if not (r_lte == lte_set and r_nr == nr_set):
                    continue

        # 2. Category Filter
        if category and category != 'all':
            cat_code = r.get('category_code', '')
            if category.startswith('intra') and not cat_code.startswith('intra'):
                continue
            elif category.startswith('inter') and not cat_code.startswith('inter'):
                continue
            elif category in ('intra_1', 'intra_2', 'inter_2', 'inter_3', 'inter_4', 'inter_5', 'inter_6'):
                if cat_code != category:
                    continue

        # 3. Free Text Search Filter
        if search_lower:
            text_target = f"{r.get('config', '')} {r.get('uplink_config', '')} {r.get('category', '')} {r.get('eutra_detail', '')} {r.get('nr_detail', '')}".lower()
            if search_lower not in text_target:
                continue

        filtered.append(r)

    return filtered

@app.route('/')
def index():
    global endc_data
    if not endc_data:
        endc_data = data_manager.get_endc_data()
    return render_template(
        'index.html',
        spec_info=endc_data.get('spec_info', ''),
        last_updated=endc_data.get('last_updated', ''),
        total_records=endc_data.get('total_records', 0),
        available_lte_bands=endc_data.get('available_lte_bands', []),
        available_nr_bands=endc_data.get('available_nr_bands', [])
    )

@app.route('/api/status', methods=['GET'])
def get_status():
    global endc_data
    if not endc_data:
        endc_data = data_manager.get_endc_data()
    return jsonify({
        'status': 'ok',
        'last_updated': endc_data.get('last_updated', ''),
        'source_url': endc_data.get('source_url', ''),
        'spec_info': endc_data.get('spec_info', ''),
        'total_records': endc_data.get('total_records', 0),
        'available_lte_bands': endc_data.get('available_lte_bands', []),
        'available_nr_bands': endc_data.get('available_nr_bands', [])
    })

@app.route('/api/refresh', methods=['POST'])
def refresh_data():
    global endc_data
    try:
        endc_data = data_manager.get_endc_data(force_refresh=True)
        return jsonify({
            'status': 'ok',
            'message': 'Base de datos de combinaciones EN-DC actualizada exitosamente desde sqimway.com',
            'last_updated': endc_data.get('last_updated', ''),
            'total_records': endc_data.get('total_records', 0),
            'spec_info': endc_data.get('spec_info', '')
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f'Error al actualizar desde sqimway.com: {str(e)}'
        }), 500

@app.route('/api/filter', methods=['POST', 'GET'])
def filter_api():
    global endc_data
    if not endc_data:
        endc_data = data_manager.get_endc_data()

    if request.method == 'POST':
        data = request.get_json(silent=True) or request.form.to_dict()
    else:
        data = request.args.to_dict()

    lte_input = data.get('lte_bands', '')
    nr_input = data.get('nr_bands', '')
    match_mode = data.get('match_mode', 'all')
    category = data.get('category', 'all')
    search_text = data.get('search_text', '')

    lte_bands = parse_band_inputs(lte_input)
    nr_bands = parse_band_inputs(nr_input)

    filtered = filter_records(
        endc_data.get('records', []),
        lte_bands=lte_bands,
        nr_bands=nr_bands,
        match_mode=match_mode,
        category=category,
        search_text=search_text
    )

    # Category breakdown stats for results
    category_counts = {}
    for r in filtered:
        cat = r.get('category', 'Otro')
        category_counts[cat] = category_counts.get(cat, 0) + 1

    return jsonify({
        'status': 'ok',
        'query': {
            'lte_bands': lte_bands,
            'nr_bands': [f'n{b}' for b in nr_bands],
            'match_mode': match_mode,
            'category': category,
            'search_text': search_text
        },
        'total_in_db': endc_data.get('total_records', 0),
        'matched_count': len(filtered),
        'category_counts': category_counts,
        'records': filtered
    })

@app.route('/api/export/csv', methods=['GET', 'POST'])
def export_csv():
    global endc_data
    if not endc_data:
        endc_data = data_manager.get_endc_data()

    if request.method == 'POST':
        data = request.get_json(silent=True) or request.form.to_dict()
    else:
        data = request.args.to_dict()

    lte_bands = parse_band_inputs(data.get('lte_bands', ''))
    nr_bands = parse_band_inputs(data.get('nr_bands', ''))
    match_mode = data.get('match_mode', 'all')
    category = data.get('category', 'all')
    search_text = data.get('search_text', '')

    records = filter_records(
        endc_data.get('records', []),
        lte_bands=lte_bands,
        nr_bands=nr_bands,
        match_mode=match_mode,
        category=category,
        search_text=search_text
    )

    output = io.StringIO()
    writer = csv.writer(output, dialect='excel')

    # Header row
    writer.writerow([
        'Configuración EN-DC',
        'Categoría 3GPP',
        'Bandas LTE (E-UTRA)',
        'Bandas NR (5G)',
        'Configuración Uplink (UL EN-DC)',
        'E-UTRA Detalle',
        'NR Detalle',
        'Bandwidth Combination Set (BCS)',
        'Canal BW E-UTRA (MHz)',
        'Canal BW NR (MHz)',
        'Max Aggregated BW (MHz)',
        'Total Bandas'
    ])

    for r in records:
        lte_str = ', '.join([f'B{b}' for b in r.get('lte_bands', [])])
        nr_str = ', '.join([f'n{b}' for b in r.get('nr_bands', [])])
        writer.writerow([
            r.get('config', ''),
            r.get('category', ''),
            lte_str,
            nr_str,
            r.get('uplink_config', ''),
            r.get('eutra_detail', ''),
            r.get('nr_detail', ''),
            r.get('bcs', ''),
            r.get('channel_bw_eutra', ''),
            r.get('channel_bw_nr', ''),
            r.get('max_bw_mhz', ''),
            r.get('num_bands', '')
        ])

    csv_content = output.getvalue()
    # UTF-8 with BOM (utf-8-sig) ensures perfect compatibility with Microsoft Excel in Windows
    csv_bytes = csv_content.encode('utf-8-sig')

    filename = '3GPP_ENDC_Combinaciones.csv'
    if lte_bands or nr_bands:
        lte_part = 'LTE_' + '-'.join([str(b) for b in lte_bands]) if lte_bands else ''
        nr_part = 'NR_' + '-'.join([f'n{b}' for b in nr_bands]) if nr_bands else ''
        parts = [p for p in [lte_part, nr_part] if p]
        filename = f"ENDC_{'_'.join(parts)}.csv"

    return Response(
        csv_bytes,
        mimetype='text/csv; charset=utf-8',
        headers={
            'Content-Disposition': f'attachment; filename="{filename}"',
            'Content-Type': 'text/csv; charset=utf-8'
        }
    )

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"Iniciando servidor Flask EN-DC Explorer en http://localhost:{port}")
    app.run(host='0.0.0.0', port=port, debug=True)
