BEGIN;
SET LOCAL lock_timeout = '5s';
LOCK TABLE ONLY public.quests IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quests' AND column_name = 'cooldown'
      AND data_type = 'character varying' AND is_nullable = 'YES' AND column_default IS NULL
  ) THEN
    RAISE EXCEPTION 'Unexpected quests.cooldown schema. No changes made.';
  END IF;
END $$;

ALTER TABLE ONLY public.quests
  ALTER COLUMN cooldown TYPE numeric USING (0::numeric),
  ALTER COLUMN cooldown SET DEFAULT 0;

DO $$
BEGIN
  IF EXISTS (SELECT FROM public.quests WHERE cooldown IS DISTINCT FROM 0) THEN
    RAISE EXCEPTION 'Some quest cooldown values were not reset.';
  END IF;
END $$;

COMMIT;
