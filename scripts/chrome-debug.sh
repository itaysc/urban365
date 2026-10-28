#!/usr/bin/env bash
# Opens Chrome with a DevTools port on its own profile, so the NestJS server can attach
# to it (YAD2_CDP_URL) and scrape yad2 through a session that has passed the bot check.
#
# The separate --user-data-dir is deliberate: Chrome refuses a debugging port on a
# profile that is already running, and this keeps your everyday profile untouched.
set -euo pipefail

PORT="${CDP_PORT:-9222}"
PROFILE="${CDP_PROFILE:-$HOME/.cache/nadlan-chrome}"

case "$(uname -s)" in
  Darwin) CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ;;
  Linux)  CHROME="$(command -v google-chrome || command -v chromium || true)" ;;
  *)      CHROME="" ;;
esac

if [ ! -x "$CHROME" ]; then
  echo "Could not find Chrome. Set CHROME=/path/to/chrome and re-run." >&2
  exit 1
fi

if curl -s --max-time 1 "http://127.0.0.1:$PORT/json/version" >/dev/null 2>&1; then
  echo "Chrome is already listening on port $PORT."
else
  echo "Starting Chrome on port $PORT (profile: $PROFILE)"
  "$CHROME" --remote-debugging-port="$PORT" --user-data-dir="$PROFILE" https://www.yad2.co.il >/dev/null 2>&1 &
  sleep 2
fi

cat <<MSG

Next:
  1. In the Chrome window that just opened, let yad2.co.il finish loading
     (solve the bot check if one is shown).
  2. Put this in server/.env:
         YAD2_CDP_URL=http://127.0.0.1:$PORT
  3. Restart the server (npm run dev:server) and search again.

Then minimise this window, or move it to another desktop, and leave it running.
A scrape reuses the tab that is already open instead of making a new one, so the
window stays where you put it.

This window cannot be headless: yad2's Radware check serves a captcha to headless
Chrome even with this same profile (tested). The visible window is what makes
scraping work at all.
MSG
