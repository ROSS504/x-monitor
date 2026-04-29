CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  handle TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL,
  cookies_path TEXT NOT NULL,
  daily_limit INTEGER NOT NULL DEFAULT 30,
  min_interval_min INTEGER NOT NULL DEFAULT 15,
  business_hours_json TEXT NOT NULL,
  cooldown_until INTEGER
);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tweet_id TEXT NOT NULL UNIQUE,
  author_handle TEXT NOT NULL,
  text TEXT NOT NULL,
  posted_at INTEGER NOT NULL,
  lang TEXT NOT NULL,
  source TEXT NOT NULL,
  scenario_hint TEXT,
  status TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  archived_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_trace ON posts(trace_id);

CREATE TABLE IF NOT EXISTS post_analysis (
  post_id INTEGER PRIMARY KEY REFERENCES posts(id),
  type TEXT,
  viewpoint TEXT,
  scenario TEXT,
  kb_match_score REAL,
  kb_chunks_json TEXT,
  analyzed_at INTEGER NOT NULL,
  prompt_version TEXT
);

CREATE TABLE IF NOT EXISTS drafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id),
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  content TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'single',
  citations_json TEXT NOT NULL DEFAULT '[]',
  strategy TEXT,
  status TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  prompt_version TEXT
);
CREATE INDEX IF NOT EXISTS idx_drafts_status ON drafts(status);

CREATE TABLE IF NOT EXISTS scheduled (
  draft_id INTEGER PRIMARY KEY REFERENCES drafts(id),
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  target_send_at INTEGER NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_scheduled_target ON scheduled(target_send_at);

CREATE TABLE IF NOT EXISTS sent (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  draft_id INTEGER NOT NULL UNIQUE REFERENCES drafts(id),
  tweet_id TEXT NOT NULL UNIQUE,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  sent_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id INTEGER,
  payload_json TEXT,
  trace_id TEXT,
  at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS dead_letter (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  last_error TEXT NOT NULL,
  retry_count INTEGER NOT NULL,
  moved_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS system_health (
  process_name TEXT PRIMARY KEY,
  last_heartbeat INTEGER NOT NULL,
  status TEXT NOT NULL,
  last_error TEXT
);

CREATE TABLE IF NOT EXISTS customer_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  handle TEXT NOT NULL UNIQUE,
  display_name TEXT,
  added_at INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  notes TEXT,
  enabled INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_customer_enabled ON customer_accounts(enabled);

CREATE TABLE IF NOT EXISTS post_analytics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sent_id INTEGER NOT NULL REFERENCES sent(id),
  bucket TEXT NOT NULL,
  likes INTEGER NOT NULL DEFAULT 0,
  retweets INTEGER NOT NULL DEFAULT 0,
  replies INTEGER NOT NULL DEFAULT 0,
  bookmarks INTEGER NOT NULL DEFAULT 0,
  views INTEGER,
  collected_at INTEGER NOT NULL,
  UNIQUE(sent_id, bucket)
);
CREATE INDEX IF NOT EXISTS idx_analytics_sent ON post_analytics(sent_id);

CREATE TABLE IF NOT EXISTS dms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  conversation_id TEXT NOT NULL,
  sender_handle TEXT NOT NULL,
  message_id TEXT NOT NULL UNIQUE,
  text TEXT NOT NULL,
  sent_at INTEGER NOT NULL,
  attributed_sent_id INTEGER REFERENCES sent(id),
  collected_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dms_account ON dms(account_id);
CREATE INDEX IF NOT EXISTS idx_dms_sender ON dms(sender_handle);
CREATE INDEX IF NOT EXISTS idx_dms_attributed ON dms(attributed_sent_id);

CREATE TABLE IF NOT EXISTS reply_playbooks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  keywords TEXT NOT NULL,
  strategy_text TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_playbooks_enabled ON reply_playbooks(enabled);

CREATE TABLE IF NOT EXISTS kb_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dify_doc_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  word_count INTEGER NOT NULL DEFAULT 0,
  hit_count INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  indexing_status TEXT,
  data_source_type TEXT,
  dify_created_at INTEGER NOT NULL,
  last_synced_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kb_docs_status ON kb_documents(indexing_status);

CREATE TABLE IF NOT EXISTS post_engagement (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id),
  likes INTEGER NOT NULL DEFAULT 0,
  retweets INTEGER NOT NULL DEFAULT 0,
  replies INTEGER NOT NULL DEFAULT 0,
  bookmarks INTEGER NOT NULL DEFAULT 0,
  views INTEGER,
  scraped_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_engagement_post ON post_engagement(post_id);
CREATE INDEX IF NOT EXISTS idx_engagement_scraped ON post_engagement(scraped_at);
