-- =============================================
-- Inkdown Storage Policies
-- Migration: 002_storage_policies
-- Run this AFTER creating buckets in Supabase Dashboard
-- =============================================

-- Storage bucket: attachments (private)
-- Path format: {user_id}/{note_id}/{filename}

-- Allow users to upload to their own folder
CREATE POLICY "Users upload own attachments"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'attachments' AND
  auth.uid()::TEXT = (storage.foldername(name))[1]
);

-- Allow users to view their own files
CREATE POLICY "Users view own attachments"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'attachments' AND
  auth.uid()::TEXT = (storage.foldername(name))[1]
);

-- Allow users to update their own files
CREATE POLICY "Users update own attachments"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'attachments' AND
  auth.uid()::TEXT = (storage.foldername(name))[1]
);

-- Allow users to delete their own files
CREATE POLICY "Users delete own attachments"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'attachments' AND
  auth.uid()::TEXT = (storage.foldername(name))[1]
);

-- Storage bucket: avatars (public read, authenticated write)
CREATE POLICY "Anyone can view avatars"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

CREATE POLICY "Users upload own avatar"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatars' AND
  auth.uid()::TEXT = (storage.foldername(name))[1]
);

CREATE POLICY "Users update own avatar"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'avatars' AND
  auth.uid()::TEXT = (storage.foldername(name))[1]
);
