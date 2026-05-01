# Environment Configuration Template

This file documents how to set up environment variables for the Rork SolTools Crypto Hub application.

## Creating Environment Files

### Web Preview (.env.local)
Create `expo/.env.local` for local development:

```env
# API Configuration
EXPO_PUBLIC_API_URL=http://localhost:3000
EXPO_PUBLIC_API_TIMEOUT=30000

# Solana Configuration
EXPO_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
EXPO_PUBLIC_SOLANA_NETWORK=devnet

# App Configuration
EXPO_PUBLIC_APP_NAME=SolTools
EXPO_PUBLIC_APP_VERSION=1.0.0

# Feature Flags
EXPO_PUBLIC_ENABLE_LAUNCHES=true
EXPO_PUBLIC_ENABLE_TOOLS=true
EXPO_PUBLIC_ENABLE_DISCOVERY=true
EXPO_PUBLIC_ENABLE_PROFILE=true
```

### Production (.env.production)
Create `expo/.env.production` for production builds:

```env
# Production API
EXPO_PUBLIC_API_URL=https://api.soltools.app
EXPO_PUBLIC_API_TIMEOUT=30000

# Solana Mainnet
EXPO_PUBLIC_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
EXPO_PUBLIC_SOLANA_NETWORK=mainnet-beta

# App Configuration
EXPO_PUBLIC_APP_NAME=SolTools
EXPO_PUBLIC_APP_VERSION=1.0.0

# Feature Flags
EXPO_PUBLIC_ENABLE_LAUNCHES=true
EXPO_PUBLIC_ENABLE_TOOLS=true
EXPO_PUBLIC_ENABLE_DISCOVERY=true
EXPO_PUBLIC_ENABLE_PROFILE=true
```

## Important Notes

⚠️ **IMPORTANT**: Only variables prefixed with `EXPO_PUBLIC_` are accessible to your app!

Variables without the `EXPO_PUBLIC_` prefix will NOT be available in your app code.

```typescript
// ✅ This works
const apiUrl = process.env.EXPO_PUBLIC_API_URL;

// ❌ This will be undefined
const secret = process.env.EXPO_PUBLIC_API_SECRET;
```

## Environment Variables by Purpose

### API Configuration
```env
# Backend API endpoint
EXPO_PUBLIC_API_URL=https://api.soltools.app

# Request timeout in milliseconds
EXPO_PUBLIC_API_TIMEOUT=30000

# API version
EXPO_PUBLIC_API_VERSION=v1
```

### Blockchain Configuration
```env
# Solana RPC endpoint (devnet, testnet, or mainnet)
EXPO_PUBLIC_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# Network name
EXPO_PUBLIC_SOLANA_NETWORK=mainnet-beta

# SPL Token Program ID
EXPO_PUBLIC_TOKEN_PROGRAM_ID=TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPutLh
```

### Feature Flags
```env
# Enable/disable app features
EXPO_PUBLIC_ENABLE_LAUNCHES=true
EXPO_PUBLIC_ENABLE_TOOLS=true
EXPO_PUBLIC_ENABLE_DISCOVERY=true
EXPO_PUBLIC_ENABLE_PROFILE=true
EXPO_PUBLIC_ENABLE_WALLET_CONNECT=true
```

### Authentication
```env
# Wallet configuration
EXPO_PUBLIC_WALLET_NETWORK=mainnet-beta

# RPC Cluster
EXPO_PUBLIC_RPC_CLUSTER=mainnet-beta

# Auth provider (if using external auth)
EXPO_PUBLIC_AUTH_PROVIDER=phantom
```

### Analytics & Monitoring
```env
# Analytics service
EXPO_PUBLIC_ANALYTICS_KEY=your-analytics-key

# Error tracking
EXPO_PUBLIC_ERROR_TRACKING_KEY=your-sentry-key

# App version for tracking
EXPO_PUBLIC_APP_VERSION=1.0.0
```

## Using Environment Variables in Code

### React Component
```typescript
import Constants from 'expo-constants';

export const MyComponent = () => {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  
  return <Text>{apiUrl}</Text>;
};
```

### Custom Hook
```typescript
export const useApiConfig = () => {
  const baseUrl = process.env.EXPO_PUBLIC_API_URL;
  const timeout = parseInt(process.env.EXPO_PUBLIC_API_TIMEOUT || '30000');
  
  return { baseUrl, timeout };
};
```

### API Call Example
```typescript
const response = await fetch(
  `${process.env.EXPO_PUBLIC_API_URL}/api/tools`,
  {
    timeout: parseInt(process.env.EXPO_PUBLIC_API_TIMEOUT || '30000')
  }
);
```

## Development Workflow

### Local Development
```bash
# 1. Create .env.local file
cd expo
cp .env.local.example .env.local

# 2. Edit with your development settings
nano .env.local

# 3. Start development server
bun run start-web
```

### Building for Production
```bash
# Environment is automatically selected based on build context
eas build --platform ios        # Uses .env.production
eas build --platform android    # Uses .env.production
```

### Testing Different Environments
```bash
# Test with development settings
EAS_BUILD_PROFILE=development eas build --platform ios

# Test with staging settings
EAS_BUILD_PROFILE=staging eas build --platform ios

# Production build
EAS_BUILD_PROFILE=production eas build --platform ios
```

## Common Configurations

### Development (Local Testing)
```env
EXPO_PUBLIC_SOLANA_NETWORK=devnet
EXPO_PUBLIC_API_URL=http://localhost:3000
EXPO_PUBLIC_ENABLE_LAUNCHES=true
```

### Staging (Pre-Production)
```env
EXPO_PUBLIC_SOLANA_NETWORK=testnet
EXPO_PUBLIC_API_URL=https://staging-api.soltools.app
EXPO_PUBLIC_ENABLE_LAUNCHES=true
```

### Production (Live)
```env
EXPO_PUBLIC_SOLANA_NETWORK=mainnet-beta
EXPO_PUBLIC_API_URL=https://api.soltools.app
EXPO_PUBLIC_ENABLE_LAUNCHES=true
```

## Security Best Practices

✅ **DO:**
- Prefix public variables with `EXPO_PUBLIC_`
- Commit `.env.example` to repository (WITHOUT values)
- Use `.gitignore` to exclude `.env` files
- Rotate secrets regularly
- Use Expo Secrets for sensitive data

❌ **DON'T:**
- Commit `.env` files to repository
- Store API keys in code
- Use secrets as environment variables (use Expo Secrets instead)
- Share `.env` files via email or chat

## Using Expo Secrets (Sensitive Data)

For truly sensitive data like API keys, use Expo Secrets:

```bash
# Set a secret
eas secret:create --scope project --name API_SECRET --value "your-secret-value"

# Use in eas.json:
{
  "build": {
    "production": {
      "env": {
        "API_SECRET": "@API_SECRET"
      }
    }
  }
}
```

## Troubleshooting

### Variables Not Loading
```bash
# Clear cache and restart
bunx expo start --clear

# Verify .env file exists
ls -la .env.local

# Check for typos in variable names
# Remember: must start with EXPO_PUBLIC_
```

### Hot Reload Not Picking Up Changes
```bash
# Restart dev server
# Press 'r' in terminal

# Or completely restart
bunx expo start --clear
```

### Different Values on Build vs Dev
- Check file naming: `.env.local` vs `.env.production`
- Verify variable prefixes: `EXPO_PUBLIC_*`
- Clear build cache: `eas build:cache --delete`

---

**Need Help?**
- Expo Docs: https://docs.expo.dev/guides/environment-variables/
- EAS Secrets: https://docs.expo.dev/build-reference/variables/
