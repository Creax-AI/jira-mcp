[![MseeP.ai Security Assessment Badge](https://mseep.net/pr/rahulthedevil-jira-context-mcp-badge.png)](https://mseep.ai/app/rahulthedevil-jira-context-mcp)

# Jira Context MCP

[![CodeQL Advanced](https://github.com/rahulthedevil/Jira-Context-MCP/actions/workflows/codeql.yml/badge.svg)](https://github.com/rahulthedevil/Jira-Context-MCP/actions/workflows/codeql.yml)
[![Verified on MseeP](https://mseep.ai/badge.svg)](https://mseep.ai/app/d3bb0c74-58fd-4683-a3c7-99cc0342eecc)

<figure>
    <a href="https://glama.ai/mcp/servers/a8ob8depqc">
     <img width="380" height="200" src="https://glama.ai/mcp/servers/a8ob8depqc/badge" />
   </a>
</figure>

A Model Context Protocol (MCP) implementation for Jira that allows you to:

- Input a Jira ticket link to fetch issue details and instruct Cursor to fix it
- Retrieve all tickets assigned to you within a specified Jira project
- Filter Jira issues based on a specific issue type and automatically direct Cursor to resolve them
- Manage epics: create new epics, link issues to epics, and view epic hierarchies
- Update issue workflows: transition issues and add comments without leaving your IDE
- Focus on pending work by filtering out completed tasks
- Integrate seamlessly with Jira's API for automation and efficiency

## Setup

### Prerequisites

- Node.js 20.17.0 or higher
- A Jira account with API access
- A Jira API token (can be generated at [Atlassian API Tokens](https://id.atlassian.com/manage-profile/security/api-tokens))

### Installation

1. Clone this repository:

   ```bash
   git clone https://github.com/yourusername/Jira-Context-MCP.git
   cd Jira-Context-MCP
   ```

2. Install dependencies:

   ```bash
   npm install
   # or if you use pnpm
   pnpm install
   ```

3. Create a `.env` file based on the example:

   ```bash
   cp .env.example .env
   ```

4. Edit the `.env` file with your server auth token:
   ```
   MCP_AUTH_TOKEN=change-me
   HTTP_PORT=3000
   ```

### Build

Build the project with:

```bash
npm run build
# or
pnpm build
```

## Usage

### Starting the Server

Start the HTTP server:

```bash
npm start
# or
pnpm start
```

Note: In HTTP mode, Jira credentials are provided by each client via headers. The server does not read `JIRA_*` from `.env`.

Or use the CLI mode:

```bash
npm run start:cli
# or
pnpm start:cli
```

CLI mode expects `JIRA_BASE_URL`, `JIRA_USERNAME`, and `JIRA_API_TOKEN` to be provided via environment variables at invocation time.

### Running on Cloudflare Workers (Durable Objects)

This repository now includes a Worker runtime with Durable Object-backed MCP session handling for robust, stateful streamable HTTP support.

1. Create your Worker secrets/vars:

   ```bash
   npx wrangler secret put MCP_AUTH_TOKEN
   ```

2. Run locally:

   ```bash
   npm run dev:worker
   ```

3. Deploy:

   ```bash
   npm run deploy:worker
   ```

Worker entrypoint: `src/runtimes/worker/entry.ts`

Durable Object session manager: `src/runtimes/worker/session-do.ts`

### Connecting with Cursor

1. In Cursor, open the Command Palette (Ctrl+Shift+P or Cmd+Shift+P)
2. Type **"Connect to MCP Server"**
3. Select **"Connect to MCP Server"**
4. Enter the server URL (default: `http://localhost:3000/sse`)
5. Configure these headers in your MCP client (required for HTTP mode):
   ```
   Authorization: Bearer <MCP_AUTH_TOKEN>
   X-Jira-Base-Url: https://your-domain.atlassian.net
   X-Jira-Username: your-email@example.com
   X-Jira-Api-Token: your-api-token-here
   ```

If your MCP client cannot send headers, you can pass the Jira parameters as query parameters on `/sse` (less secure):
`http://localhost:3000/sse?jiraBaseUrl=...&jiraUsername=...&jiraApiToken=...`

## Available Tools

Once connected, you can use the following tools in Cursor:

### 1. Get Jira Issue Details

Fetch detailed information about a specific Jira issue:

```
/get_issue issueKey:PROJECT-123
```

### 2. Get Assigned Issues

Retrieve issues assigned to you in a specific project:

```
/get_assigned_issues projectKey:PROJECT maxResults:10
```

### 3. Get Issues by Type

Filter issues by type (Bug, Story, Epic, etc.):

```
/get_issues_by_type issueType:Bug projectKey:PROJECT maxResults:10
```

### 4. Get Projects

List all available projects:

```
/get_projects
```

### 5. Get Issue Types

List all available issue types:

```
/get_issue_types
```

### 6. Get Pending Assigned Issues

Retrieve only incomplete issues assigned to you (excludes Done status):

```
/get_pending_assigned_issues projectKey:PROJECT maxResults:10
```

### 7. Get Epics

Retrieve all epic issues from a project:

```
/get_epics projectKey:PROJECT maxResults:10
```

### 8. Get Epic Children

Get all child issues belonging to a specific epic:

```
/get_epic_children epicKey:PROJECT-123 maxResults:50
```

### 9. Add Comment

Add a comment to an existing Jira issue:

```
/add_comment issueKey:PROJECT-123 comment:"Updated the implementation as discussed"
```

### 10. Get Issue Transitions

List all available workflow transitions for an issue:

```
/get_issue_transitions issueKey:PROJECT-123
```

### 11. Transition Issue

Move an issue to a different status using a transition ID:

```
/transition_issue issueKey:PROJECT-123 transitionId:31
```

### 12. Create Epic

Create a new epic in a project:

```
/create_epic projectKey:PROJECT summary:"Q1 2024 Features" description:"Epic for all Q1 feature development"
```

### 13. Create Issue with Parent

Create a new issue linked to a parent epic:

```
/create_issue_with_parent projectKey:PROJECT issueType:Story summary:"Implement user authentication" parentKey:PROJECT-100 description:"Add OAuth2 login flow"
```

### 14. Set Parent Issue

Link an issue to a parent (works for epic→issue and issue→subtask relationships):

```
/set_parent_issue issueKey:PROJECT-456 parentKey:PROJECT-100
```

### 15. Update Issue Description

Replace the description of an existing Jira issue:

```
/update_issue_description issueKey:PROJECT-123 description:"New detailed description with acceptance criteria"
```

### 16. Get Link Types

Get all available issue link types to understand relationship options:

```
/get_link_types
```

This returns link types like:

- **Blocks**: "Blocks" / "Blocked by"
- **Duplicate**: "Duplicates" / "Duplicated by"
- **Relates**: "Relates to" / "Relates to"

### 17. Link Issues

Create a relationship between two issues (blocks, relates to, duplicates, etc.):

```
/link_issues inwardIssue:PROJECT-105 outwardIssue:PROJECT-54 linkType:"Blocks" comment:"Bug fix must be completed before feature"
```

**Note**: For "Blocks" links, the inward issue is the one doing the blocking, and the outward issue is the one being blocked.

## Command Examples

🚀 **Jira MCP Server + Cursor IDE = Your AI-powered Jira assistant!** Here’s how it makes devs work smarter:

📂 **"List all Jira projects I have access to"**  
→ AI fetches all available projects instantly  
No more searching manually!

📋 **"List all issues in PROJECT"**  
→ AI retrieves all open tickets  
Stay organized without effort!

🐛 **"Filter only Bugs or Change Requests and fix them"**  
→ AI identifies & directs Cursor to resolve them  
Fix issues faster with automation!

✅ **"Find all tickets assigned to me and fix them"**  
→ AI pulls your tasks & lets Cursor handle them  
Stay on top of your work with zero hassle!

🔍 **"Get details for Jira issue PROJECT-123"**  
→ AI fetches full issue info in seconds  
No more switching tabs!

📊 **"What changed in tickets in the last 7 days in PROJECT?"**  
→ AI tracks recent updates & highlights key changes  
No more manually checking ticket histories!

💬 **"Add a comment to PROJECT-123 saying 'Fixed in latest commit'"**  
→ AI posts the comment directly to Jira  
Update tickets without leaving your IDE!

🎯 **"Show me all epics in PROJECT and their child issues"**  
→ AI fetches epic hierarchy instantly  
Understand project structure at a glance!

📝 **"Create an epic called 'Mobile App Redesign' in PROJECT"**  
→ AI creates the epic for you  
Plan projects faster with automation!

🔗 **"Link issue PROJECT-456 to parent PROJECT-100"**  
→ AI sets parent relationship (works for epics or subtasks)  
Organize your backlog with flexible hierarchies!

⚡ **"Move PROJECT-123 to In Progress"**  
→ AI transitions the issue through your workflow  
Update statuses without switching contexts!

🖊️ **"Rewrite the description for PROJECT-123 with the new acceptance criteria"**  
→ AI replaces the issue description in Jira  
Keep product docs and dev context in sync!

🔗 **"Show me what link types are available"**  
→ AI fetches all issue link types (Blocks, Relates, Duplicate, etc.)  
Understand your relationship options!

🚫 **"PROJECT-105 blocks PROJECT-54 because the bug needs to be fixed first"**  
→ AI creates a "blocks" link between issues with a comment  
Track dependencies and blockers automatically!

🔥 **TL;DR:** Your AI now speaks Jira + Cursor! Fetch projects, filter issues, track changes, manage epics, link related issues, add comments, edit descriptions & fix bugs—all inside your IDE.  
From backlog to bug fixes, MCP Server makes Jira work for you!

## Example Workflows

### Fix a Specific Bug

1. Connect to the Jira MCP server in Cursor.
2. Get the issue details:
   ```
   /get_issue issueKey:PROJECT-123
   ```
3. Review the issue details and instruct Cursor to fix it:
   ```
   Fix the bug described in PROJECT-123
   ```

### Work on Your Assigned Issues

1. Connect to the Jira MCP server in Cursor.
2. Retrieve your assigned issues:
   ```
   /get_assigned_issues projectKey:PROJECT
   ```
3. Ask Cursor to help with one of the issues:
   ```
   Help me solve the first issue in my assigned list
   ```

### Fix All Bugs in a Project

1. Connect to the Jira MCP server in Cursor.
2. Retrieve all bug issues:
   ```
   /get_issues_by_type issueType:Bug projectKey:PROJECT
   ```
3. Instruct Cursor:
   ```
   Help me fix these bugs one by one
   ```

### Review Recent Changes

1. Connect to the Jira MCP server in Cursor.
2. Retrieve recent ticket updates:
   ```
   /get_recent_changes projectKey:PROJECT maxDays:7
   ```
3. Review the changes to stay updated on modifications.

### Plan and Track an Epic

1. Connect to the Jira MCP server in Cursor.
2. Create a new epic:
   ```
   /create_epic projectKey:PROJECT summary:"Q1 2024 Mobile Features" description:"All mobile app features for Q1"
   ```
3. Create child issues under the epic:
   ```
   /create_issue_with_parent projectKey:PROJECT issueType:Story summary:"Add push notifications" parentKey:PROJECT-100
   ```
4. Link existing issues to the epic:
   ```
   /set_parent_issue issueKey:PROJECT-456 parentKey:PROJECT-100
   ```
5. View all epic children to track progress:
   ```
   /get_epic_children epicKey:PROJECT-100
   ```

### Update Issue Status and Add Comments

1. Connect to the Jira MCP server in Cursor.
2. Get available transitions for an issue:
   ```
   /get_issue_transitions issueKey:PROJECT-123
   ```
3. Move the issue to a new status:
   ```
   /transition_issue issueKey:PROJECT-123 transitionId:31
   ```
4. Add a comment explaining the change:
   ```
   /add_comment issueKey:PROJECT-123 comment:"Moved to In Progress. Starting implementation today."
   ```
5. Update the description with latest details:
   ```
   /update_issue_description issueKey:PROJECT-123 description:"Implementation plan: 1) Add API validation 2) Update UI components 3) Add tests"
   ```

### Focus on Pending Work

1. Connect to the Jira MCP server in Cursor.
2. Get only your incomplete tasks:
   ```
   /get_pending_assigned_issues projectKey:PROJECT
   ```
3. Ask Cursor to help prioritize:
   ```
   Show me the highest priority pending issues and help me plan my day
   ```

### Link Related Issues and Track Dependencies

1. Connect to the Jira MCP server in Cursor.
2. Discover available link types:
   ```
   /get_link_types
   ```
3. Create a "blocks" relationship (e.g., bug fix must be completed before feature):
   ```
   /link_issues inwardIssue:PROJECT-105 outwardIssue:PROJECT-54 linkType:"Blocks" comment:"Bug in PPG calculation must be fixed before Matchweek Bonus feature"
   ```
4. Link duplicate issues:
   ```
   /link_issues inwardIssue:PROJECT-200 outwardIssue:PROJECT-198 linkType:"Duplicate"
   ```
5. Relate issues that should be worked on together:
   ```
   /link_issues inwardIssue:PROJECT-50 outwardIssue:PROJECT-51 linkType:"Relates"
   ```

**Note**: For "Blocks" links, the inward issue blocks the outward issue. So if PROJECT-105 blocks PROJECT-54, you cannot complete PROJECT-54 until PROJECT-105 is done.

## Development

### Project Structure

- `src/` - Source code
  - `services/` - Jira API service
  - `types/` - TypeScript type definitions
  - `utils/` - Utility functions
  - `server.ts` - MCP server implementation
  - `index.ts` - Application entry point
  - `cli.ts` - CLI entry point

### Adding New Tools

To add new tools, edit the `src/server.ts` file and add new tool definitions in the `registerTools` method.

## License

MIT

## Author

Rahul Dey - [@rahulthedevil](https://github.com/rahulthedevil)
