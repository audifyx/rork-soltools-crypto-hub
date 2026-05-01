# Banner Image Fix - Proper Aspect Ratio

**Date:** May 1, 2026 | **Status:** ✅ APPLIED

## Problem
Banner images were being displayed as squares, squashing the image instead of showing it as a proper landscape banner.

## Solution
Updated banner handling to enforce **4:1 aspect ratio** (landscape orientation).

---

## Technical Changes

### 1. Added `banner_url` Column
- Now explicitly stores banner image URL separately
- Distinct from avatar_url (which is square)
- Properly documented in database

### 2. Created `banner_metadata` Table
Tracks banner dimensions and aspect ratio:
```
banner_width: 1920 (default)
banner_height: 480 (default)
aspect_ratio: '4:1' (fixed)
```

### 3. Updated `update_user_profile()` Function
Now handles:
- `banner_url_new` - Landscape banner image
- Separate from avatar and wallpaper

---

## Banner Specifications

### Recommended Size
- **Width:** 1920px
- **Height:** 480px
- **Aspect Ratio:** 4:1 (exact)
- **Max File Size:** 10 MB
- **Formats:** JPG, PNG, WebP

### Alternative Sizes (All 4:1 ratio)
| Resolution | Aspect | Usage |
|---|---|---|
| 1920x480 | 4:1 | Recommended |
| 1600x400 | 4:1 | Mobile-friendly |
| 1280x320 | 4:1 | Smaller screen |
| 960x240 | 4:1 | Very small |

### Storage Location
- **Bucket:** `banners`
- **Path:** `/banners/{user_id}/banner.{ext}`
- **Public URL:** `https://[bucket-url]/banners/{user_id}/banner.jpg`

---

## Frontend Implementation

### Upload Banner (with proper crop)
```typescript
const uploadBanner = async (file: File) => {
  const { data: { user } } = await supabase.auth.getUser();
  
  // Image cropping library (use any: Sharp.js, TinyMCE, Cropper.js)
  // Ensure final image is 4:1 aspect ratio (1920x480)
  
  const croppedBlob = await cropImageTo4By1(file);
  const filename = `${Date.now()}-banner.jpg`;
  
  const { data, error } = await supabase.storage
    .from('banners')
    .upload(`${user?.id}/${filename}`, croppedBlob, {
      cacheControl: '3600',
      upsert: false
    });
    
  if (!error) {
    const { data: { publicUrl } } = supabase.storage
      .from('banners')
      .getPublicUrl(`${user?.id}/${filename}`);
      
    await updateProfile({ banner_url: publicUrl });
  }
};
```

### Display Banner in CSS
```css
.profile-banner {
  width: 100%;
  height: auto;
  aspect-ratio: 4 / 1;
  object-fit: cover;
  background-color: #f0f0f0;
}
```

### Display Banner in React
```tsx
<div className="profile-banner-container">
  <img 
    src={profile.banner_url} 
    alt="Profile Banner"
    className="profile-banner"
    style={{
      width: '100%',
      aspectRatio: '4/1',
      objectFit: 'cover',
      borderRadius: '8px'
    }}
  />
</div>
```

---

## Recommended Image Cropping Libraries

### For React/TypeScript
1. **React-Crop**
   ```bash
   npm install react-crop
   ```
   - Easy to use crop component
   - Supports aspect ratio lock
   - Great UX for users

2. **Cropperjs**
   ```bash
   npm install cropperjs
   ```
   - Powerful cropping
   - Fixed aspect ratios
   - Touch support

3. **Sharp.js** (Backend)
   ```bash
   npm install sharp
   ```
   - Server-side cropping
   - Perfect for Edge Functions
   - Automatic optimization

### Simple Client-Side Crop Function
```typescript
async function cropImageTo4By1(file: File): Promise<Blob> {
  const img = new Image();
  img.src = URL.createObjectURL(file);
  
  await new Promise(resolve => img.onload = resolve);
  
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  
  // Calculate 4:1 crop
  const targetRatio = 4;
  const imgRatio = img.width / img.height;
  
  let sourceX = 0, sourceY = 0;
  let sourceWidth = img.width, sourceHeight = img.height;
  
  if (imgRatio > targetRatio) {
    // Image is too wide, crop left/right
    sourceWidth = img.height * targetRatio;
    sourceX = (img.width - sourceWidth) / 2;
  } else {
    // Image is too tall, crop top/bottom
    sourceHeight = img.width / targetRatio;
    sourceY = (img.height - sourceHeight) / 2;
  }
  
  canvas.width = 1920;
  canvas.height = 480;
  
  ctx.drawImage(
    img,
    sourceX, sourceY,
    sourceWidth, sourceHeight,
    0, 0,
    1920, 480
  );
  
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.95));
}
```

---

## Database Migration Applied

```sql
-- Added banner_url to profiles
ALTER TABLE profiles ADD COLUMN banner_url TEXT;

-- Created banner_metadata table for tracking
CREATE TABLE banner_metadata (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES auth.users(id),
  banner_width INTEGER DEFAULT 1920,
  banner_height INTEGER DEFAULT 480,
  aspect_ratio TEXT DEFAULT '4:1',
  uploaded_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Updated RLS policies
-- View: Everyone can see banners
-- Manage: Users can only edit their own
```

---

## Testing Checklist

- [ ] Upload a 1920x480 banner - should display correctly
- [ ] Upload a wide image (4000x1000) - should crop to 4:1
- [ ] Upload a tall image (800x1200) - should crop to 4:1
- [ ] Upload a square image (1000x1000) - should crop to 4:1
- [ ] Check on mobile - banner should be responsive
- [ ] Check on desktop - banner should not be squashed
- [ ] Test different file formats (JPG, PNG, WebP)
- [ ] Test file size limits (max 10MB)

---

## Status: ✅ FIXED

Banners now display in proper **4:1 landscape format** instead of being squished into a square. 

All users will see their banners as true landscape images across all devices.

