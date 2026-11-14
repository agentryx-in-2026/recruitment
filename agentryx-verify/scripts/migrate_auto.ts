// Automated E2E testing: runs + per-case results. Idempotent.
import { pool } from "../server/config/db";

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS auto_runs (
      id varchar(21) PRIMARY KEY,
      scope text NOT NULL,                  -- all | applicant | agency | admin
      status varchar(12) NOT NULL DEFAULT 'running',  -- running | finished | error
      started_by varchar(21) REFERENCES reviewers(id),
      started_at timestamptz NOT NULL DEFAULT now(),
      finished_at timestamptz,
      passed integer NOT NULL DEFAULT 0,
      failed integer NOT NULL DEFAULT 0,
      log text NOT NULL DEFAULT ''
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS auto_results (
      id serial PRIMARY KEY,
      run_id varchar(21) NOT NULL REFERENCES auto_runs(id) ON DELETE CASCADE,
      requirement_id varchar(21) NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
      item_ref varchar(16) NOT NULL,
      status varchar(8) NOT NULL,           -- passed | failed
      detail text,
      screenshot text,                      -- file name under uploads/verify/auto/
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS auto_results_req_idx ON auto_results (requirement_id, created_at DESC);`);
  console.log("Migration OK — auto_runs + auto_results ready.");
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
