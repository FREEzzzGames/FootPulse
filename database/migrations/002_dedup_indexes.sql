-- Deduplication and lookup indexes. Existing duplicates are retained rather than silently deleted.
CREATE UNIQUE INDEX IF NOT EXISTS teams_name_ci_unique ON teams (lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS competitions_name_country_ci_unique ON competitions (lower(name), COALESCE(lower(country), ''));
CREATE UNIQUE INDEX IF NOT EXISTS seasons_competition_name_ci_unique ON seasons (competition_id, lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS matches_natural_key_unique ON matches (match_date, home_team_id, away_team_id, competition_id, season_id) WHERE match_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS players_family_name_lower_idx ON players (lower(family_name));
CREATE INDEX IF NOT EXISTS players_full_name_lower_idx ON players (lower(full_name));
CREATE INDEX IF NOT EXISTS source_records_entity_external_idx ON source_records (source_id, entity_type, external_id);
CREATE INDEX IF NOT EXISTS match_events_external_event_idx ON match_events (match_id, source_id, (details->>'external_event_id'));
