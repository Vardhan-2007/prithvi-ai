#!/bin/bash
# one-time toolchain install, at background priority: ffmpeg (npm), Chrome for Testing, kokoro-js voice
cd "$(dirname "$0")"
taskpolicy -b npm install puppeteer-core kokoro-js @ffmpeg-installer/ffmpeg @puppeteer/browsers --no-audit --no-fund
taskpolicy -b npx @puppeteer/browsers install chrome@stable --path ./browsers
echo SETUP-DONE
