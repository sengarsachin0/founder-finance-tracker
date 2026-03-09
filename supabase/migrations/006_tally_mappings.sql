-- Tally ledger → expense category mapping table
CREATE TABLE tally_ledger_mappings (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ledger_name TEXT        NOT NULL,
  category    TEXT        NOT NULL DEFAULT 'Other',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, ledger_name)
);

ALTER TABLE tally_ledger_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own Tally mappings"
  ON tally_ledger_mappings FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
