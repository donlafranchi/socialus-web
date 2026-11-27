import { runSqlSuite } from './support/sql-suite'

// F137: themes in the store. The tests are SQL, in supabase/tests/knowledge_themes.sql; each criterion marker sits on its block there.
runSqlSuite({
  file: 'knowledge_themes.sql',
  title: 'F137: themes in the store',
  claim: 'a theme is a record that holds journeys, a journey sits under one or more themes, and each answers for the other',
  atLeast: 6,
  timeout: 30_000,
})
