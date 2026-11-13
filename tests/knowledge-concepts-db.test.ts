import { runSqlSuite } from './support/sql-suite'

// F130: concepts in the knowledge store. The tests are SQL, in
// supabase/tests/knowledge_concepts.sql; each criterion marker sits on its
// block there.
runSqlSuite({
  file: 'knowledge_concepts.sql',
  title: 'F130: concepts in the knowledge store',
  claim: 'a concept keeps one id through its names, events and lineage, and drift is found',
  atLeast: 5,
})
