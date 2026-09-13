#!/usr/bin/env bash

# Start preview server if not already running on port 4322
# Used by Playwright webServer configuration

set -euo pipefail

PORT=4322
HOST="localhost"

# Function to check if port is in use and responding
check_port() {
    if lsof -i :"$PORT" >/dev/null 2>&1; then
        # Port is in use, verify it's actually responding
        if curl -s -o /dev/null -w "%{http_code}" "http://$HOST:$PORT/" | grep -q "^2"; then
            return 0
        fi
    fi
    return 1
}

if check_port; then
    echo "Preview server already running on http://$HOST:$PORT"
    exit 0
fi

echo "Starting preview server on http://$HOST:$PORT..."
npm run preview &

PREVIEW_PID=$!
echo "Preview server started with PID $PREVIEW_PID"

# Wait for server to be ready (max 30 seconds)
for i in {1..30}; do
    if check_port; then
        echo "Preview server is ready"
        # Save PID for potential cleanup (optional)
        echo $PREVIEW_PID > /tmp/astro-preview.pid
        exit 0
    fi
    sleep 1
done

echo "ERROR: Preview server failed to start within 30 seconds" >&2
exit 1