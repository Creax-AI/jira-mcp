ALTER TABLE api_tokens ADD COLUMN workspace_id TEXT;

CREATE INDEX IF NOT EXISTS idx_api_tokens_workspace_id ON api_tokens(workspace_id);

CREATE TABLE IF NOT EXISTS jira_workspaces (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  workspace_name TEXT NOT NULL,
  jira_base_url TEXT NOT NULL,
  jira_username TEXT NOT NULL,
  jira_api_token_ciphertext TEXT NOT NULL,
  jira_api_token_iv TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_used_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_jira_workspaces_user_id ON jira_workspaces(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_jira_workspaces_user_name
  ON jira_workspaces(user_id, workspace_name);
