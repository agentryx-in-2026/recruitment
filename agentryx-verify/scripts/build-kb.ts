// Rebuilds the Ask Agentryx knowledge base. Run after guides, videos or cases change.
import "dotenv/config";
import { pool } from "../server/config/db";
import { rebuildKnowledgeBase, searchKb } from "../server/services/kb";

const counts = await rebuildKnowledgeBase();
console.log("Knowledge base rebuilt:", counts);
for (const q of ["how do I upload documents", "schedule an interview", "callback"]) {
  const hits = await searchKb(q, true, 3);
  console.log(`\n"${q}" →`, hits.map((h) => `[${h.source_type}] ${h.heading}`).join(" | "));
}
await pool.end();
