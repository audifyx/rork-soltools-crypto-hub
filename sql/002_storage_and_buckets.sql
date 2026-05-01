-- =====================================================================
-- STORAGE BUCKETS CONFIGURATION
-- Supabase Storage buckets for user uploads
-- =====================================================================

-- NOTE: Storage buckets are created via the Supabase Dashboard or API
-- These SQL statements document the required bucket structure

-- BUCKET 1: Avatars
-- Name: avatars
-- Public: true
-- MIME types: image/*
-- Max file size: 5 MB (5242880 bytes)
-- Storage Path: /avatars/{user_id}/avatar.{ext}

-- BUCKET 2: Banners/Wallpapers  
-- Name: banners
-- Public: true
-- MIME types: image/*
-- Max file size: 10 MB (10485760 bytes)
-- Storage Path: /banners/{user_id}/banner.{ext}

-- BUCKET 3: Community Images
-- Name: community-images
-- Public: true
-- MIME types: image/*
-- Max file size: 10 MB (10485760 bytes)
-- Storage Path: /community/{community_id}/{post_id}/image.{ext}

-- Storage Policies Documentation:

-- AVATARS BUCKET:
-- 1. Anonymous can view all avatars (SELECT)
-- 2. Authenticated users can upload to their own avatar folder (INSERT)
-- 3. Users can update/delete their own avatar (UPDATE, DELETE)
-- 4. Admin can delete any avatar (DELETE)

-- BANNERS BUCKET:
-- 1. Anonymous can view all banners (SELECT)
-- 2. Authenticated users can upload to their own banner folder (INSERT)
-- 3. Users can update/delete their own banner (UPDATE, DELETE)
-- 4. Admin can delete any banner (DELETE)

-- COMMUNITY IMAGES BUCKET:
-- 1. Anonymous can view community images (SELECT)
-- 2. Authenticated users can upload to community posts (INSERT)
-- 3. Users can manage their own post images (UPDATE, DELETE)
-- 4. Community admins can delete images in their community (DELETE)

-- NOTE: Configure these policies in the Supabase Dashboard:
-- Storage > [Bucket Name] > Policies

select 'Storage buckets configuration documented. Create buckets in Supabase Dashboard.' as status;
