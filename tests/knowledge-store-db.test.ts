import { runSqlSuite } from './support/sql-suite'

// F125 — the knowledge store's test suite. The tests are SQL, in
// supabase/tests/knowledge_store.sql, so they read as the store's own rules
// and run with psql as easily as here; each criterion marker sits on its
// block there.
runSqlSuite({
  file: 'knowledge_store.sql',
  title: 'F125 — the knowledge store',
  claim:
    'the knowledge store keeps every version, refuses what its rules refuse, and walls departments off from each other',
  atLeast: 12,
})
