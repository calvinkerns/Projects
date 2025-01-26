#!/bin/bash
cd "$(dirname "$0")" 

PORT=${1:-8000}

# local python HTTP server
python3 -m http.server $PORT
