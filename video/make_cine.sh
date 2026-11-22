#!/bin/bash
cd "$(dirname "$0")"
until grep -q "PIPELINE-FINISHED" story_progress.log; do sleep 5; done
echo "start tts" > cine_progress.log
DTYPE=fp32 SPEED=0.92 taskpolicy -b node tts.mjs cine >> cine_progress.log 2>&1
echo "voice done" >> cine_progress.log
rm -rf frames/cine
REST_EVERY=700 REST_MS=6000 FPS_MOTION=12 node record.mjs cine film >> cine_progress.log 2>&1
echo "recorded" >> cine_progress.log
node assemble.mjs cine ../docs/demo/prithvi-ai-cinematic-film.mp4 >> cine_progress.log 2>&1
echo "CINE-FINISHED" >> cine_progress.log
