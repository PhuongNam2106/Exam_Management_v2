#!/bin/sh
cd "$(dirname "$0")" || exit 1
echo "Starting Exam Management..."
echo "Open http://localhost:3000 on this computer."
echo "Students must use the LAN URL printed by the server."
npm start
