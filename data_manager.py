"""
Data manager and scraper for 3GPP EN-DC configurations from sqimway.com
"""

import os
import json
import re
from datetime import datetime
import requests
from bs4 import BeautifulSoup

CACHE_FILE = os.path.join(os.path.dirname(__file__), 'data', 'endc_cache.json')
SOURCE_URL = 'https://www.sqimway.com/nr_endc.php'

CATEGORY_NAMES = {
    1: 'Intra-band contiguous',
    2: 'Intra-band non-contiguous',
    3: 'Inter-band (two bands)',
    4: 'Inter-band (three bands)',
    5: 'Inter-band (four bands)',
    6: 'Inter-band (five bands)',
    7: 'Inter-band (six bands)'
}

def extract_bands(cfg, eutra='', nr=''):
    """
    Extract unique numeric LTE bands and NR bands from 3GPP EN-DC configuration string
    and table column data.
    """
    lte = set()
    nr_set = set()
    
    # 1. Look for (n)XX in cfg, eutra, nr
    all_text = f'{cfg} {eutra} {nr}'
    for m in re.finditer(r'\(n\)(\d+)', all_text):
        b = int(m.group(1))
        lte.add(b)
        nr_set.add(b)
        
    # 2. In cfg, if DC_X_Y
    clean = re.sub(r'^\s*DC_', '', cfg)
    clean = re.sub(r'\s*\(\d+\)$', '', clean) # remove trailing set index like (1)
    
    if '_' in clean:
        parts = clean.split('_')
        lte_part = parts[0]
        nr_part = '_'.join(parts[1:])
        
        for token in lte_part.split('-'):
            token = token.strip()
            m = re.match(r'^(\d+)', token)
            if m:
                lte.add(int(m.group(1)))
            elif '(n)' in token:
                m2 = re.search(r'\(n\)(\d+)', token)
                if m2:
                    lte.add(int(m2.group(1)))
                    nr_set.add(int(m2.group(1)))
                    
        for token in nr_part.split('-'):
            token = token.strip()
            m = re.search(r'n(\d+)', token, re.IGNORECASE)
            if m:
                nr_set.add(int(m.group(1)))
    else:
        for token in clean.split('-'):
            token = token.strip()
            if '(n)' in token:
                m = re.search(r'\(n\)(\d+)', token)
                if m:
                    lte.add(int(m.group(1)))
                    nr_set.add(int(m.group(1)))
            elif token.startswith('n') or token.startswith('N'):
                m = re.search(r'n(\d+)', token, re.IGNORECASE)
                if m:
                    nr_set.add(int(m.group(1)))
            else:
                m = re.match(r'^(\d+)', token)
                if m:
                    lte.add(int(m.group(1)))
                    
    # Also check eutra and nr columns if still missing
    if eutra:
        for token in re.split(r'[-_\s,]+', eutra):
            m = re.match(r'^(\d+)', token)
            if m and int(m.group(1)) > 0:
                lte.add(int(m.group(1)))
    if nr:
        for token in re.split(r'[-_\s,]+', nr):
            m = re.search(r'n(\d+)', token, re.IGNORECASE)
            if m:
                nr_set.add(int(m.group(1)))

    return sorted(list(lte)), sorted(list(nr_set))

def parse_carrier_classes(config_str):
    """
    Parses component carriers and bandwidth classes for LTE and NR from the configuration name.
    Example: 'DC_1A-3C_n78A' ->
      LTE: [{'band': 1, 'class': 'A', 'ccs': 1}, {'band': 3, 'class': 'C', 'ccs': 2}]
      NR: [{'band': 'n78', 'class': 'A', 'ccs': 1}]
    """
    class_info = {'lte': [], 'nr': []}
    clean = re.sub(r'^\s*DC_', '', config_str)
    clean = re.sub(r'\s*\(\d+\)$', '', clean)
    
    parts = clean.split('_')
    lte_part = parts[0] if parts else ''
    nr_part = '_'.join(parts[1:]) if len(parts) > 1 else ''
    
    # Helper to calculate CCs from bandwidth class
    def get_ccs(bw_class):
        if not bw_class:
            return 1
        c = bw_class.upper()
        if '(2A)' in c or '2A' in c: return 2
        if '(3A)' in c or '3A' in c: return 3
        if '(4A)' in c or '4A' in c: return 4
        if 'AA' in c or 'AB' in c or 'CA' in c: return 2
        if c == 'A': return 1
        if c == 'B' or c == 'C': return 2
        if c == 'D': return 3
        if c == 'E': return 4
        if c == 'F': return 5
        return 1

    if '_' in clean:
        for token in lte_part.split('-'):
            m = re.match(r'^(\d+)(.*)', token.strip())
            if m:
                band_num = int(m.group(1))
                bw_cls = m.group(2) or 'A'
                class_info['lte'].append({
                    'band': band_num,
                    'class': bw_cls,
                    'ccs': get_ccs(bw_cls)
                })
        for token in nr_part.split('-'):
            m = re.match(r'^n(\d+)(.*)', token.strip(), re.IGNORECASE)
            if m:
                band_num = int(m.group(1))
                bw_cls = m.group(2) or 'A'
                class_info['nr'].append({
                    'band': f'n{band_num}',
                    'class': bw_cls,
                    'ccs': get_ccs(bw_cls)
                })
    else:
        # Special cases like DC_(n)3AA
        m = re.search(r'\(n\)(\d+)(.*)', clean)
        if m:
            b = int(m.group(1))
            cls = m.group(2) or 'AA'
            class_info['lte'].append({'band': b, 'class': cls, 'ccs': 1})
            class_info['nr'].append({'band': f'n{b}', 'class': cls, 'ccs': 1})
            
    return class_info

def fetch_and_parse_endc():
    """
    Fetches the live EN-DC page from sqimway.com and parses all tables into structured records.
    """
    session = requests.Session()
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Referer': 'https://www.sqimway.com/'
    })
    
    # Send POST with ulca=on to get full Uplink combinations
    resp = session.post(
        SOURCE_URL,
        data={'sort_flag': 'FT', 'ulca': 'on', 'Display': 'Refresh'},
        timeout=35
    )
    resp.raise_for_status()
    
    soup = BeautifulSoup(resp.text, 'html.parser')
    
    spec_info = 'EN-DC frequency bands 38.101-3 (Rel 18 Mar 2023)'
    for h2 in soup.find_all('h2'):
        if 'Rel' in h2.get_text():
            spec_info = h2.get_text(strip=True)
            break
            
    tables = soup.find_all('table')
    if len(tables) < 3:
        raise ValueError('Expected tables not found on sqimway.com')
        
    records = []
    all_lte = set()
    all_nr = set()
    
    for t_idx in range(1, len(tables)):
        t = tables[t_idx]
        cat_name = CATEGORY_NAMES.get(t_idx, f'Table {t_idx}')
        trs = t.find_all('tr')
        if not trs:
            continue
            
        current_cfg = ''
        current_ul = ''
        
        for tr in trs:
            tds = [td.get_text(' ', strip=True) for td in tr.find_all(['td', 'th'])]
            if not tds:
                continue
                
            if t_idx in (1, 2):
                # Intra-band tables
                if any('configuration' in cell.lower() for cell in tds): continue
                if any('channel bandwidths' in cell.lower() for cell in tds): continue
                if 'band' in tds[0].lower(): continue
                
                if tds[0].startswith('DC_'):
                    current_cfg = tds[0]
                    current_ul = tds[1] if len(tds) > 1 else ''
                    bcs = tds[2] if len(tds) > 2 else ''
                    ch_eutra = tds[3] if len(tds) > 3 else ''
                    ch_nr = tds[4] if len(tds) > 4 else ''
                    max_bw = tds[6] if len(tds) > 6 else (tds[5] if len(tds) > 5 else '')
                elif current_cfg and len(tds) >= 2:
                    ch_eutra += ' | ' + tds[0]
                    ch_nr += ' | ' + tds[1]
                    continue
                else:
                    continue
                    
                lte_b, nr_b = extract_bands(current_cfg)
                all_lte.update(lte_b)
                all_nr.update(nr_b)
                carrier_classes = parse_carrier_classes(current_cfg)
                
                records.append({
                    'id': len(records) + 1,
                    'config': current_cfg,
                    'category': cat_name,
                    'category_code': f'intra_{t_idx}',
                    'uplink_config': current_ul,
                    'eutra_detail': f'Band {lte_b[0]}' if lte_b else '',
                    'nr_detail': f'Band n{nr_b[0]}' if nr_b else '',
                    'lte_bands': lte_b,
                    'nr_bands': nr_b,
                    'bcs': bcs,
                    'channel_bw_eutra': ch_eutra,
                    'channel_bw_nr': ch_nr,
                    'max_bw_mhz': max_bw,
                    'num_bands': len(set(lte_b) | set(nr_b)),
                    'carrier_classes': carrier_classes
                })
            else:
                # Inter-band tables (3 to 7)
                if not tds[0].startswith('DC_'):
                    continue
                    
                cfg = tds[0]
                ul_cfg = tds[1] if len(tds) > 1 else ''
                eutra_col = tds[2] if len(tds) > 2 else ''
                nr_col = tds[3] if len(tds) > 3 else ''
                
                lte_b, nr_b = extract_bands(cfg, eutra_col, nr_col)
                all_lte.update(lte_b)
                all_nr.update(nr_b)
                carrier_classes = parse_carrier_classes(cfg)
                
                records.append({
                    'id': len(records) + 1,
                    'config': cfg,
                    'category': cat_name,
                    'category_code': f'inter_{t_idx-1}',
                    'uplink_config': ul_cfg,
                    'eutra_detail': eutra_col,
                    'nr_detail': nr_col,
                    'lte_bands': lte_b,
                    'nr_bands': nr_b,
                    'bcs': '',
                    'channel_bw_eutra': '',
                    'channel_bw_nr': '',
                    'max_bw_mhz': '',
                    'num_bands': len(set(lte_b) | set(nr_b)),
                    'carrier_classes': carrier_classes
                })
                
    result_data = {
        'last_updated': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'source_url': SOURCE_URL,
        'spec_info': spec_info,
        'total_records': len(records),
        'available_lte_bands': sorted(list(all_lte)),
        'available_nr_bands': sorted(list(all_nr)),
        'records': records
    }
    
    os.makedirs(os.path.dirname(CACHE_FILE), exist_ok=True)
    with open(CACHE_FILE, 'w', encoding='utf-8') as f:
        json.dump(result_data, f, indent=2, ensure_ascii=False)
        
    return result_data

def get_endc_data(force_refresh=False):
    """
    Returns EN-DC data from cache. If cache does not exist or force_refresh is True,
    it refreshes from sqimway.com.
    """
    if not force_refresh and os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
            
    return fetch_and_parse_endc()
