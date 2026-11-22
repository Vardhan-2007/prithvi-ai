#!/bin/bash
cd "$(dirname "$0")"
until grep -qE "CINE2-FINISHED|CINE2-FAILED" cine2.log; do sleep 5; done
rm -rf frames/te; : > te.log
for attempt in 1 2 3 4 5 6; do
  echo "attempt $attempt" >> te.log
  REST_EVERY=700 REST_MS=6000 FPS_MOTION=12 node record.mjs te film >> te.log 2>&1
  if grep -q "^RECORDED te" te.log; then break; fi
  echo "crashed, retrying" >> te.log; sleep 5
done
if grep -q "^RECORDED te" te.log; then
  node assemble.mjs te ../docs/demo/prithvi-ai-cinematic-story-telugu.mp4 >> te.log 2>&1
  echo "TE-FINISHED" >> te.log
else echo "TE-FAILED" >> te.log; fi
