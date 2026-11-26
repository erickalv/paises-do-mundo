Scripts que geram os dados do app Android (rodam com Node, a partir de uma pasta com os pacotes npm
world-atlas, world-countries, d3-geo, topojson-*, polyclip-ts, earcut, polylabel, flag-icons, svgo e os mapas de
historical-basemaps em dl/hb). Ordem: `ANDROID=1 node build-data.mjs`, `node gen-hist-flags.mjs`, `node build-android-assets.mjs`.
Mapas históricos: https://github.com/aourednik/historical-basemaps (GPL-3.0).
