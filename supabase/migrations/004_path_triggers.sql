-- =============================================
-- Migration 004: Path Triggers
-- Adds automatic path management for hierarchical data
-- =============================================

-- =============================================
-- STEP 1: Backfill existing projects with paths
-- =============================================

-- First, update root-level projects
UPDATE projects
SET
  path = '/' || id::text || '/',
  depth = 0
WHERE parent_id IS NULL AND (path = '' OR path IS NULL);

-- Then update child projects recursively using a function
CREATE OR REPLACE FUNCTION backfill_project_paths()
RETURNS void AS $$
DECLARE
  max_iterations INTEGER := 10;
  iteration INTEGER := 0;
  updated_count INTEGER;
BEGIN
  LOOP
    iteration := iteration + 1;

    -- Update children based on already-populated parents
    WITH updates AS (
      SELECT
        child.id,
        parent.path || child.id::text || '/' AS new_path,
        parent.depth + 1 AS new_depth
      FROM projects child
      JOIN projects parent ON child.parent_id = parent.id
      WHERE parent.path != '' AND parent.path IS NOT NULL
        AND (child.path = '' OR child.path IS NULL OR child.depth != parent.depth + 1)
    )
    UPDATE projects p
    SET path = u.new_path, depth = u.new_depth
    FROM updates u
    WHERE p.id = u.id;

    GET DIAGNOSTICS updated_count = ROW_COUNT;

    EXIT WHEN updated_count = 0 OR iteration >= max_iterations;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

SELECT backfill_project_paths();
DROP FUNCTION backfill_project_paths();

-- =============================================
-- STEP 2: Backfill existing notes with paths
-- =============================================

-- First, update root-level notes
UPDATE notes
SET
  path = '/' || id::text || '/',
  depth = 0
WHERE parent_note_id IS NULL AND (path = '' OR path IS NULL);

-- Then update child notes recursively
CREATE OR REPLACE FUNCTION backfill_note_paths()
RETURNS void AS $$
DECLARE
  max_iterations INTEGER := 15;
  iteration INTEGER := 0;
  updated_count INTEGER;
BEGIN
  LOOP
    iteration := iteration + 1;

    WITH updates AS (
      SELECT
        child.id,
        parent.path || child.id::text || '/' AS new_path,
        parent.depth + 1 AS new_depth
      FROM notes child
      JOIN notes parent ON child.parent_note_id = parent.id
      WHERE parent.path != '' AND parent.path IS NOT NULL
        AND (child.path = '' OR child.path IS NULL OR child.depth != parent.depth + 1)
    )
    UPDATE notes n
    SET path = u.new_path, depth = u.new_depth
    FROM updates u
    WHERE n.id = u.id;

    GET DIAGNOSTICS updated_count = ROW_COUNT;

    EXIT WHEN updated_count = 0 OR iteration >= max_iterations;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

SELECT backfill_note_paths();
DROP FUNCTION backfill_note_paths();

-- =============================================
-- STEP 3: Create path update trigger for projects
-- =============================================

CREATE OR REPLACE FUNCTION update_project_path()
RETURNS TRIGGER AS $$
DECLARE
  new_path TEXT;
  old_full_path TEXT;
  new_full_path TEXT;
BEGIN
  -- Calculate new path based on parent
  IF NEW.parent_id IS NULL THEN
    new_path := '/' || NEW.id::text || '/';
    NEW.depth := 0;
  ELSE
    SELECT p.path || NEW.id::text || '/', p.depth + 1
    INTO new_path, NEW.depth
    FROM projects p
    WHERE p.id = NEW.parent_id;

    -- If parent not found, treat as root
    IF new_path IS NULL THEN
      new_path := '/' || NEW.id::text || '/';
      NEW.depth := 0;
    END IF;
  END IF;

  -- If path changed (update operation), update all descendants
  IF TG_OP = 'UPDATE' AND OLD.path IS DISTINCT FROM new_path AND OLD.path IS NOT NULL AND OLD.path != '' THEN
    old_full_path := OLD.path;
    new_full_path := new_path;

    -- Update all descendant projects
    UPDATE projects
    SET
      path = new_full_path || substring(path from length(old_full_path) + 1),
      depth = depth + (NEW.depth - OLD.depth),
      updated_at = NOW()
    WHERE path LIKE old_full_path || '%'
      AND id != NEW.id;
  END IF;

  NEW.path := new_path;
  NEW.updated_at := NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if any
DROP TRIGGER IF EXISTS projects_update_path ON projects;

-- Create trigger
CREATE TRIGGER projects_update_path
  BEFORE INSERT OR UPDATE OF parent_id ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_project_path();

-- =============================================
-- STEP 4: Create path update trigger for notes
-- =============================================

CREATE OR REPLACE FUNCTION update_note_path()
RETURNS TRIGGER AS $$
DECLARE
  new_path TEXT;
  old_full_path TEXT;
  new_full_path TEXT;
BEGIN
  -- Calculate new path based on parent note
  IF NEW.parent_note_id IS NULL THEN
    new_path := '/' || NEW.id::text || '/';
    NEW.depth := 0;
  ELSE
    SELECT n.path || NEW.id::text || '/', n.depth + 1
    INTO new_path, NEW.depth
    FROM notes n
    WHERE n.id = NEW.parent_note_id;

    -- If parent not found, treat as root
    IF new_path IS NULL THEN
      new_path := '/' || NEW.id::text || '/';
      NEW.depth := 0;
    END IF;
  END IF;

  -- If path changed, update all descendants
  IF TG_OP = 'UPDATE' AND OLD.path IS DISTINCT FROM new_path AND OLD.path IS NOT NULL AND OLD.path != '' THEN
    old_full_path := OLD.path;
    new_full_path := new_path;

    -- Update all descendant notes
    UPDATE notes
    SET
      path = new_full_path || substring(path from length(old_full_path) + 1),
      depth = depth + (NEW.depth - OLD.depth),
      -- Optionally inherit project_id from new parent
      project_id = CASE
        WHEN NEW.project_id IS NOT NULL THEN NEW.project_id
        ELSE project_id
      END,
      updated_at = NOW()
    WHERE path LIKE old_full_path || '%'
      AND id != NEW.id;
  END IF;

  NEW.path := new_path;
  NEW.updated_at := NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if any
DROP TRIGGER IF EXISTS notes_update_path ON notes;

-- Create trigger
CREATE TRIGGER notes_update_path
  BEFORE INSERT OR UPDATE OF parent_note_id ON notes
  FOR EACH ROW
  EXECUTE FUNCTION update_note_path();

-- =============================================
-- STEP 5: Add path validation constraints (optional)
-- These validate path format but can be disabled if causing issues
-- =============================================

-- Add constraint to validate path format (uuid pattern)
-- Pattern: /uuid/ or /uuid/uuid/...
-- Commented out by default as it might be too strict
-- ALTER TABLE projects
--   ADD CONSTRAINT valid_project_path CHECK (path ~ '^/([a-f0-9-]+/)+$');

-- ALTER TABLE notes
--   ADD CONSTRAINT valid_note_path CHECK (path ~ '^/([a-f0-9-]+/)+$');

-- =============================================
-- STEP 6: Create helper functions for path queries
-- =============================================

-- Function to get all ancestors of a project
CREATE OR REPLACE FUNCTION get_project_ancestors(p_project_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  depth INTEGER,
  path TEXT
) AS $$
DECLARE
  project_path TEXT;
  ancestor_ids UUID[];
BEGIN
  -- Get the project's path
  SELECT p.path INTO project_path
  FROM projects p
  WHERE p.id = p_project_id;

  IF project_path IS NULL THEN
    RETURN;
  END IF;

  -- Parse path to get ancestor IDs (excluding the project itself)
  SELECT ARRAY(
    SELECT uuid(unnest)
    FROM unnest(string_to_array(trim(both '/' from project_path), '/'))
    WHERE unnest != p_project_id::text
  ) INTO ancestor_ids;

  -- Return ancestors in order of depth
  RETURN QUERY
  SELECT p.id, p.name, p.depth, p.path
  FROM projects p
  WHERE p.id = ANY(ancestor_ids)
  ORDER BY p.depth;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get all ancestors of a note
CREATE OR REPLACE FUNCTION get_note_ancestors(p_note_id UUID)
RETURNS TABLE (
  id UUID,
  title TEXT,
  depth INTEGER,
  path TEXT
) AS $$
DECLARE
  note_path TEXT;
  ancestor_ids UUID[];
BEGIN
  SELECT n.path INTO note_path
  FROM notes n
  WHERE n.id = p_note_id;

  IF note_path IS NULL THEN
    RETURN;
  END IF;

  SELECT ARRAY(
    SELECT uuid(unnest)
    FROM unnest(string_to_array(trim(both '/' from note_path), '/'))
    WHERE unnest != p_note_id::text
  ) INTO ancestor_ids;

  RETURN QUERY
  SELECT n.id, n.title, n.depth, n.path
  FROM notes n
  WHERE n.id = ANY(ancestor_ids)
  ORDER BY n.depth;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get all descendants of a project
CREATE OR REPLACE FUNCTION get_project_descendants(p_project_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  depth INTEGER,
  path TEXT
) AS $$
DECLARE
  project_path TEXT;
BEGIN
  SELECT p.path INTO project_path
  FROM projects p
  WHERE p.id = p_project_id;

  IF project_path IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.id, p.name, p.depth, p.path
  FROM projects p
  WHERE p.path LIKE project_path || '%'
    AND p.id != p_project_id
    AND p.is_deleted = FALSE
  ORDER BY p.depth, p.sort_order;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get all descendants of a note
CREATE OR REPLACE FUNCTION get_note_descendants(p_note_id UUID)
RETURNS TABLE (
  id UUID,
  title TEXT,
  depth INTEGER,
  path TEXT
) AS $$
DECLARE
  note_path TEXT;
BEGIN
  SELECT n.path INTO note_path
  FROM notes n
  WHERE n.id = p_note_id;

  IF note_path IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT n.id, n.title, n.depth, n.path
  FROM notes n
  WHERE n.path LIKE note_path || '%'
    AND n.id != p_note_id
    AND n.is_deleted = FALSE
  ORDER BY n.depth, n.sort_order;
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================
-- STEP 7: Grant permissions
-- =============================================

GRANT EXECUTE ON FUNCTION get_project_ancestors TO authenticated;
GRANT EXECUTE ON FUNCTION get_note_ancestors TO authenticated;
GRANT EXECUTE ON FUNCTION get_project_descendants TO authenticated;
GRANT EXECUTE ON FUNCTION get_note_descendants TO authenticated;

-- =============================================
-- COMPLETE
-- =============================================
