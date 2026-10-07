### bug — deciding a report failed in Postgres

`projectReportRow` used `$2` as both a timestamp and an operand of a CASE, and `$4` as text and in a comparison; Postgres refused the untyped parameters, so `report.decide` and `report.reverse` threw on a real database (mocked tests could not see it). Casts added. Found by the F099 reviewer deciding real reports in the operator queue.
