# 🚀 Rork SolTools Crypto Hub - Complete Setup Guide

## Project Overview

**Rork SolTools Crypto Hub** is a native cross-platform mobile application built with React Native and Expo. It's a comprehensive Solana blockchain utility app for managing crypto projects, tokens, launches, and discovery.

- **Framework**: React Native + Expo Router
- **Platform**: iOS, Android, and Web
- **Language**: TypeScript
- **State Management**: Zustand + React Query
- **Package Manager**: Bun

## ✅ Setup Status

✅ Repository cloned  
✅ Dependencies installed (991 packages)  
✅ Environment ready for development

## 🎯 Quick Start

### Prerequisites
- Node.js v18+ (or use nvm)
- Bun (installed)
- Git

### Installation & Running

```bash
# Navigate to project directory
cd /home/claude/rork-soltools-crypto-hub/expo

# Install dependencies (already done!)
bun install

# Start development server with web preview
bun run start-web

# OR start with mobile preview (requires Expo Go or Rork app)
bun run start
```

## 📁 Project Structure

```
rork-soltools-crypto-hub/
├── expo/                          # Main Expo/React Native app
│   ├── app/                       # Expo Router screens & routing
│   │   ├── (tabs)/               # Tab-based navigation
│   │   │   ├── home.tsx          # Home screen
│   │   │   ├── launches.tsx       # Token launches view
│   │   │   ├── tools.tsx          # Solana tools
│   │   │   ├── discover.tsx       # Discovery page
│   │   │   ├── profile.tsx        # User profile
│   │   │   └── _layout.tsx        # Tab layout config
│   │   ├── tool/[id].tsx          # Individual tool detail page
│   │   ├── launch/[id].tsx        # Launch detail view
│   │   ├── compose.tsx            # Token composition/creation
│   │   ├── list-token.tsx         # Token listing
│   │   ├── _layout.tsx            # Root layout
│   │   ├── +native-intent.tsx    # Native intents handling
│   │   └── +not-found.tsx         # 404 page
│   │
│   ├── components/                # Reusable React components
│   ├── providers/                 # Context providers & app setup
│   ├── constants/                 # App constants & config
│   ├── types/                     # TypeScript type definitions
│   ├── assets/                    # Images, icons, fonts
│   │   └── images/               # App graphics & logos
│   │
│   ├── package.json              # Dependencies & scripts
│   ├── app.json                  # Expo configuration
│   ├── tsconfig.json             # TypeScript config
│   ├── babel.config.js           # Babel configuration
│   ├── metro.config.js           # Metro bundler config
│   └── README.md                 # Development guide
│
├── rork.json                      # Rork framework config
└── SETUP_GUIDE.md                # This file!
```

## 🛠️ Available Commands

```bash
# Development & Preview
bun run start          # Start Expo dev server (mobile preview)
bun run start-web      # Start web preview in browser
bun run start-web-dev  # Start with debug logging

# Linting
bun run lint           # Run ESLint checks

# Building & Deployment (EAS)
eas build:configure    # Configure build settings
eas build --platform ios     # Build for iOS
eas build --platform android # Build for Android
eas build --platform web     # Build for web

eas submit --platform ios    # Submit to App Store
eas submit --platform android # Submit to Google Play

# Testing
bun run test          # Run tests (if configured)
```

## 🔧 Tech Stack Details

### Core Dependencies
- **expo** (54.0.27): Platform for React Native development
- **expo-router** (6.0.17): File-based routing system
- **react** (19.1.0): UI library
- **react-native** (0.81.5): Cross-platform mobile framework
- **react-native-web** (0.21.2): Web support for React Native

### State Management
- **zustand** (5.0.3): Simple state management
- **@tanstack/react-query** (5.83.0): Server state & data fetching
- **@react-native-async-storage/async-storage** (2.2.0): Local data persistence

### UI & Components
- **lucide-react-native** (0.475.0): Icon library
- **expo-blur**: Blur effects
- **expo-linear-gradient**: Gradient support
- **react-native-svg**: SVG rendering
- **react-native-gesture-handler**: Touch gestures
- **react-native-safe-area-context**: Safe area handling
- **react-native-screens**: Native screen stack

### Utilities
- **@rork-ai/toolkit-sdk** (0.2.54): Rork platform integration
- **@ungap/structured-clone**: Clone utilities
- **@stardazed/streams-text-encoding**: Stream encoding

### Development Tools
- **typescript** (5.9.3): Type checking
- **@types/react** (19.1.17): React type definitions
- **eslint** (9.31.0): Code linting
- **babel**: JavaScript transpilation

## 📱 Platform-Specific Setup

### iOS Simulator (macOS only)

```bash
# With Xcode installed:
bun run start -- --ios

# Or manually:
bun run start
# Press 'i' in the terminal
```

### Android Emulator

```bash
# With Android Studio installed:
bun run start -- --android

# Or manually:
bun run start
# Press 'a' in the terminal
```

### Physical Device

1. **Install Expo Go or Rork app**:
   - iOS: App Store → search "Expo Go" or "Rork"
   - Android: Google Play → search "Expo Go"

2. **Connect to same WiFi network as development machine**

3. **Start development server**:
   ```bash
   bun run start
   ```

4. **Scan QR code** with your device camera or Expo Go app

## 🌐 Web Deployment

### Option 1: EAS Hosting (Recommended)

```bash
# Install EAS CLI globally
bun install -g @expo/eas-cli

# Configure hosting
eas hosting:configure

# Deploy
eas hosting:deploy
```

### Option 2: Vercel

```bash
# Install Vercel CLI
bun install -g vercel

# Deploy
vercel
```

### Option 3: Netlify

1. Push code to GitHub
2. Connect repository to Netlify
3. Netlify auto-deploys on push

## 🔐 Environment Configuration

Create `.env` file in the `expo/` directory if needed:

```env
# Example environment variables
# EXPO_PUBLIC_API_URL=https://api.example.com
# EXPO_PUBLIC_WALLET_ADDRESS=your_wallet_here
```

Note: Use `EXPO_PUBLIC_` prefix for variables that should be accessible client-side.

## 🚀 Building for Production

### iOS App Store

```bash
# Install EAS CLI
bun install -g @expo/eas-cli

# Configure project
eas build:configure

# Create a build
eas build --platform ios

# Submit to App Store
eas submit --platform ios

# Provide Apple Developer credentials and TestFlight settings
```

### Google Play

```bash
# Create Android build
eas build --platform android

# Submit to Play Store
eas submit --platform android

# Provide Google Play credentials
```

### Web

```bash
# Build for web
eas build --platform web

# Or manually build
expo export:web

# Then deploy the `dist/` directory to any static hosting
```

## 🐛 Troubleshooting

### Port Already in Use
```bash
# Kill process on port 8081
lsof -ti:8081 | xargs kill -9

# Or use a different port
bun run start -- --port 8082
```

### Module Not Found
```bash
# Clear cache and reinstall
rm -rf node_modules
bun install

# Clear Expo cache
bunx expo start --clear
```

### Network Issues
```bash
# Use tunnel mode for better network handling
bun run start -- --tunnel
```

### Build Failures
```bash
# Check Expo Doctor
bunx expo doctor

# Clear all caches
bunx expo start --clear
rm -rf ~/.bun
```

## 📚 Key Features

This app includes:
- **Home**: Dashboard and main entry point
- **Launches**: Browse upcoming token launches
- **Tools**: Solana utility tools and features
- **Discover**: Discover new tokens and projects
- **Profile**: User profile and settings
- **Token Management**: Create and manage SPL tokens
- **Tool Detail Pages**: In-depth tool information
- **Navigation**: Smooth tab-based navigation with deep linking

## 🔗 Useful Links

- **Rork Documentation**: https://docs.rork.com
- **Expo Documentation**: https://docs.expo.dev
- **React Native Docs**: https://reactnative.dev
- **EAS Build Docs**: https://docs.expo.dev/build/introduction/
- **Solana Docs**: https://docs.solana.com
- **TypeScript Handbook**: https://www.typescriptlang.org/docs/

## 📦 Dependency Management

### Check for Updates
```bash
bun update
```

### Add a New Package
```bash
bun add package-name
```

### Remove a Package
```bash
bun remove package-name
```

### Lock File
The `bun.lock` file is auto-generated and should be committed to git.

## 🎨 Customization

### Change App Icon & Splash Screen
Edit `app.json`:
```json
{
  "expo": {
    "icon": "./assets/images/icon.png",
    "splash": {
      "image": "./assets/images/splash.png"
    }
  }
}
```

### Modify Tab Navigation
Edit `app/(tabs)/_layout.tsx` to add/remove tabs and configure their appearance.

### Add New Routes
Create new files in `app/` directory. Expo Router automatically creates routes based on file paths.

## 🔄 Git Workflow

```bash
# Make changes
git add .
git commit -m "feat: add new feature"

# Push to GitHub
git push origin main

# Changes automatically sync with Rork editor
```

## ⚡ Performance Tips

1. **Use React Query**: Manage server state efficiently with React Query
2. **Lazy Load Routes**: Expo Router supports lazy loading out of the box
3. **Image Optimization**: Use Expo Image component for better performance
4. **Code Splitting**: Keep bundle size small for faster loading

## 📞 Support

- **Rork Community**: https://rork.com/support
- **Expo Community**: https://expo.dev/community
- **GitHub Issues**: Check the repository issues tab

## 📝 License

See repository for license information.

---

**Happy coding! 🎉**

Last Updated: May 1, 2026
