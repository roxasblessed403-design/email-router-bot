#!/bin/bash

echo "🚀 Email Router Bot - Setup Script"
echo "===================================="
echo ""

if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed"
    exit 1
fi

echo "✅ Node.js installed"

if [ ! -f ".env" ]; then
    cp .env.example .env
    echo "✅ .env created"
fi

echo "📦 Installing dependencies..."
npm install

echo "✅ Setup complete!"
