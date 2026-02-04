#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Building Opacity Pass APK locally...${NC}"
echo ""

# Set environment variables to disable Sentry upload
export SENTRY_DISABLE_AUTO_UPLOAD=true
export LOCAL_BUILD=true
export NODE_ENV=development

echo -e "${YELLOW}📋 Environment configured:${NC}"
echo "  - Sentry auto-upload: DISABLED"
echo "  - Local build mode: ENABLED"
echo "  - Node environment: development"
echo ""

# Check if we're in the correct directory
if [ ! -f "app.json" ]; then
    echo -e "${RED}❌ Error: app.json not found. Please run this script from your project root.${NC}"
    exit 1
fi

# Clean previous build
echo -e "${YELLOW}🧹 Cleaning previous build...${NC}"
if [ -d "android" ]; then
    rm -rf android
fi

# Prebuild
echo -e "${YELLOW}🔧 Running expo prebuild...${NC}"
npx expo prebuild --platform android --clean

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Prebuild failed${NC}"
    exit 1
fi

# Navigate to android directory and build
echo -e "${YELLOW}🔨 Building release APK...${NC}"
cd android

# Clean gradle build
./gradlew clean

# Build release APK
./gradlew assembleRelease

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ Build successful!${NC}"
    echo ""
    echo -e "${GREEN}📱 APK Location:${NC}"
    echo "   $(pwd)/app/build/outputs/apk/release/app-release.apk"
    echo ""
    
    # Get APK size
    if [ -f "app/build/outputs/apk/release/app-release.apk" ]; then
        APK_SIZE=$(du -h app/build/outputs/apk/release/app-release.apk | cut -f1)
        echo -e "${BLUE}📊 APK Size: ${APK_SIZE}${NC}"
    fi
    
    echo ""
    echo -e "${GREEN}🎉 You can now install this APK on any Android device!${NC}"
    
    # Ask if user wants to install to connected device
    echo ""
    read -p "Would you like to install to a connected device? (y/n): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}📲 Installing to connected device...${NC}"
        ./gradlew installRelease
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✅ Installation successful!${NC}"
        else
            echo -e "${RED}❌ Installation failed. Make sure a device is connected and USB debugging is enabled.${NC}"
        fi
    fi
    
else
    echo -e "${RED}❌ Build failed${NC}"
    exit 1
fi