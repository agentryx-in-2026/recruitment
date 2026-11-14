// Ask Agentryx: knowledge base (RAG chunks with full-text index) + questions. Idempotent.
import { pool } from "../server/config/db";

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kb_chunks (
      id serial PRIMARY KEY,
      source_type varchar(20) NOT NULL,      -- guide | video | frs | plan | case
      source_title text NOT NULL,
      heading text NOT NULL,
      body text NOT NULL,
      url text,                              -- where the reader can open it
      audience varchar(16) NOT NULL DEFAULT 'all',
      tsv tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(heading,'')), 'A') ||
        setweight(to_tsvector('english', coalesce(body,'')), 'B')) STORED
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS kb_chunks_tsv_idx ON kb_chunks USING gin (tsv);`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ask_questions (
      id varchar(21) PRIMARY KEY,
      reviewer_id varchar(21) NOT NULL REFERENCES reviewers(id),
      question text NOT NULL,
      context_ref text,                      -- e.g. a case item ref the question was asked from
      answer text,
      answered_by varchar(21),               -- reviewer id, or 'ai'
      status varchar(12) NOT NULL DEFAULT 'open',   -- open | answered | closed
      sources jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      answered_at timestamptz
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS ask_questions_reviewer_idx ON ask_questions (reviewer_id, created_at DESC);`);
  console.log("Migration OK — kb_chunks + ask_questions ready.");
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
