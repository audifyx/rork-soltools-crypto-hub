# Users & Profile Management Feature
**Date:** May 1, 2026 | **Status:** ✅ COMPLETE

## Overview
Complete user management system with online status tracking, profile editing, and user discovery.

---

## 1. Database Tables Created

### `user_sessions` Table
Tracks active user sessions and online status.

**Columns:**
- `id` (uuid) - Primary key
- `user_id` (uuid) - References auth.users
- `session_token` (text) - Unique session identifier
- `ip_address` (text) - User's IP address
- `user_agent` (text) - Browser user agent
- `last_activity_at` (timestamptz) - Last activity timestamp
- `created_at` (timestamptz) - Session creation time

**Indexes:**
- `user_sessions_user_id_idx` - Fast user lookup
- `user_sessions_last_activity_idx` - Fast online status queries

**RLS Policies:**
- ✅ View all sessions (public)
- ✅ Manage own sessions (authenticated)

---

## 2. Functions Created

### `update_user_session(session_token TEXT)`
Updates user's last activity time (call on every user interaction).

```sql
SELECT update_user_session('session_token_here');
```

**Usage:** Call this function every time user performs an action (scroll, click, type, etc.).

---

### `get_online_users(minutes_threshold INT = 5)`
Returns list of currently online users (active within threshold minutes).

**Returns:**
- `user_id` (uuid)
- `username` (text)
- `avatar_url` (text)
- `followers_count` (integer)
- `last_activity_at` (timestamptz)

**Example:**
```sql
SELECT * FROM get_online_users(5);  -- Users active in last 5 minutes
```

---

### `get_all_users(page_num INT = 1, page_size INT = 20)`
Returns paginated list of all users with online status indicator.

**Returns:**
- `user_id` (uuid)
- `username` (text)
- `avatar_url` (text)
- `followers_count` (integer)
- `badge` (text)
- `created_at` (timestamptz)
- `is_online` (boolean) - True if active in last 5 minutes

**Example:**
```sql
SELECT * FROM get_all_users(1, 20);  -- First 20 users
SELECT * FROM get_all_users(2, 20);  -- Second page of 20 users
```

---

### `update_user_profile(...)`
Allows users to update their profile information.

**Parameters:**
- `avatar_url_new` (text) - New avatar URL (from storage bucket)
- `custom_wallpaper_url_new` (text) - New banner/wallpaper URL
- `bio_new` (text) - User bio
- `twitter_handle_new` (text) - Twitter handle
- `discord_handle_new` (text) - Discord handle
- `website_new` (text) - Website URL

**Returns:** JSON with updated profile fields

**Example:**
```sql
SELECT update_user_profile(
  'https://avatars.../avatar.jpg',
  'https://banners.../banner.jpg',
  'Crypto trader and analyst',
  '@cryptouser',
  'cryptouser#1234',
  'https://example.com'
);
```

---

### `get_user_profile(target_user_id UUID)`
Retrieves full profile information for a user.

**Returns:** JSON object with:
- user_id, username, avatar_url, custom_wallpaper_url
- bio, twitter_handle, discord_handle, website
- followers_count, following_count, badge
- created_at, updated_at

**Example:**
```sql
SELECT get_user_profile('user-id-uuid');
```

---

### `cleanup_old_sessions()`
Deletes sessions older than 30 days (maintenance function).

```sql
SELECT cleanup_old_sessions();
```

---

## 3. Storage Buckets

Three public storage buckets for user uploads:

### **Bucket 1: `avatars`**
- **Purpose:** User profile pictures
- **Max Size:** 5 MB
- **MIME Types:** image/*
- **Path:** `/avatars/{user_id}/avatar.{ext}`
- **Public:** Yes (CDN accessible)

### **Bucket 2: `banners`**
- **Purpose:** User profile banners/wallpapers
- **Max Size:** 10 MB
- **MIME Types:** image/*
- **Path:** `/banners/{user_id}/banner.{ext}`
- **Public:** Yes (CDN accessible)

### **Bucket 3: `community-images`**
- **Purpose:** Community post and content images
- **Max Size:** 10 MB
- **MIME Types:** image/*
- **Path:** `/community/{community_id}/{post_id}/image.{ext}`
- **Public:** Yes (CDN accessible)

---

## 4. Storage Policies

Each bucket requires RLS policies (configure in Supabase Dashboard):

### **Avatars Bucket Policies:**
1. **Public Read:** Allow anonymous users to view all avatars
2. **User Upload:** Allow authenticated users to upload to `/avatars/{user_id}/`
3. **User Edit:** Allow users to update/delete their own avatars
4. **Admin Delete:** Allow admins to delete any avatar

### **Banners Bucket Policies:**
1. **Public Read:** Allow anonymous users to view all banners
2. **User Upload:** Allow authenticated users to upload to `/banners/{user_id}/`
3. **User Edit:** Allow users to update/delete their own banners
4. **Admin Delete:** Allow admins to delete any banner

### **Community Images Bucket Policies:**
1. **Public Read:** Allow anonymous users to view community images
2. **User Upload:** Allow authenticated users to upload to `/community/`
3. **User Manage:** Allow users to manage their own post images
4. **Admin Delete:** Allow community admins to delete images

---

## 5. Frontend Implementation Guide

### Call Session Update
```typescript
// App.tsx or main layout
useEffect(() => {
  const handleUserActivity = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      await supabase.rpc('update_user_session', {
        session_token: session.access_token
      });
    }
  };

  window.addEventListener('click', handleUserActivity);
  window.addEventListener('scroll', handleUserActivity);
  
  return () => {
    window.removeEventListener('click', handleUserActivity);
    window.removeEventListener('scroll', handleUserActivity);
  };
}, []);
```

### Get Online Users
```typescript
const getOnlineUsers = async () => {
  const { data, error } = await supabase
    .rpc('get_online_users', { minutes_threshold: 5 });
  return data;
};
```

### Get All Users (Users Tab)
```typescript
const getAllUsers = async (page = 1, pageSize = 20) => {
  const { data, error } = await supabase
    .rpc('get_all_users', { page_num: page, page_size: pageSize });
  return data;
};
```

### Update Profile
```typescript
const updateProfile = async (updates: {
  avatar_url?: string;
  custom_wallpaper_url?: string;
  bio?: string;
  twitter_handle?: string;
  discord_handle?: string;
  website?: string;
}) => {
  const { data, error } = await supabase.rpc('update_user_profile', {
    avatar_url_new: updates.avatar_url,
    custom_wallpaper_url_new: updates.custom_wallpaper_url,
    bio_new: updates.bio,
    twitter_handle_new: updates.twitter_handle,
    discord_handle_new: updates.discord_handle,
    website_new: updates.website
  });
  return data;
};
```

### Upload Avatar
```typescript
const uploadAvatar = async (file: File) => {
  const { data: { user } } = await supabase.auth.getUser();
  const filename = `${Date.now()}-${file.name}`;
  
  const { data, error } = await supabase.storage
    .from('avatars')
    .upload(`${user?.id}/${filename}`, file);
    
  if (!error) {
    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(`${user?.id}/${filename}`);
      
    await updateProfile({ avatar_url: publicUrl });
  }
};
```

---

## 6. Features Summary

✅ **User Discovery**
- Browse all platform users
- See user profiles
- Pagination support

✅ **Online Status**
- Real-time online indicator
- Last activity timestamp
- Configurable threshold (5 min default)

✅ **Profile Management**
- Edit avatar (upload to storage)
- Edit banner/wallpaper (upload to storage)
- Edit bio and social links
- All updates tracked with timestamps

✅ **Storage Integration**
- Public CDN-accessible buckets
- File size limits per bucket
- MIME type restrictions
- User-organized storage paths

✅ **Performance**
- Indexed tables for fast queries
- Pagination for users list
- Efficient session cleanup
- RLS policies for security

---

## 7. Next Steps

1. **Create Storage Buckets** (Supabase Dashboard):
   - Storage > Create New Bucket: `avatars`
   - Storage > Create New Bucket: `banners`
   - Storage > Create New Bucket: `community-images`

2. **Configure Storage Policies** (Supabase Dashboard):
   - For each bucket, set up RLS policies as documented above

3. **Frontend Integration:**
   - Implement session tracking
   - Build users discovery tab
   - Create profile edit forms
   - Integrate file upload components

4. **Testing:**
   - Test online status tracking
   - Test profile updates
   - Test file uploads
   - Test pagination

---

## Status: 🟢 READY FOR FRONTEND INTEGRATION
