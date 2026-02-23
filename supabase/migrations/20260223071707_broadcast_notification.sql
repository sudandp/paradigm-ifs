-- Create an RPC to broadcast a notification to all users
CREATE OR REPLACE FUNCTION broadcast_notification(
  p_message text,
  p_type text,
  p_severity text,
  p_metadata jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO notifications (user_id, message, type, severity, metadata)
  SELECT id, p_message, p_type, p_severity, p_metadata
  FROM users;
END;
$$;
