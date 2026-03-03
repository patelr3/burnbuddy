#!/usr/bin/env bash

for i in {1..8}; do
  pgrep -f "ralph.sh --tool claude 20" > /dev/null || ./scripts/ralph/ralph.sh --tool claude 20 &
  sleep 3600
done
