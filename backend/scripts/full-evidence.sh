#!/usr/bin/env bash
# Regenerates ALL test evidence against a running server (default http://localhost:3001):
# 6 real products / 4 categories, competitor research for one, feedback, second run, browser e2e.
set -e
cd "$(dirname "$0")/.."
node scripts/run-products.mjs \
  "https://www.gonoise.com/products/noise-alt-buds-s-truly-wireless-bluetooth-earbuds-chosen-black" \
  "https://www.ptron.in/products/ptron-funk-duet-v1-mini-8w-wireless-speaker-with-enchanting-sound-8hrs-playtime-52mm-dynamic-driver-bluetooth-v5-3-portable-speaker-bt-microsd-card-usb-playback-integrated-music-control-blue" \
  "https://www.beardo.in/products/beardo-ultraglow-face-cream-spf-30-bau-1199-sale" \
  "https://www.nobero.com/products/westward-look" \
  "https://www.allbirds.com/products/trino-hiders-onyx"
node scripts/research-run.mjs "https://www.boat-lifestyle.com/products/boat-partypal-800" \
  "https://www.gizmore.in/products/gizmore-thunder-bolt-neo-80w-rms-party-speaker-with-wireless-mic" \
  "https://www.ptron.in/products/ptron-sonor-bluetooth-speaker-new-fashionable-wireless-speaker-for-all-smartphones-silver" \
  "https://www.zebronics.com/products/zeb-rocket" "https://www.portronics.com/products/zuno-l" \
  "https://www.crossbeats.com/products/jambox" "https://www.urbanista.com/products/shibuya" \
  "https://www.skullcandy.com/products/session-900" \
  "https://www.gonoise.com/products/noise-alt-buds-s-truly-wireless-bluetooth-earbuds-chosen-black" \
  "https://www.boultaudio.com/products/spektra-olive-green-anc-ecom-prebook-pass"
node ../tests/feedback-and-second-run.mjs
node ../tests/e2e.mjs || true
