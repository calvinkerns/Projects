#!/bin/bash
cd "$(dirname "$0")/guassian-viewer"

PORT=${1:-8000}

# local python HTTP server-- run ./start_local_sever.sh 
# to start the local server
python -m http.server $PORT