#!/bin/bash

# Rork SolTools Crypto Hub - Quick Start Script
# This script helps you get started with development

set -e

echo "🚀 Rork SolTools Crypto Hub - Quick Start"
echo "==========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${YELLOW}⚠️  package.json not found. Please run this script from the expo/ directory${NC}"
    echo "   cd expo && bash ../quick-start.sh"
    exit 1
fi

echo -e "${BLUE}Checking dependencies...${NC}"

# Check for Bun
if ! command -v bun &> /dev/null && ! command -v ~/.bun/bin/bun &> /dev/null; then
    echo -e "${YELLOW}Installing Bun...${NC}"
    curl -fsSL https://bun.sh/install | bash
    export PATH=$PATH:~/.bun/bin
fi

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}⚠️  Node.js not found. Please install Node.js:${NC}"
    echo "   https://nodejs.org/en/"
    exit 1
fi

echo -e "${GREEN}✓ Dependencies found${NC}"
echo ""

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo -e "${BLUE}Installing npm packages...${NC}"
    /root/.bun/bin/bun install 2>&1 | tail -5
    echo -e "${GREEN}✓ Packages installed${NC}"
else
    echo -e "${GREEN}✓ Packages already installed${NC}"
fi

echo ""
echo -e "${BLUE}Setup complete! 🎉${NC}"
echo ""
echo "Next steps:"
echo ""
echo -e "${YELLOW}1. Start development server (with web preview):${NC}"
echo "   bun run start-web"
echo ""
echo -e "${YELLOW}2. Start development server (with mobile preview):${NC}"
echo "   bun run start"
echo ""
echo -e "${YELLOW}3. Build for iOS:${NC}"
echo "   eas build --platform ios"
echo ""
echo -e "${YELLOW}4. Build for Android:${NC}"
echo "   eas build --platform android"
echo ""
echo -e "${YELLOW}For more help, see: ../SETUP_GUIDE.md${NC}"
echo ""
