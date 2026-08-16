-- Add NO_MOVEMENT to the ExceptionType enum so prolonged no-tracking-movement
-- can be a first-class exception that drives email/Slack notifications.
ALTER TYPE "ExceptionType" ADD VALUE IF NOT EXISTS 'NO_MOVEMENT' BEFORE 'OTHER';
