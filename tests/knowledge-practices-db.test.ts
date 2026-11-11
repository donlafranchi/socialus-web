import { runSqlSuite } from './support/sql-suite'

// F128: how we work in the knowledge store. The tests are SQL, in
// supabase/tests/knowledge_practices.sql; each criterion marker sits on its
// block there.
runSqlSuite({
  file: 'knowledge_practices.sql',
  title: 'F128: how we work in the knowledge store',
  claim: 'practices carry a ring and a check, experiments keep their terms, and how answers from live records',
  atLeast: 6,
})
