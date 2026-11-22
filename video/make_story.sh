#!/bin/bash
cd "$(dirname "$0")"
until grep -q "^DONE" tts_story.log; do sleep 3; done
echo "voice done: $(tail -1 tts_story.log)" > story_progress.log
rm -rf frames/story
REST_EVERY=700 REST_MS=6000 FPS_MOTION=12 node record.mjs story film >> story_progress.log 2>&1
echo "recorded" >> story_progress.log
mkdir -p ../docs/demo
node assemble.mjs story ../docs/demo/prithvi-ai-cinematic-story.mp4 >> story_progress.log 2>&1
echo "PIPELINE-FINISHED" >> story_progress.log
