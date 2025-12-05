[![MseeP.ai Security Assessment Badge](https://mseep.net/pr/rahulthedevil-jira-context-mcp-badge.png)](https://mseep.ai/app/rahulthedevil-jira-context-mcp)

# Jira Context MCP

[![CodeQL Advanced](https://github.com/rahulthedevil/Jira-Context-MCP/actions/workflows/codeql.yml/badge.svg)](https://github.com/rahulthedevil/Jira-Context-MCP/actions/workflows/codeql.yml)
[![smithery badge](https://smithery.ai/badge/@rahulthedevil/Jira-Context-MCP)](https://smithery.ai/server/@rahulthedevil/Jira-Context-MCP)
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

#### Installing via Smithery

To install Jira Context MCP for Claude Desktop automatically via [Smithery](https://smithery.ai/server/@rahulthedevil/Jira-Context-MCP):

```bash
npx -y @smithery/cli install @rahulthedevil/Jira-Context-MCP --client claude
```

#### Installing manually

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

4. Edit the `.env` file with your Jira details:
   ```
   JIRA_BASE_URL=https://your-domain.atlassian.net
   JIRA_USERNAME=your-email@example.com
   JIRA_API_TOKEN=your-api-token-here
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

Or use the CLI mode:

```bash
npm run start:cli
# or
pnpm start:cli
```

### Connecting with Cursor

1. In Cursor, open the Command Palette (Ctrl+Shift+P or Cmd+Shift+P)
2. Type **"Connect to MCP Server"**
3. Select **"Connect to MCP Server"**
4. Enter the server URL (default: `http://localhost:3000/sse`)

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

### 14. Attach to Epic

Link an existing issue to a parent epic:

```
/attach_to_epic issueKey:PROJECT-456 epicKey:PROJECT-100
```

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

🔗 **"Link issue PROJECT-456 to epic PROJECT-100"**  
→ AI organizes your backlog automatically  
Keep your epics organized effortlessly!

⚡ **"Move PROJECT-123 to In Progress"**  
→ AI transitions the issue through your workflow  
Update statuses without switching contexts!

🔥 **TL;DR:** Your AI now speaks Jira + Cursor! Fetch projects, filter issues, track changes, manage epics, add comments & fix bugs—all inside your IDE.  
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
   /attach_to_epic issueKey:PROJECT-456 epicKey:PROJECT-100
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
