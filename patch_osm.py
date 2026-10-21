#!/usr/bin/env python3
"""Patches writer.py and index.html to revert map tiles to OpenStreetMap"""
import pathlib

# ---- patch writer.py ----
wp = pathlib.Path('writer.py')
wc = wp.read_text(encoding='utf-8')

wc = wc.replace(
    'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
)
wc = wc.replace(
    'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
)
# Fix attribution & remove subdomains:'abcd' from carto lines
wc = wc.replace(
    "attribution:'\\u00a9 OpenStreetMap contributors \\u00a9 CARTO',subdomains:'abcd',maxZoom:19",
    "attribution:'\\u00a9 OpenStreetMap contributors',maxZoom:18"
)
# Fix the tag label in the HTML
wc = wc.replace('CartoDB Dark', 'OpenStreetMap')
# Fix leaflet container background (remove forced black bg so OSM renders normally)
wc = wc.replace(
    '.leaflet-container{font-family:\'Inter\',sans-serif !important;background:#0B0D10 !important;}',
    '.leaflet-container{font-family:\'Inter\',sans-serif !important;}'
)
wc = wc.replace(
    '[data-theme="light"] .leaflet-container{background:#e8e8ea !important;}',
    ''
)

wp.write_text(wc, encoding='utf-8')
print('writer.py patched')

# ---- regenerate index.html ----
exec(wp.read_text(encoding='utf-8').replace(
    "out = pathlib.Path(r'C:\\Users\\wwwam\\.gemini\\antigravity-ide\\scratch\\roadsense\\index.html')\nout.write_text(HTML, encoding='utf-8')\nprint(f'Written {len(HTML)} chars to {out}')",
    ""
))
out = pathlib.Path(r'C:\Users\wwwam\.gemini\antigravity-ide\scratch\roadsense\index.html')
out.write_text(HTML, encoding='utf-8')
print(f'index.html regenerated: {len(HTML)} chars')
