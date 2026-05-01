# 🔑 Supabase Backend Configuration & API Keys

**Project Name:** Soltools  
**Project ID:** ffjipnkhcebjvttliptb  
**Region:** us-east-1  
**Status:** ✅ Active & Healthy

---

## 🔐 API KEYS & CONFIGURATION

### SUPABASE_URL (Project URL)
```
https://ffjipnkhcebjvttliptb.supabase.co
```
**Title:** `EXPO_PUBLIC_SUPABASE_URL`

### ANON KEY (Public/Anonymous Key)
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZmamlwbmtoY2VianZ0dGxpcHRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1Mjc5NDgsImV4cCI6MjA5MzEwMzk0OH0.aXu8bbpVVwc8KOJf1-lHqO3cz_0GZD10_TE0GlKQ1BI
```
**Title:** `EXPO_PUBLIC_SUPABASE_ANON_KEY`

---

## 🔧 RORK ENVIRONMENT SETUP

Add these variables to your Rork project. In Rork, click **Settings → Environment Variables** and add:

### Variable 1: Supabase URL
```
Key:   EXPO_PUBLIC_SUPABASE_URL
Value: https://ffjipnkhcebjvttliptb.supabase.co
Type:  Public
```

### Variable 2: Supabase Anon Key
```
Key:   EXPO_PUBLIC_SUPABASE_ANON_KEY
Value: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZmamlwbmtoY2VianZ0dGxpcHRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1Mjc5NDgsImV4cCI6MjA5MzEwMzk0OH0.aXu8bbpVVwc8KOJf1-lHqO3cz_0GZD10_TE0GlKQ1BI
Type:  Public
```

---

## 📝 For React Native Code

Add to your `.env.local` or `.env.production`:

```env
# Supabase Configuration
EXPO_PUBLIC_SUPABASE_URL=https://ffjipnkhcebjvttliptb.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZmamlwbmtoY2VianZ0dGxpcHRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1Mjc5NDgsImV4cCI6MjA5MzEwMzk0OH0.aXu8bbpVVwc8KOJf1-lHqO3cz_0GZD10_TE0GlKQ1BI
```

---

## 📦 Installation & Setup in React Native/Expo

### Step 1: Install Supabase Client

```bash
cd /home/claude/rork-soltools-crypto-hub/expo
bun add @supabase/supabase-js
```

### Step 2: Create Supabase Client File

Create `lib/supabase.ts`:

```typescript
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || ''

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
```

### Step 3: Use in Your App

```typescript
import { supabase } from '@/lib/supabase'

// Sign up
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'password123'
})

// Sign in
const { data, error } = await supabase.auth.signIn({
  email: 'user@example.com',
  password: 'password123'
})

// Query database
const { data: profiles } = await supabase
  .from('profiles')
  .select('*')
  .eq('user_id', userId)
```

---

## 📊 Database Schema Overview

Your Supabase project includes **35 tables** with comprehensive Solana trading platform functionality:

### Core Tables
- **auth.users** - Supabase authentication
- **profiles** - User profiles & metadata
- **admin_roles** - Admin user management

### Trading Features
- **trade_history** - Track user trades
- **pnl_positions** - P&L tracking
- **portfolio_snapshots** - Portfolio history
- **price_alerts** - Price alert system
- **enhanced_price_alerts** - Advanced alerts

### Token Management
- **tracked_tokens** - User token watchlists
- **tracked_wallets** - Wallet tracking
- **pump_v5_submissions** - Pump.fun token submissions

### Community Features
- **communities** - Community groups
- **community_members** - Community membership
- **community_posts** - Community posts
- **community_messages** - Community chat
- **followers** - User follow system

### Trading Lobbies
- **trading_lobbies** - Trading groups
- **lobby_members** - Group membership
- **lobby_messages** - Group chat
- **lobby_watchlists** - Group token lists

### Chat & Notifications
- **chat_messages** - Direct messages
- **notifications** - User notifications
- **chat_tracked_wallets** - Chat wallet tracking

### Additional Features
- **live_feed_events** - Real-time blockchain events
- **credit_transactions** - Credit/payment tracking
- **user_credits** - User credit balance
- **user_webhooks** - Webhook management
- **user_activity** - Activity logging
- **user_settings** - User preferences
- **support_tickets** - Support system
- **admin_audit_log** - Admin audit trail
- **platform_settings** - Platform configuration

---

## 🔒 Security & Best Practices

### ✅ DO:
- Use `EXPO_PUBLIC_` prefix for public keys (available client-side)
- Keep anon key in version control (it's public)
- Use Row Level Security (RLS) on all tables
- Never expose SERVICE_ROLE_KEY in client code
- Implement auth checks for sensitive operations

### ❌ DON'T:
- Share SERVICE_ROLE_KEY publicly
- Store secrets in code
- Use direct SQL queries in client code
- Bypass RLS for convenience

---

## 🚀 Connecting to Rork (Step-by-Step)

### Option 1: Direct Environment Variable Entry

1. Go to **rork.com** dashboard
2. Select your **SolTools** project
3. Click **⚙️ Settings**
4. Click **Environment Variables**
5. Add two new variables:

**First Variable:**
```
Name:  EXPO_PUBLIC_SUPABASE_URL
Value: https://ffjipnkhcebjvttliptb.supabase.co
Type:  Public
```

**Second Variable:**
```
Name:  EXPO_PUBLIC_SUPABASE_ANON_KEY
Value: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZmamlwbmtoY2VianZ0dGxpcHRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1Mjc5NDgsImV4cCI6MjA5MzEwMzk0OH0.aXu8bbpVVwc8KOJf1-lHqO3cz_0GZD10_TE0GlKQ1BI
Type:  Public
```

6. Click **Save**
7. Rork will rebuild your app with these variables

### Option 2: Using .env File

1. In your project root, create `.env.local`:
```env
EXPO_PUBLIC_SUPABASE_URL=https://ffjipnkhcebjvttliptb.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZmamlwbmtoY2VianZ0dGxpcHRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1Mjc5NDgsImV4cCI6MjA5MzEwMzk0OH0.aXu8bbpVVwc8KOJf1-lHqO3cz_0GZD10_TE0GlKQ1BI
```

2. Restart Rork dev server
3. Variables will be available via `process.env.EXPO_PUBLIC_*`

---

## 📱 Testing the Connection

### Test in React Component:

```typescript
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function TestSupabase() {
  const [status, setStatus] = useState<'loading' | 'connected' | 'error'>('loading')

  useEffect(() => {
    const testConnection = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('count')
          .single()
        
        if (error) throw error
        setStatus('connected')
        console.log('✅ Connected to Supabase!')
      } catch (err) {
        setStatus('error')
        console.error('❌ Connection failed:', err)
      }
    }

    testConnection()
  }, [])

  return (
    <View>
      <Text>
        {status === 'connected' && '✅ Connected to Supabase'}
        {status === 'error' && '❌ Connection Error'}
        {status === 'loading' && '⏳ Connecting...'}
      </Text>
    </View>
  )
}
```

---

## 🔗 Useful Links

- **Supabase Dashboard**: https://app.supabase.com
- **Project URL**: https://ffjipnkhcebjvttliptb.supabase.co
- **Supabase Docs**: https://supabase.com/docs
- **React Native Guide**: https://supabase.com/docs/guides/getting-started/tutorials/with-react-native
- **Auth Docs**: https://supabase.com/docs/guides/auth
- **Database Guide**: https://supabase.com/docs/guides/database

---

## 📋 Configuration Checklist

- [ ] Copy `EXPO_PUBLIC_SUPABASE_URL` to Rork environment
- [ ] Copy `EXPO_PUBLIC_SUPABASE_ANON_KEY` to Rork environment
- [ ] Add `.env.local` to local development
- [ ] Install `@supabase/supabase-js` package
- [ ] Create `lib/supabase.ts` client file
- [ ] Test connection with sample query
- [ ] Review database schema in Supabase dashboard
- [ ] Set up authentication if needed
- [ ] Configure RLS policies for tables
- [ ] Deploy to production

---

## 🆘 Troubleshooting

### "Cannot find module '@supabase/supabase-js'"
```bash
bun add @supabase/supabase-js
```

### "Invalid API Key"
- Check that `EXPO_PUBLIC_SUPABASE_ANON_KEY` is correct
- Verify it's in Rork environment variables
- Restart dev server after changing env vars

### "Connection Refused"
- Check that `EXPO_PUBLIC_SUPABASE_URL` is correct
- Ensure you have internet connection
- Check Supabase project status (should be "ACTIVE_HEALTHY")

### "RLS policy violation"
- Check row-level security policies in Supabase
- Ensure user is authenticated
- Verify user has permission for the action

---

## 📞 Support

- **Supabase Support**: https://supabase.com/support
- **Discord Community**: https://discord.supabase.io
- **GitHub Issues**: https://github.com/supabase/supabase/issues

---

**Configuration Date:** May 1, 2026  
**Status:** ✅ Ready for Integration

