Scripts que geram os dados do app Android (rodam com Node, a partir de uma pasta com os pacotes npm
world-atlas, world-countries, d3-geo, topojson-*, polyclip-ts, earcut, polylabel, flag-icons, svgo e os mapas de
historical-basemaps em dl/hb). Precisam também do Shapely (Python) e do admin-1 10m da Natural Earth em dl/admin1.geojson.

Ordem:
1. `python3 split_regions.py` (regiões de corte das partes históricas de países de hoje)
2. `ANDROID=1 node build-data.mjs`
3. `python3 hist_overlay.py` (mapas históricos refeitos sobre as províncias de hoje)
4. `python3 fill_overlay.py` (formas usadas para pintar de amarelo a unidade tocada na História)
5. `node gen-hist-flags.mjs`
6. `node build-android-assets.mjs`

Mapas históricos: https://github.com/aourednik/historical-basemaps (GPL-3.0).
