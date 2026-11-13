import { runSqlSuite } from './support/sql-suite'

// F126 — conditions in the knowledge store. The tests are SQL, in
// supabase/tests/knowledge_conditions.sql; each criterion marker sits on its
// block there.
runSqlSuite({
  file: 'knowledge_conditions.sql',
  title: 'F126 — conditions in the knowledge store',
  claim:
    'conditions have parts, a parent is computed from them, and parked work cannot be marked building',
  atLeast: 6,
})
