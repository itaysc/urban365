-- A meeting can fill the day instead of an hour. Existing rows stay timed.

ALTER TABLE "Meeting" ADD COLUMN "allDay" BOOLEAN NOT NULL DEFAULT false;
