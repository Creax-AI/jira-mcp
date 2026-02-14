const SESSION_KEY = "jira-mcp.auth.session-id";

export function getSessionId(): string {
  return localStorage.getItem(SESSION_KEY) || "";
}

export function setSessionId(value: string) {
  localStorage.setItem(SESSION_KEY, value);
}

export function clearSessionId() {
  localStorage.removeItem(SESSION_KEY);
}
