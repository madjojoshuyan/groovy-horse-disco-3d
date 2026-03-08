#!/bin/bash
echo "=========================================="
echo "Groovy Horse Disco 3D - Setup & Run"
echo "=========================================="

cd "$(dirname "$0")"

if ! command -v node &> /dev/null
then
    echo "[ERROR] Node.js is not installed!"
    echo "Please download and install it from https://nodejs.org/"
    read -p "Press Enter to exit..."
    exit
fi

echo "[1/3] Node.js is installed."
echo "[2/3] Installing dependencies (this may take a minute)..."
npm install

echo "[3/3] Starting the application..."
sleep 3 && open http://localhost:3000 &
npm run dev
