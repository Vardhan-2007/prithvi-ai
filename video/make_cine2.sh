#!/bin/bash
cd "$(dirname "$0")"
rm -rf frames/cine; : > cine2.log
for attempt in 1 2 3 4 5 6; do
  echo "attempt $attempt" >> cine2.log
  REST_EVERY=700 REST_MS=6000 FPS_MOTION=12 node record.mjs cine film >> cine2.log 2>&1
  if grep -q "^RECORDED cine" cine2.log; then break; fi
  echo "crashed, retrying" >> cine2.log; sleep 5
done
if grep -q "^RECORDED cine" cine2.log; then
  node assemble.mjs cine ../docs/demo/prithvi-ai-cinematic-film.mp4 >> cine2.log 2>&1
  echo "CINE2-FINISHED" >> cine2.log
else echo "CINE2-FAILED" >> cine2.log; fi
