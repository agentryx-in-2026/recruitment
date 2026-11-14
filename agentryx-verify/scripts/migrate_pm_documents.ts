// Creates the Product Management document library table. Idempotent.
import { pool } from "../server/config/db";

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pm_documents (
      id varchar(21) PRIMARY KEY,
      title text NOT NULL,
      category varchar(60) NOT NULL,
      description text,
      file_name text NOT NULL,
      original_name text NOT NULL,
      mime_type varchar(100) NOT NULL,
      size_bytes integer NOT NULL DEFAULT 0,
      audience varchar(16) NOT NULL DEFAULT 'admin',
      sort_order integer NOT NULL DEFAULT 0,
      uploaded_by_id varchar(21) REFERENCES reviewers(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS pm_documents_category_idx ON pm_documents (category, sort_order);`);
  console.log("Migration OK — pm_documents ready.");
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
