# Heuristic boundaries

This capability reviews SQL text only. It flags SELECT *, UPDATE/DELETE without a WHERE, implicit comma joins, unbounded SELECT, and leading-wildcard LIKE. It is intentionally not a SQL parser: comments, quoted dialect edge cases, CTE semantics, dynamic SQL, and data-flow are outside the contract. It never connects to or executes PostgreSQL.
