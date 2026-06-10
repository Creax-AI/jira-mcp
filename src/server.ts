import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { JiraLogSink, JiraService } from "./services/jira";
import type { JiraADFDocument } from "./types/jira";
import { ConfluenceLogSink, ConfluenceService } from "./services/confluence";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

export class JiraMcpServer {
  private readonly server: McpServer;
  private readonly jiraService: JiraService;
  private readonly confluenceService: ConfluenceService;
  private readonly atlassianBaseUrl: string;
  private readonly defaultProjectKey?: string;
  private readonly allowedTools: ReadonlySet<string> | null;

  constructor(
    jiraUrl: string,
    username: string,
    apiToken: string,
    options?: {
      logSink?: JiraLogSink;
      defaultProjectKey?: string;
      allowedTools?: string[];
    },
  ) {
    this.atlassianBaseUrl = jiraUrl.endsWith("/")
      ? jiraUrl.slice(0, -1)
      : jiraUrl;
    this.jiraService = new JiraService(
      this.atlassianBaseUrl,
      username,
      apiToken,
      options?.logSink,
    );
    this.confluenceService = new ConfluenceService(
      this.atlassianBaseUrl,
      username,
      apiToken,
      options?.logSink as ConfluenceLogSink | undefined,
    );
    this.defaultProjectKey = options?.defaultProjectKey;
    this.allowedTools =
      options?.allowedTools && options.allowedTools.length > 0
        ? new Set(options.allowedTools)
        : null;
    this.server = new McpServer({
      name: "Jira MCP Server",
      version: "0.2.0",
    });

    this.registerTools();
  }

  private isToolAllowed(name: string): boolean {
    if (!this.allowedTools) return true;
    return this.allowedTools.has(name);
  }

  private registerTools(): void {
    const toolAnnotations: Record<
      string,
      {
        readOnlyHint?: boolean;
        destructiveHint?: boolean;
        idempotentHint?: boolean;
      }
    > = {
      get_: { readOnlyHint: true },
      search_: { readOnlyHint: true },
      find_: { readOnlyHint: true },
      map_: { readOnlyHint: true },
      link_confluence_page_to_jira_issue: { readOnlyHint: true },
      delete_: { destructiveHint: true },
      remove_: { destructiveHint: true },
      complete_: { destructiveHint: true },
    };

    function resolveAnnotations(
      name: string,
    ): Record<string, boolean> | undefined {
      for (const [prefix, annotations] of Object.entries(toolAnnotations)) {
        if (name.startsWith(prefix)) return annotations;
      }
      return undefined;
    }

    // Filter tool registrations to only include allowed tools
    const originalTool = this.server.tool.bind(this.server);
    const isAllowed = this.isToolAllowed.bind(this);
    this.server.tool = ((name: string, ...args: unknown[]) => {
      if (!isAllowed(name)) return this.server;

      const annotations = resolveAnnotations(name);
      if (annotations) {
        const cb = args[args.length - 1];
        if (typeof cb === "function") {
          const argCount = typeof args[0] === "string" ? 3 : 2;
          if (args.length === argCount) {
            args.splice(-1, 0, annotations);
          }
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return (originalTool as (...a: unknown[]) => unknown)(name, ...args);
    }) as typeof this.server.tool;

    // Tool to get issue information
    this.server.tool(
      "get_issue",
      "Get detailed information about a Jira issue",
      {
        issueKey: z
          .string()
          .describe("The key of the Jira issue to fetch (e.g., PROJECT-123)"),
      },
      async ({ issueKey }) => {
        try {
          console.log(`Fetching issue: ${issueKey}`);
          const issue = await this.jiraService.getIssue(issueKey);
          console.log(
            `Successfully fetched issue: ${issue.key} - ${issue.fields.summary}`,
          );
          return {
            content: [{ type: "text", text: JSON.stringify(issue, null, 2) }],
          };
        } catch (error) {
          console.error(`Error fetching issue ${issueKey}:`, error);
          return {
            content: [
              {
                type: "text",
                text: `Error fetching issue: ${formatToolError(error)}`,
              },
            ],
          };
        }
      },
    );

    // Tool to add a comment to an issue
    this.server.tool(
      "add_comment",
      "Add a comment to an existing Jira issue. Use mentions to @-mention users in the comment body.",
      {
        issueKey: z
          .string()
          .describe("The Jira issue key to comment on (e.g., PROJ-123)"),
        comment: z
          .string()
          .min(1)
          .describe(
            "The text of the comment. Include @displayName in the text for each user you want to mention.",
          ),
        mentions: z
          .array(
            z.object({
              accountId: z
                .string()
                .describe("The Atlassian account ID of the user"),
              displayName: z
                .string()
                .describe("The display name of the user (without @ prefix)"),
            }),
          )
          .optional()
          .describe(
            "Users to @-mention in the comment. The displayName in each entry must appear as @displayName in the comment text. Use search_users to find account IDs.",
          ),
      },
      async ({ issueKey, comment, mentions }) => {
        try {
          console.log(
            `Adding comment to issue ${issueKey}${mentions ? ` with ${mentions.length} mention(s)` : ""}`,
          );
          const response = await this.jiraService.addComment(
            issueKey,
            comment,
            mentions,
          );
          console.log(
            `Successfully added comment ${response.id} to ${issueKey}`,
          );
          return {
            content: [
              { type: "text", text: JSON.stringify(response, null, 2) },
            ],
          };
        } catch (error) {
          console.error(`Error adding comment to ${issueKey}:`, error);
          return {
            content: [
              {
                type: "text",
                text: `Error adding comment: ${formatToolError(error)}`,
              },
            ],
          };
        }
      },
    );

    // Tool to get comments for an issue
    this.server.tool(
      "get_issue_comments",
      "Get all comments on a Jira issue",
      {
        issueKey: z
          .string()
          .describe(
            "The Jira issue key to fetch comments for (e.g., PROJ-123)",
          ),
      },
      async ({ issueKey }) => {
        try {
          console.log(`Fetching comments for issue ${issueKey}`);
          const comments = await this.jiraService.getComments(issueKey);
          return {
            content: [
              { type: "text", text: JSON.stringify(comments, null, 2) },
            ],
          };
        } catch (error) {
          console.error(`Error fetching comments for ${issueKey}:`, error);
          return {
            content: [
              {
                type: "text",
                text: `Error fetching issue comments: ${formatToolError(error)}`,
              },
            ],
          };
        }
      },
    );

    // Tool to find mentions of the authenticated user
    this.server.tool(
      "get_mentions",
      "Find Jira comments where the authenticated user is @-mentioned. Returns comments with issue context.",
      {
        issueKey: z
          .string()
          .optional()
          .describe(
            "Optional issue key to scope the search. If omitted, searches all projects the user has access to.",
          ),
      },
      async ({ issueKey }) => {
        try {
          const myAccountId = await this.jiraService.getMyAccountId();

          if (issueKey) {
            // Search just one issue
            console.log(
              `Finding mentions in issue ${issueKey} for user ${myAccountId}`,
            );
            const comments = await this.jiraService.getComments(issueKey);
            const mentions = await this.jiraService.findMentionsInComments(
              comments,
              myAccountId,
            );
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    { accountId: myAccountId, mentions },
                    null,
                    2,
                  ),
                },
              ],
            };
          }

          // Search across all recently updated issues
          console.log(
            `Finding mentions across all issues for user ${myAccountId}`,
          );
          const searchResponse = await this.jiraService.searchIssues({
            jql: "order by updated DESC",
            maxResults: 50,
            fields: ["summary", "comment"],
          });

          const allMentions: Array<{
            issueKey: string;
            issueSummary: string;
            comments: Array<{
              id: string;
              author: { accountId: string; displayName: string };
              created: string;
              body: JiraADFDocument;
            }>;
          }> = [];

          for (const issue of searchResponse.issues) {
            const issueComments = issue.fields.comment?.comments;
            if (!issueComments || issueComments.length === 0) continue;

            const mentionedComments =
              await this.jiraService.findMentionsInComments(
                issueComments,
                myAccountId,
              );
            if (mentionedComments.length > 0) {
              allMentions.push({
                issueKey: issue.key,
                issueSummary: issue.fields.summary,
                comments: mentionedComments.map((m) => ({
                  id: m.comment.id,
                  author: {
                    accountId: m.comment.author.accountId,
                    displayName: m.comment.author.displayName,
                  },
                  created: m.comment.created,
                  body: m.comment.body,
                })),
              });
            }
          }

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  { accountId: myAccountId, mentions: allMentions },
                  null,
                  2,
                ),
              },
            ],
          };
        } catch (error) {
          console.error("Error finding mentions:", error);
          return {
            content: [
              {
                type: "text",
                text: `Error finding mentions: ${formatToolError(error)}`,
              },
            ],
          };
        }
      },
    );

    this.server.tool(
      "add_issue_labels",
      "Add one or more labels to an existing Jira issue",
      {
        issueKey: z
          .string()
          .describe("The Jira issue key to update (e.g., PROJ-123)"),
        labels: z
          .array(z.string().min(1))
          .min(1)
          .describe("Labels to add to the issue"),
      },
      async ({ issueKey, labels }) => {
        try {
          console.log(
            `Adding labels to issue ${issueKey}: ${labels.join(", ")}`,
          );
          await this.jiraService.addIssueLabels(issueKey, labels);
          return {
            content: [
              {
                type: "text",
                text: `Labels added to ${issueKey}: ${labels.join(", ")}`,
              },
            ],
          };
        } catch (error) {
          console.error(`Error adding labels to ${issueKey}:`, error);
          return {
            content: [
              {
                type: "text",
                text: `Error adding labels: ${formatToolError(error)}`,
              },
            ],
          };
        }
      },
    );

    this.server.tool(
      "remove_issue_labels",
      "Remove one or more labels from an existing Jira issue",
      {
        issueKey: z
          .string()
          .describe("The Jira issue key to update (e.g., PROJ-123)"),
        labels: z
          .array(z.string().min(1))
          .min(1)
          .describe("Labels to remove from the issue"),
      },
      async ({ issueKey, labels }) => {
        try {
          console.log(
            `Removing labels from issue ${issueKey}: ${labels.join(", ")}`,
          );
          await this.jiraService.removeIssueLabels(issueKey, labels);
          return {
            content: [
              {
                type: "text",
                text: `Labels removed from ${issueKey}: ${labels.join(", ")}`,
              },
            ],
          };
        } catch (error) {
          console.error(`Error removing labels from ${issueKey}:`, error);
          return {
            content: [
              {
                type: "text",
                text: `Error removing labels: ${formatToolError(error)}`,
              },
            ],
          };
        }
      },
    );

    // Tool to transition an issue
    this.server.tool(
      "transition_issue",
      "Move an issue to a different status by applying a workflow transition",
      {
        issueKey: z
          .string()
          .describe("The Jira issue key to transition (e.g., PROJ-123)"),
        transitionId: z
          .string()
          .describe(
            "The transition ID to apply (use get_issue_transitions to discover IDs)",
          ),
      },
      async ({ issueKey, transitionId }) => {
        try {
          console.log(`Transitioning issue ${issueKey} via ${transitionId}`);
          await this.jiraService.transitionIssue(issueKey, transitionId);
          return {
            content: [
              {
                type: "text",
                text: `Issue ${issueKey} transitioned using ${transitionId}`,
              },
            ],
          };
        } catch (error) {
          console.error("Error transitioning issue:", error);
          return {
            content: [
              {
                type: "text",
                text: `Error transitioning issue: ${formatToolError(error)}`,
              },
            ],
          };
        }
      },
    );

    this.server.tool(
      "delete_issue",
      "Delete a Jira issue permanently. Optionally deletes its subtasks as well.",
      {
        issueKey: z
          .string()
          .describe("The Jira issue key to delete (e.g., PROJ-123)"),
        deleteSubtasks: z
          .boolean()
          .optional()
          .describe("If true, also deletes any subtasks (default: false)"),
      },
      async ({ issueKey, deleteSubtasks }) => {
        try {
          console.log(
            `Deleting issue ${issueKey}${deleteSubtasks ? " with subtasks" : ""}`,
          );
          await this.jiraService.deleteIssue(issueKey, deleteSubtasks);
          return {
            content: [
              {
                type: "text",
                text: `Issue ${issueKey} deleted successfully${deleteSubtasks ? " (with subtasks)" : ""}`,
              },
            ],
          };
        } catch (error) {
          console.error(`Error deleting issue ${issueKey}:`, error);
          return {
            content: [
              {
                type: "text",
                text: `Error deleting issue: ${formatToolError(error)}`,
              },
            ],
          };
        }
      },
    );

    this.server.tool(
      "get_issue_transitions",
      "List available workflow transitions for an issue",
      {
        issueKey: z
          .string()
          .describe("The Jira issue key to inspect (e.g., PROJ-123)"),
      },
      async ({ issueKey }) => {
        try {
          console.log(`Fetching transitions for issue ${issueKey}`);
          const response = await this.jiraService.getIssueTransitions(issueKey);
          console.log(
            `Fetched ${response.transitions.length} transitions for ${issueKey}`,
          );
          return {
            content: [
              { type: "text", text: JSON.stringify(response, null, 2) },
            ],
          };
        } catch (error) {
          console.error(`Error fetching transitions for ${issueKey}:`, error);
          return {
            content: [
              {
                type: "text",
                text: `Error fetching transitions: ${formatToolError(error)}`,
              },
            ],
          };
        }
      },
    );

    // Tool to search issues with JQL
    this.server.tool(
      "search_issues",
      "Search Jira issues using JQL (Jira Query Language). Supports ORDER BY, field filtering, and pagination.",
      {
        jql: z
          .string()
          .describe(
            "JQL query string (e.g., \"project = ALFA AND status = 'In Progress' ORDER BY created DESC\")",
          ),
        maxResults: z
          .number()
          .optional()
          .describe("Maximum number of results to return"),
        fields: z
          .array(z.string())
          .optional()
          .describe(
            "Fields to return (e.g., ['summary', 'status', 'assignee'])",
          ),
        nextPageToken: z
          .string()
          .optional()
          .describe("Token from previous response for pagination"),
      },
      async ({ jql, maxResults, fields, nextPageToken }) => {
        try {
          console.log(`Searching issues: ${jql}`);
          const response = await this.jiraService.searchIssues({
            jql,
            maxResults,
            fields,
            nextPageToken,
          });
          console.log(`Found ${response.issues.length} issues`);
          return {
            content: [
              { type: "text", text: JSON.stringify(response, null, 2) },
            ],
          };
        } catch (error) {
          console.error("Error searching issues:", error);
          return {
            content: [
              {
                type: "text",
                text: `Error searching issues: ${formatToolError(error)}`,
              },
            ],
          };
        }
      },
    );

    // Tool to get epics
    this.server.tool(
      "get_epics",
      "Get epics from a Jira project",
      {
        projectKey: z
          .string()
          .optional()
          .describe("The key of the Jira project to fetch epics from"),
        maxResults: z
          .number()
          .optional()
          .describe("Maximum number of results to return"),
      },
      async ({ projectKey, maxResults }) => {
        try {
          console.log(
            `Fetching epics${projectKey ? ` for project: ${projectKey}` : ""}`,
          );
          const response = await this.jiraService.getEpics(
            projectKey ?? this.defaultProjectKey,
            maxResults,
          );
          console.log(`Successfully fetched ${response.issues.length} epics`);
          return {
            content: [
              { type: "text", text: JSON.stringify(response, null, 2) },
            ],
          };
        } catch (error) {
          console.error(`Error fetching epics:`, error);
          return {
            content: [
              {
                type: "text",
                text: `Error fetching epics: ${formatToolError(error)}`,
              },
            ],
          };
        }
      },
    );

    // Tool to get epic children
    this.server.tool(
      "get_epic_children",
      "Get child issues of a specific epic",
      {
        epicKey: z.string().describe("The Jira epic key (e.g., PROJ-123)"),
        maxResults: z
          .number()
          .optional()
          .describe("Maximum number of results to return"),
      },
      async ({ epicKey, maxResults }) => {
        try {
          console.log(`Fetching children for epic ${epicKey}`);
          const response = await this.jiraService.getEpicChildren(
            epicKey,
            maxResults,
          );
          console.log(
            `Successfully fetched ${response.issues.length} child issues for ${epicKey}`,
          );
          return {
            content: [
              { type: "text", text: JSON.stringify(response, null, 2) },
            ],
          };
        } catch (error) {
          console.error(`Error fetching epic children for ${epicKey}:`, error);
          return {
            content: [
              {
                type: "text",
                text: `Error fetching epic children: ${formatToolError(error)}`,
              },
            ],
          };
        }
      },
    );

    // Tool to get assigned issues
    this.server.tool(
      "get_assigned_issues",
      "Get issues assigned to the current user in a project",
      {
        projectKey: z
          .string()
          .optional()
          .describe("The key of the Jira project to fetch issues from"),
        maxResults: z
          .number()
          .optional()
          .describe("Maximum number of results to return"),
      },
      async ({ projectKey, maxResults }) => {
        try {
          console.log(
            `Fetching assigned issues${projectKey ? ` for project: ${projectKey}` : ""}`,
          );
          const response = await this.jiraService.getAssignedIssues(
            projectKey ?? this.defaultProjectKey,
            maxResults,
          );
          console.log(
            `Successfully fetched ${response.issues.length} assigned issues`,
          );
          return {
            content: [
              { type: "text", text: JSON.stringify(response, null, 2) },
            ],
          };
        } catch (error) {
          console.error(`Error fetching assigned issues:`, error);
          return {
            content: [
              {
                type: "text",
                text: `Error fetching assigned issues: ${formatToolError(error)}`,
              },
            ],
          };
        }
      },
    );

    // Tool to get pending assigned issues
    this.server.tool(
      "get_pending_assigned_issues",
      "Get issues assigned to the current user that are not done",
      {
        projectKey: z
          .string()
          .optional()
          .describe("The key of the Jira project to fetch issues from"),
        maxResults: z
          .number()
          .optional()
          .describe("Maximum number of results to return"),
      },
      async ({ projectKey, maxResults }) => {
        try {
          console.log(
            `Fetching pending assigned issues${projectKey ? ` for project: ${projectKey}` : ""}`,
          );
          const response = await this.jiraService.getAssignedIssues(
            projectKey ?? this.defaultProjectKey,
            maxResults,
            false,
          );
          console.log(
            `Successfully fetched ${response.issues.length} pending assigned issues`,
          );
          return {
            content: [
              { type: "text", text: JSON.stringify(response, null, 2) },
            ],
          };
        } catch (error) {
          console.error(`Error fetching pending assigned issues:`, error);
          return {
            content: [
              {
                type: "text",
                text: `Error fetching pending assigned issues: ${formatToolError(error)}`,
              },
            ],
          };
        }
      },
    );

    // Tool to get issues by type

    this.server.tool(
      "get_issues_by_type",
      "Get issues of a specific type",
      {
        issueType: z
          .string()
          .describe("The type of issue to fetch (e.g., Bug, Story, Epic)"),
        projectKey: z
          .string()
          .optional()
          .describe("The key of the Jira project to fetch issues from"),
        maxResults: z
          .number()
          .optional()
          .describe("Maximum number of results to return"),
      },
      async ({ issueType, projectKey, maxResults }) => {
        try {
          console.log(
            `Fetching issues of type: ${issueType}${projectKey ? ` for project: ${projectKey}` : ""}`,
          );
          const response = await this.jiraService.getIssuesByType(
            issueType,
            projectKey ?? this.defaultProjectKey,
            maxResults,
          );
          console.log(
            `Successfully fetched ${response.issues.length} issues of type ${issueType}`,
          );
          return {
            content: [
              { type: "text", text: JSON.stringify(response, null, 2) },
            ],
          };
        } catch (error) {
          console.error(`Error fetching issues by type:`, error);
          return {
            content: [
              {
                type: "text",
                text: `Error fetching issues by type: ${formatToolError(error)}`,
              },
            ],
          };
        }
      },
    );

    // Tool to get projects
    this.server.tool(
      "get_projects",
      "Get list of available Jira projects",
      {},
      async () => {
        try {
          console.log("Fetching projects");
          const projects = await this.jiraService.getProjects();
          console.log(`Successfully fetched ${projects.length} projects`);
          return {
            content: [
              { type: "text", text: JSON.stringify(projects, null, 2) },
            ],
          };
        } catch (error) {
          console.error("Error fetching projects:", error);
          return {
            content: [
              {
                type: "text",
                text: `Error fetching projects: ${formatToolError(error)}`,
              },
            ],
          };
        }
      },
    );

    // Tool to get issue types
    this.server.tool(
      "get_issue_types",
      "Get list of available Jira issue types",
      {},
      async () => {
        try {
          console.log("Fetching issue types");
          const issueTypes = await this.jiraService.getIssueTypes();
          console.log(`Successfully fetched issue types`);
          return {
            content: [
              { type: "text", text: JSON.stringify(issueTypes, null, 2) },
            ],
          };
        } catch (error) {
          console.error("Error fetching issue types:", error);
          return {
            content: [
              {
                type: "text",
                text: `Error fetching issue types: ${formatToolError(error)}`,
              },
            ],
          };
        }
      },
    );

    // Tool to create a new epic
    this.server.tool(
      "create_epic",
      "Create a new epic in a Jira project",
      {
        projectKey: z
          .string()
          .describe("The key of the Jira project (e.g., PROJ)"),
        summary: z.string().describe("The summary/title of the epic"),
        description: z
          .string()
          .optional()
          .describe("Optional description for the epic"),
        labels: z
          .array(z.string().min(1))
          .optional()
          .describe("Optional labels to add on create"),
      },
      async ({ projectKey, summary, description, labels }) => {
        try {
          console.log(`Creating epic in project ${projectKey}: ${summary}`);
          const response = await this.jiraService.createEpic(
            projectKey,
            summary,
            description,
            labels,
          );
          console.log(`Successfully created epic: ${response.key}`);
          return {
            content: [
              { type: "text", text: JSON.stringify(response, null, 2) },
            ],
          };
        } catch (error) {
          console.error(`Error creating epic:`, error);
          return {
            content: [
              {
                type: "text",
                text: `Error creating epic: ${formatToolError(error)}`,
              },
            ],
          };
        }
      },
    );

    // Tool to create an issue with a parent (linked to an epic)
    this.server.tool(
      "create_issue_with_parent",
      "Create a new issue linked to a parent epic",
      {
        projectKey: z
          .string()
          .describe("The key of the Jira project (e.g., PROJ)"),
        issueType: z
          .string()
          .describe("The type of issue to create (e.g., Story, Task, Bug)"),
        summary: z.string().describe("The summary/title of the issue"),
        parentKey: z
          .string()
          .describe("The key of the parent epic (e.g., PROJ-123)"),
        description: z
          .string()
          .optional()
          .describe("Optional description for the issue"),
        labels: z
          .array(z.string().min(1))
          .optional()
          .describe("Optional labels to add on create"),
      },
      async ({
        projectKey,
        issueType,
        summary,
        parentKey,
        description,
        labels,
      }) => {
        try {
          console.log(
            `Creating ${issueType} in project ${projectKey} under parent ${parentKey}: ${summary}`,
          );
          const response = await this.jiraService.createIssueWithParent(
            projectKey,
            issueType,
            summary,
            parentKey,
            description,
            labels,
          );
          console.log(`Successfully created issue: ${response.key}`);
          return {
            content: [
              { type: "text", text: JSON.stringify(response, null, 2) },
            ],
          };
        } catch (error) {
          console.error(`Error creating issue with parent:`, error);
          return {
            content: [
              {
                type: "text",
                text: `Error creating issue with parent: ${formatToolError(error)}`,
              },
            ],
          };
        }
      },
    );

    // Tool to set parent relationship (works for epics, subtasks, etc.)
    this.server.tool(
      "set_parent_issue",
      "Set the parent of an issue (for epic→issue or issue→subtask relationships)",
      {
        issueKey: z
          .string()
          .describe("The key of the child issue (e.g., PROJ-456)"),
        parentKey: z
          .string()
          .describe("The key of the parent issue (e.g., PROJ-123)"),
      },
      async ({ issueKey, parentKey }) => {
        try {
          console.log(`Setting parent of ${issueKey} to ${parentKey}`);
          await this.jiraService.setParentIssue(issueKey, parentKey);
          console.log(`Successfully set parent of ${issueKey} to ${parentKey}`);
          return {
            content: [
              {
                type: "text",
                text: `Issue ${issueKey} successfully linked to parent ${parentKey}`,
              },
            ],
          };
        } catch (error) {
          console.error(`Error setting parent issue:`, error);
          return {
            content: [
              {
                type: "text",
                text: `Error setting parent issue: ${formatToolError(error)}`,
              },
            ],
          };
        }
      },
    );

    // Tool to update an issue description
    this.server.tool(
      "update_issue_description",
      "Replace the description and optionally set labels on an existing Jira issue",
      {
        issueKey: z
          .string()
          .describe("The key of the issue to update (e.g., PROJ-123)"),
        description: z
          .string()
          .min(1)
          .describe("The new markdown/plain text description to set"),
        labels: z
          .array(z.string().min(1))
          .optional()
          .describe("Optional labels to set"),
      },
      async ({ issueKey, description, labels }) => {
        try {
          console.log(`Updating description for issue ${issueKey}`);
          await this.jiraService.updateIssueDescription(
            issueKey,
            description,
            labels,
          );
          return {
            content: [
              {
                type: "text",
                text: `Description for ${issueKey} updated successfully`,
              },
            ],
          };
        } catch (error) {
          console.error(`Error updating description for ${issueKey}:`, error);
          return {
            content: [
              {
                type: "text",
                text: `Error updating description: ${formatToolError(error)}`,
              },
            ],
          };
        }
      },
    );

    // Tool to assign an issue to a user
    this.server.tool(
      "assign_issue",
      "Assign a Jira issue to a workspace member",
      {
        issueKey: z
          .string()
          .describe("The key of the issue to assign (e.g., PROJ-123)"),
        assignee: z
          .string()
          .describe(
            "The user to assign the issue to (email, name, or account ID)",
          ),
      },
      async ({ issueKey, assignee }) => {
        try {
          console.log(`Assigning issue ${issueKey} to ${assignee}`);
          await this.jiraService.assignIssue(issueKey, assignee);
          return {
            content: [
              {
                type: "text",
                text: `Issue ${issueKey} assigned to ${assignee} successfully`,
              },
            ],
          };
        } catch (error) {
          console.error("Error assigning issue:", error);
          return {
            content: [
              {
                type: "text",
                text: `Error assigning issue: ${formatToolError(error)}`,
              },
            ],
          };
        }
      },
    );

    // Tool to search for workspace users
    this.server.tool(
      "search_users",
      "Search for users in the Jira workspace",
      {
        query: z.string().describe("Search query for user name or email"),
      },
      async ({ query }) => {
        try {
          console.log(`Searching for users with query: ${query}`);
          const users = await this.jiraService.searchUsers(query);
          return {
            content: [
              {
                type: "text",
                text: `Found ${users.length} users:\n${users
                  .map(
                    (user) =>
                      `- ${user.displayName} (${user.emailAddress}) - Account ID: ${user.accountId} - Active: ${user.active}`,
                  )
                  .join("\n")}`,
              },
            ],
          };
        } catch (error) {
          console.error("Error searching users:", error);
          return {
            content: [
              {
                type: "text",
                text: `Error searching users: ${formatToolError(error)}`,
              },
            ],
          };
        }
      },
    );

    // Tool to get available issue link types
    this.server.tool(
      "get_link_types",
      "Get all available issue link types (e.g., Blocks, Duplicate, Relates)",
      {},
      async () => {
        try {
          console.log("Fetching issue link types");
          const response = await this.jiraService.getIssueLinkTypes();
          const linkTypes = response.issueLinkTypes
            .map(
              (type) =>
                `- ${type.name}: "${type.outward}" / "${type.inward}" (ID: ${type.id})`,
            )
            .join("\n");
          return {
            content: [
              {
                type: "text",
                text: `Available issue link types:\n${linkTypes}`,
              },
            ],
          };
        } catch (error) {
          console.error("Error fetching issue link types:", error);
          return {
            content: [
              {
                type: "text",
                text: `Error fetching issue link types: ${formatToolError(error)}`,
              },
            ],
          };
        }
      },
    );

    // Tool to link two issues
    this.server.tool(
      "link_issues",
      "Create a link between two issues (e.g., 'blocks', 'relates to', 'duplicates')",
      {
        inwardIssue: z
          .string()
          .describe(
            "The key of the inward issue (e.g., PROJ-123). For 'Blocks' links, this is the blocking issue.",
          ),
        outwardIssue: z
          .string()
          .describe(
            "The key of the outward issue (e.g., PROJ-456). For 'Blocks' links, this is the blocked issue.",
          ),
        linkType: z
          .string()
          .describe(
            'The name of the link type (e.g., "Blocks", "Duplicate", "Relates"). Use get_link_types to see available types.',
          ),
        comment: z
          .string()
          .optional()
          .describe(
            "Optional comment to add to the outward issue explaining the link",
          ),
      },
      async ({ inwardIssue, outwardIssue, linkType, comment }) => {
        try {
          console.log(
            `Linking ${inwardIssue} to ${outwardIssue} with type "${linkType}"`,
          );
          await this.jiraService.linkIssues(
            inwardIssue,
            outwardIssue,
            linkType,
            comment,
          );
          return {
            content: [
              {
                type: "text",
                text: `Successfully linked ${inwardIssue} to ${outwardIssue} (${linkType})`,
              },
            ],
          };
        } catch (error) {
          console.error("Error linking issues:", error);
          return {
            content: [
              {
                type: "text",
                text: `Error linking issues: ${formatToolError(error)}`,
              },
            ],
          };
        }
      },
    );

    this.server.tool(
      "create_sprint",
      "Create a new sprint for a board",
      {
        name: z.string().min(1).describe("Sprint name"),
        originBoardId: z
          .number()
          .describe("Board ID where the sprint will be created"),
        startDate: z
          .string()
          .optional()
          .describe("Sprint start date (ISO 8601)"),
        endDate: z.string().optional().describe("Sprint end date (ISO 8601)"),
        goal: z.string().optional().describe("Optional sprint goal"),
      },
      async ({ name, originBoardId, startDate, endDate, goal }) => {
        try {
          console.log(`Creating sprint ${name} on board ${originBoardId}`);
          const response = await this.jiraService.createSprint({
            name,
            originBoardId,
            startDate,
            endDate,
            goal,
          });
          console.log(`Successfully created sprint ${response.name}`);
          return {
            content: [
              { type: "text", text: JSON.stringify(response, null, 2) },
            ],
          };
        } catch (error) {
          console.error("Error creating sprint:", error);
          return {
            content: [
              {
                type: "text",
                text: `Error creating sprint: ${formatToolError(error)}`,
              },
            ],
          };
        }
      },
    );

    this.server.tool(
      "get_sprint",
      "Get details for a specific sprint",
      {
        sprintId: z.number().describe("Sprint ID to fetch"),
      },
      async ({ sprintId }) => {
        try {
          console.log(`Fetching sprint ${sprintId}`);
          const response = await this.jiraService.getSprint(sprintId);
          return {
            content: [
              { type: "text", text: JSON.stringify(response, null, 2) },
            ],
          };
        } catch (error) {
          console.error("Error fetching sprint:", error);
          return {
            content: [
              {
                type: "text",
                text: `Error fetching sprint: ${formatToolError(error)}`,
              },
            ],
          };
        }
      },
    );

    this.server.tool(
      "get_project_sprint",
      "Get sprint details and validate it belongs to a project",
      {
        projectKeyOrId: z
          .string()
          .describe("Project key or ID used to validate sprint ownership"),
        sprintId: z.number().describe("Sprint ID to fetch"),
      },
      async ({ projectKeyOrId, sprintId }) => {
        try {
          console.log(
            `Fetching sprint ${sprintId} for project ${projectKeyOrId}`,
          );
          const sprint = await this.jiraService.getSprint(sprintId);
          const board = await this.jiraService.getBoard(sprint.originBoardId);
          const projectKey = board.location?.projectKey?.toLowerCase();
          const projectId = board.location?.projectId
            ? String(board.location.projectId)
            : undefined;
          const target = projectKeyOrId.toLowerCase();
          if (projectKey !== target && projectId !== projectKeyOrId) {
            return {
              content: [
                {
                  type: "text",
                  text: `Sprint ${sprintId} belongs to board ${board.id} (${projectKey ?? "unknown"}). It does not match project ${projectKeyOrId}.`,
                },
              ],
            };
          }
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ sprint, board }, null, 2),
              },
            ],
          };
        } catch (error) {
          console.error("Error fetching sprint for project:", error);
          return {
            content: [
              {
                type: "text",
                text: `Error fetching sprint for project: ${formatToolError(error)}`,
              },
            ],
          };
        }
      },
    );

    this.server.tool(
      "add_issues_to_sprint",
      "Add issues to a sprint",
      {
        sprintId: z.number().describe("Sprint ID to add issues to"),
        issues: z
          .array(z.string())
          .min(1)
          .describe('Issue keys or IDs to add (e.g., ["STLMVP-1", "10001"])'),
      },
      async ({ sprintId, issues }) => {
        try {
          console.log(`Adding ${issues.length} issues to sprint ${sprintId}`);
          await this.jiraService.addIssuesToSprint(sprintId, issues);
          return {
            content: [
              {
                type: "text",
                text: `Added ${issues.length} issues to sprint ${sprintId}`,
              },
            ],
          };
        } catch (error) {
          console.error("Error adding issues to sprint:", error);
          return {
            content: [
              {
                type: "text",
                text: `Error adding issues to sprint: ${formatToolError(error)}`,
              },
            ],
          };
        }
      },
    );

    this.server.tool(
      "remove_issues_from_sprint",
      "Move issues out of a sprint back to the backlog",
      {
        issues: z
          .array(z.string())
          .min(1)
          .describe("Issue keys or IDs to remove from sprint"),
      },
      async ({ issues }) => {
        try {
          console.log(`Removing ${issues.length} issues from sprint`);
          await this.jiraService.removeIssuesFromSprint(issues);
          return {
            content: [
              {
                type: "text",
                text: `Removed ${issues.length} issues from sprint back to backlog`,
              },
            ],
          };
        } catch (error) {
          console.error("Error removing issues from sprint:", error);
          return {
            content: [
              {
                type: "text",
                text: `Error removing issues from sprint: ${formatToolError(error)}`,
              },
            ],
          };
        }
      },
    );

    this.server.tool(
      "start_sprint",
      "Start a sprint by setting state to active",
      {
        sprintId: z.number().describe("Sprint ID to start"),
        startDate: z
          .string()
          .optional()
          .describe("Sprint start date (ISO 8601)"),
        endDate: z.string().optional().describe("Sprint end date (ISO 8601)"),
        goal: z.string().optional().describe("Optional sprint goal"),
      },
      async ({ sprintId, startDate, endDate, goal }) => {
        try {
          console.log(`Starting sprint ${sprintId}`);
          const sprint = await this.jiraService.getSprint(sprintId);
          const response = await this.jiraService.updateSprint(sprintId, {
            state: "active",
            startDate: startDate ?? sprint.startDate,
            endDate: endDate ?? sprint.endDate,
            goal: goal ?? sprint.goal,
          });
          return {
            content: [
              { type: "text", text: JSON.stringify(response, null, 2) },
            ],
          };
        } catch (error) {
          console.error("Error starting sprint:", error);
          return {
            content: [
              {
                type: "text",
                text: `Error starting sprint: ${formatToolError(error)}`,
              },
            ],
          };
        }
      },
    );

    this.server.tool(
      "complete_sprint",
      "Complete a sprint by setting state to closed",
      {
        sprintId: z.number().describe("Sprint ID to complete"),
        completeDate: z
          .string()
          .optional()
          .describe("Sprint completion date (ISO 8601)"),
        goal: z.string().optional().describe("Optional sprint goal"),
      },
      async ({ sprintId, completeDate, goal }) => {
        try {
          console.log(`Completing sprint ${sprintId}`);
          const response = await this.jiraService.updateSprint(sprintId, {
            state: "closed",
            completeDate,
            goal,
          });
          return {
            content: [
              { type: "text", text: JSON.stringify(response, null, 2) },
            ],
          };
        } catch (error) {
          console.error("Error completing sprint:", error);
          return {
            content: [
              {
                type: "text",
                text: `Error completing sprint: ${formatToolError(error)}`,
              },
            ],
          };
        }
      },
    );

    this.server.tool(
      "get_sprint_issues",
      "Get issues for a specific sprint",
      {
        boardId: z.number().describe("Board ID that contains the sprint"),
        sprintId: z.number().describe("Sprint ID to fetch issues for"),
        jql: z
          .string()
          .optional()
          .describe("Optional JQL query to filter sprint issues"),
        maxResults: z
          .number()
          .optional()
          .describe("Maximum number of issues to return (default: 50)"),
        startAt: z
          .number()
          .optional()
          .describe("Starting index for pagination (default: 0)"),
      },
      async ({ boardId, sprintId, jql, maxResults, startAt }) => {
        try {
          console.log(
            `Fetching issues for sprint ${sprintId} on board ${boardId}`,
          );
          const response = await this.jiraService.getSprintIssues(
            boardId,
            sprintId,
            {
              jql,
              maxResults,
              startAt,
            },
          );
          console.log(
            `Successfully fetched ${response.issues.length} issues from sprint ${sprintId}`,
          );
          return {
            content: [
              { type: "text", text: JSON.stringify(response, null, 2) },
            ],
          };
        } catch (error) {
          console.error("Error fetching sprint issues:", error);
          return {
            content: [
              {
                type: "text",
                text: `Error fetching sprint issues: ${formatToolError(error)}`,
              },
            ],
          };
        }
      },
    );

    this.server.tool(
      "get_board_issues",
      "Get all issues from a specific board",
      {
        boardId: z.number().describe("The ID of the Jira board"),
        jql: z
          .string()
          .optional()
          .describe("Optional JQL query to filter issues"),
        maxResults: z
          .number()
          .optional()
          .describe("Maximum number of issues to return (default: 50)"),
        startAt: z
          .number()
          .optional()
          .describe("Starting index for pagination (default: 0)"),
      },
      async ({ boardId, jql, maxResults, startAt }) => {
        try {
          console.log(`Fetching issues for board ${boardId}`);
          const response = await this.jiraService.getBoardIssues(boardId, {
            jql,
            maxResults,
            startAt,
          });
          console.log(
            `Successfully fetched ${response.issues.length} issues from board ${boardId}`,
          );
          return {
            content: [
              { type: "text", text: JSON.stringify(response, null, 2) },
            ],
          };
        } catch (error) {
          console.error(`Error fetching board issues for ${boardId}:`, error);
          return {
            content: [
              {
                type: "text",
                text: `Error fetching board issues: ${formatToolError(error)}`,
              },
            ],
          };
        }
      },
    );

    this.server.tool(
      "get_board_sprints",
      "Get all sprints from a specific board",
      {
        boardId: z.number().describe("The ID of the Jira board"),
        state: z
          .enum(["future", "active", "closed"])
          .optional()
          .describe("Filter sprints by state (future, active, or closed)"),
        maxResults: z
          .number()
          .optional()
          .describe("Maximum number of sprints to return (default: 50)"),
        startAt: z
          .number()
          .optional()
          .describe("Starting index for pagination (default: 0)"),
      },
      async ({ boardId, state, maxResults, startAt }) => {
        try {
          console.log(`Fetching sprints for board ${boardId}`);
          const response = await this.jiraService.getBoardSprints(
            boardId,
            state,
            maxResults,
            startAt,
          );
          console.log(
            `Successfully fetched ${response.values.length} sprints from board ${boardId}`,
          );
          return {
            content: [
              { type: "text", text: JSON.stringify(response, null, 2) },
            ],
          };
        } catch (error) {
          console.error(`Error fetching board sprints for ${boardId}:`, error);
          return {
            content: [
              {
                type: "text",
                text: `Error fetching board sprints: ${formatToolError(error)}`,
              },
            ],
          };
        }
      },
    );

    this.server.tool(
      "get_project_sprints",
      "Get sprints for all boards in a project",
      {
        projectKeyOrId: z
          .string()
          .describe("Project key or ID to filter boards"),
        state: z
          .enum(["future", "active", "closed"])
          .optional()
          .describe("Filter sprints by state (future, active, or closed)"),
        maxResults: z
          .number()
          .optional()
          .describe("Maximum number of sprints per board (default: 50)"),
        startAt: z
          .number()
          .optional()
          .describe("Starting index per board (default: 0)"),
      },
      async ({ projectKeyOrId, state, maxResults, startAt }) => {
        try {
          console.log(`Fetching sprints for project ${projectKeyOrId}`);
          const boardsResponse = await this.jiraService.getAllBoards(
            50,
            0,
            projectKeyOrId,
          );
          const results = await Promise.all(
            boardsResponse.values.map(async (board) => {
              const sprints = await this.jiraService.getBoardSprints(
                board.id,
                state,
                maxResults ?? 50,
                startAt ?? 0,
              );
              return {
                board: {
                  id: board.id,
                  name: board.name,
                  type: board.type,
                  location: board.location,
                },
                sprints,
              };
            }),
          );
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    projectKeyOrId,
                    totalBoards: boardsResponse.total,
                    results,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        } catch (error) {
          console.error(
            `Error fetching project sprints for ${projectKeyOrId}:`,
            error,
          );
          return {
            content: [
              {
                type: "text",
                text: `Error fetching project sprints: ${formatToolError(error)}`,
              },
            ],
          };
        }
      },
    );

    this.server.tool(
      "move_issues_to_board",
      "Move issues from backlog to a board or rank them on the board",
      {
        boardId: z.number().describe("The ID of the Jira board"),
        issues: z
          .array(z.string())
          .describe('Array of issue keys to move (e.g., ["PROJ-1", "PROJ-2"])'),
        rankAfterIssue: z
          .string()
          .optional()
          .describe("Position issues after this issue key"),
        rankBeforeIssue: z
          .string()
          .optional()
          .describe("Position issues before this issue key"),
      },
      async ({ boardId, issues, rankAfterIssue, rankBeforeIssue }) => {
        try {
          console.log(`Moving ${issues.length} issues to board ${boardId}`);
          await this.jiraService.moveIssuesToBoard(
            boardId,
            issues,
            rankAfterIssue,
            rankBeforeIssue,
          );
          console.log(
            `Successfully moved ${issues.length} issues to board ${boardId}`,
          );
          return {
            content: [
              {
                type: "text",
                text: `Successfully moved ${issues.length} issues to board ${boardId}`,
              },
            ],
          };
        } catch (error) {
          console.error(`Error moving issues to board ${boardId}:`, error);
          return {
            content: [
              {
                type: "text",
                text: `Error moving issues to board: ${formatToolError(error)}`,
              },
            ],
          };
        }
      },
    );

    this.server.tool(
      "get_board_details",
      "Get detailed configuration and metadata for a specific board",
      {
        boardId: z.number().describe("The ID of the Jira board"),
      },
      async ({ boardId }) => {
        try {
          console.log(`Fetching details for board ${boardId}`);
          const config = await this.jiraService.getBoardConfiguration(boardId);
          const board = await this.jiraService.getBoard(boardId);
          const result = {
            board,
            configuration: config,
          };
          console.log(`Successfully fetched details for board ${boardId}`);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        } catch (error) {
          console.error(`Error fetching board details for ${boardId}:`, error);
          return {
            content: [
              {
                type: "text",
                text: `Error fetching board details: ${formatToolError(error)}`,
              },
            ],
          };
        }
      },
    );

    this.server.tool(
      "get_board_backlog",
      "Get issues from a board's backlog (issues not assigned to any active or future sprint)",
      {
        boardId: z.number().describe("The ID of the Jira board"),
        jql: z
          .string()
          .optional()
          .describe("Optional JQL query to filter backlog issues"),
        maxResults: z
          .number()
          .optional()
          .describe("Maximum number of issues to return (default: 50)"),
        startAt: z
          .number()
          .optional()
          .describe("Starting index for pagination (default: 0)"),
      },
      async ({ boardId, jql, maxResults, startAt }) => {
        try {
          console.log(`Fetching backlog for board ${boardId}`);
          const response = await this.jiraService.getBoardBacklog(boardId, {
            jql,
            maxResults,
            startAt,
          });
          console.log(
            `Successfully fetched ${response.issues.length} backlog issues from board ${boardId}`,
          );
          return {
            content: [
              { type: "text", text: JSON.stringify(response, null, 2) },
            ],
          };
        } catch (error) {
          console.error(`Error fetching board backlog for ${boardId}:`, error);
          return {
            content: [
              {
                type: "text",
                text: `Error fetching board backlog: ${formatToolError(error)}`,
              },
            ],
          };
        }
      },
    );

    // --- Confluence tools ---

    this.server.tool(
      "search_confluence_pages",
      "Search Confluence pages by title, space, or status",
      {
        title: z
          .string()
          .optional()
          .describe("Text to search for in page titles"),
        spaceId: z
          .string()
          .optional()
          .describe("Confluence space ID to limit the search"),
        spaceKey: z
          .string()
          .optional()
          .describe(
            "Confluence space key (e.g., 'ALFA'). Ignored if spaceId is provided",
          ),
        limit: z
          .number()
          .optional()
          .describe("Maximum number of results (default: 25)"),
        cursor: z
          .string()
          .optional()
          .describe(
            "Pagination cursor from a previous search response for next page",
          ),
      },
      async ({ title, spaceId, spaceKey, limit, cursor }) => {
        try {
          let resolvedSpaceId = spaceId;
          if (!resolvedSpaceId && spaceKey) {
            resolvedSpaceId =
              await this.confluenceService.resolveSpaceId(spaceKey);
          }

          console.log(
            `Searching Confluence pages: title=${title}, spaceId=${resolvedSpaceId}`,
          );
          const response = await this.confluenceService.searchPages({
            title,
            spaceId: resolvedSpaceId,
            limit,
            cursor,
          });
          console.log(`Found ${response.results.length} Confluence pages`);
          return {
            content: [
              { type: "text", text: JSON.stringify(response, null, 2) },
            ],
          };
        } catch (error) {
          console.error("Error searching Confluence pages:", error);
          return {
            content: [
              {
                type: "text",
                text: `Error searching Confluence pages: ${formatToolError(error)}`,
              },
            ],
          };
        }
      },
    );

    this.server.tool(
      "get_confluence_spaces",
      "List Confluence spaces and resolve space keys to IDs",
      {
        keys: z
          .array(z.string())
          .optional()
          .describe("Space keys to filter by (e.g., ['SCRUM', 'DEV'])"),
        type: z
          .string()
          .optional()
          .describe("Filter by space type (e.g., 'global', 'personal')"),
        limit: z
          .number()
          .optional()
          .describe("Maximum number of results (default: 25)"),
      },
      async ({ keys, type, limit }) => {
        try {
          console.log(
            `Fetching Confluence spaces: keys=${keys?.join(",")}, type=${type}`,
          );
          const response = await this.confluenceService.getSpaces({
            keys,
            type,
            limit,
          });
          console.log(`Found ${response.results.length} Confluence spaces`);
          return {
            content: [
              { type: "text", text: JSON.stringify(response, null, 2) },
            ],
          };
        } catch (error) {
          console.error("Error fetching Confluence spaces:", error);
          return {
            content: [
              {
                type: "text",
                text: `Error fetching Confluence spaces: ${formatToolError(error)}`,
              },
            ],
          };
        }
      },
    );

    this.server.tool(
      "search_confluence_pages_cql",
      "Advanced search using Confluence CQL (Confluence Query Language). Supports operators like =, !=, ~, >, <, AND, OR. Example: space='ALFA' AND title~'Test*' OR type='blogpost'",
      {
        cql: z
          .string()
          .describe(
            "CQL query string (e.g., \"space='ALFA' AND title~'Test'\")",
          ),
        limit: z
          .number()
          .optional()
          .describe("Maximum number of results (default: 25)"),
      },
      async ({ cql, limit }) => {
        try {
          console.log(`CQL search: ${cql}`);
          const response = await this.confluenceService.searchPagesWithCql(
            cql,
            limit,
          );
          console.log(`Found ${response.results.length} Confluence pages`);
          return {
            content: [
              { type: "text", text: JSON.stringify(response, null, 2) },
            ],
          };
        } catch (error) {
          console.error("Error searching Confluence pages with CQL:", error);
          return {
            content: [
              {
                type: "text",
                text: `Error searching Confluence pages with CQL: ${formatToolError(error)}`,
              },
            ],
          };
        }
      },
    );

    this.server.tool(
      "get_confluence_page",
      "Get detailed information about a Confluence page",
      {
        pageId: z.string().describe("The ID of the Confluence page to fetch"),
      },
      async ({ pageId }) => {
        try {
          console.log(`Fetching Confluence page: ${pageId}`);
          const page = await this.confluenceService.getPage(pageId);
          console.log(`Successfully fetched Confluence page: ${page.title}`);
          return {
            content: [{ type: "text", text: JSON.stringify(page, null, 2) }],
          };
        } catch (error) {
          console.error(`Error fetching Confluence page ${pageId}:`, error);
          return {
            content: [
              {
                type: "text",
                text: `Error fetching Confluence page: ${formatToolError(error)}`,
              },
            ],
          };
        }
      },
    );

    this.server.tool(
      "get_confluence_page_ancestors",
      "Get ancestor pages in the Confluence page hierarchy",
      {
        pageId: z
          .string()
          .describe("The ID of the Confluence page to get ancestors for"),
      },
      async ({ pageId }) => {
        try {
          console.log(`Fetching Confluence page ancestors: ${pageId}`);
          const ancestors =
            await this.confluenceService.getPageAncestors(pageId);
          console.log(
            `Found ${ancestors.results.length} ancestors for page ${pageId}`,
          );
          return {
            content: [
              { type: "text", text: JSON.stringify(ancestors, null, 2) },
            ],
          };
        } catch (error) {
          console.error(
            `Error fetching Confluence page ancestors for ${pageId}:`,
            error,
          );
          return {
            content: [
              {
                type: "text",
                text: `Error fetching Confluence page ancestors: ${formatToolError(error)}`,
              },
            ],
          };
        }
      },
    );

    this.server.tool(
      "get_confluence_page_children",
      "Get direct child pages of a Confluence page",
      {
        pageId: z.string().describe("The ID of the Confluence parent page"),
        limit: z
          .number()
          .optional()
          .describe("Maximum number of results (default: 25)"),
      },
      async ({ pageId, limit }) => {
        try {
          console.log(`Fetching Confluence page children: ${pageId}`);
          const children = await this.confluenceService.getPageChildren(
            pageId,
            limit,
          );
          console.log(
            `Found ${children.results.length} children for page ${pageId}`,
          );
          return {
            content: [
              { type: "text", text: JSON.stringify(children, null, 2) },
            ],
          };
        } catch (error) {
          console.error(
            `Error fetching Confluence page children for ${pageId}:`,
            error,
          );
          return {
            content: [
              {
                type: "text",
                text: `Error fetching Confluence page children: ${formatToolError(error)}`,
              },
            ],
          };
        }
      },
    );

    this.server.tool(
      "create_confluence_page",
      "Create a new Confluence page in a space",
      {
        spaceId: z
          .string()
          .optional()
          .describe(
            "Confluence space numeric ID (use get_confluence_spaces to discover)",
          ),
        spaceKey: z
          .string()
          .optional()
          .describe(
            "Confluence space key (e.g., 'PROJ', '~user'). Ignored if spaceId is provided",
          ),
        title: z.string().min(1).describe("The title of the new page"),
        body: z
          .string()
          .min(1)
          .describe("Page content in storage or atlas_doc_format"),
        representation: z
          .enum(["storage", "atlas_doc_format"])
          .optional()
          .describe("Content format representation (default: storage)"),
        parentId: z
          .string()
          .optional()
          .describe("Optional parent page ID for hierarchy"),
      },
      async ({ spaceId, spaceKey, title, body, representation, parentId }) => {
        try {
          let resolvedSpaceId = spaceId;

          if (!resolvedSpaceId && spaceKey) {
            console.log(`Resolving space key "${spaceKey}" to space ID...`);
            resolvedSpaceId =
              await this.confluenceService.resolveSpaceId(spaceKey);
            if (!resolvedSpaceId) {
              return {
                content: [
                  {
                    type: "text",
                    text: `Space "${spaceKey}" not found. Use get_confluence_spaces to list available spaces.`,
                  },
                ],
              };
            }
            console.log(
              `Resolved space key "${spaceKey}" to ID "${resolvedSpaceId}"`,
            );
          }

          if (!resolvedSpaceId) {
            return {
              content: [
                {
                  type: "text",
                  text: "Either spaceId or spaceKey must be provided. Use get_confluence_spaces to find space IDs.",
                },
              ],
            };
          }

          console.log(
            `Creating Confluence page: ${title} in space ${resolvedSpaceId}`,
          );
          const page = await this.confluenceService.createPage({
            spaceId: resolvedSpaceId,
            title,
            body,
            representation,
            parentId,
          });
          console.log(`Successfully created Confluence page: ${page.id}`);
          return {
            content: [{ type: "text", text: JSON.stringify(page, null, 2) }],
          };
        } catch (error) {
          console.error("Error creating Confluence page:", error);
          return {
            content: [
              {
                type: "text",
                text: `Error creating Confluence page: ${formatToolError(error)}`,
              },
            ],
          };
        }
      },
    );

    this.server.tool(
      "update_confluence_page",
      "Update an existing Confluence page",
      {
        pageId: z.string().describe("The ID of the Confluence page to update"),
        title: z.string().min(1).describe("The new title for the page"),
        body: z
          .string()
          .min(1)
          .describe("New page content in storage or atlas_doc_format"),
        version: z
          .number()
          .describe(
            "Current version number of the page (required for conflict detection)",
          ),
        representation: z
          .enum(["storage", "atlas_doc_format"])
          .optional()
          .describe("Content format representation (default: storage)"),
      },
      async ({ pageId, title, body, version, representation }) => {
        try {
          console.log(`Updating Confluence page: ${pageId} (v${version})`);
          const page = await this.confluenceService.updatePage({
            id: pageId,
            title,
            body,
            version,
            representation,
          });
          console.log(`Successfully updated Confluence page: ${page.id}`);
          return {
            content: [{ type: "text", text: JSON.stringify(page, null, 2) }],
          };
        } catch (error) {
          console.error(`Error updating Confluence page ${pageId}:`, error);
          return {
            content: [
              {
                type: "text",
                text: `Error updating Confluence page: ${formatToolError(error)}`,
              },
            ],
          };
        }
      },
    );

    this.server.tool(
      "delete_confluence_page",
      "Move a Confluence page to the trash by ID",
      {
        pageId: z.string().describe("The ID of the Confluence page to delete"),
      },
      async ({ pageId }) => {
        try {
          console.log(`Deleting Confluence page: ${pageId}`);
          await this.confluenceService.deletePage(pageId);
          console.log(`Successfully deleted Confluence page: ${pageId}`);
          return {
            content: [
              {
                type: "text",
                text: `Confluence page ${pageId} moved to trash`,
              },
            ],
          };
        } catch (error) {
          console.error(`Error deleting Confluence page ${pageId}:`, error);
          return {
            content: [
              {
                type: "text",
                text: `Error deleting Confluence page: ${formatToolError(error)}`,
              },
            ],
          };
        }
      },
    );

    this.server.tool(
      "link_confluence_page_to_jira_issue",
      "Generate a Confluence page web URL suitable for pasting into a Jira issue",
      {
        pageId: z.string().describe("The ID of the Confluence page to link"),
      },
      async ({ pageId }) => {
        try {
          console.log(`Generating link for Confluence page: ${pageId}`);
          const page = await this.confluenceService.getPage(pageId);
          const webUrl = this.confluenceService.getPageWebUrl(
            this.atlassianBaseUrl,
            page,
          );
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    pageId,
                    pageTitle: page.title,
                    webUrl,
                    status: page.status,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        } catch (error) {
          console.error(`Error linking Confluence page ${pageId}:`, error);
          return {
            content: [
              {
                type: "text",
                text: `Error linking Confluence page: ${formatToolError(error)}`,
              },
            ],
          };
        }
      },
    );

    this.server.tool(
      "link_confluence_page_to_issue",
      'Add a Confluence page link to a Jira issue\'s "Linked work items" panel via the remote link API',
      {
        issueKey: z
          .string()
          .describe("The Jira issue key to link to (e.g., PROJ-123)"),
        pageId: z.string().describe("The ID of the Confluence page to link"),
      },
      async ({ issueKey, pageId }) => {
        try {
          console.log(`Linking Confluence page ${pageId} to issue ${issueKey}`);
          const page = await this.confluenceService.getPage(pageId);
          const webUrl = this.confluenceService.getPageWebUrl(
            this.atlassianBaseUrl,
            page,
          );
          const remoteLink = await this.jiraService.addRemoteLink(issueKey, {
            url: webUrl,
            title: page.title,
            type: "page",
          });
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    issueKey,
                    pageId,
                    pageTitle: page.title,
                    webUrl,
                    remoteLinkId: remoteLink.id,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        } catch (error) {
          console.error(
            `Error linking Confluence page ${pageId} to issue ${issueKey}:`,
            error,
          );
          return {
            content: [
              {
                type: "text",
                text: `Error linking Confluence page to issue: ${formatToolError(error)}`,
              },
            ],
          };
        }
      },
    );

    this.server.tool(
      "find_confluence_pages_for_issue",
      "Search Confluence pages whose title matches a Jira issue key (exact title match)",
      {
        issueKey: z
          .string()
          .describe(
            "The Jira issue key to search for in Confluence (e.g., PROJECT-123)",
          ),
      },
      async ({ issueKey }) => {
        try {
          console.log(`Searching Confluence pages for issue: ${issueKey}`);
          const response =
            await this.confluenceService.searchPagesByTitle(issueKey);
          console.log(
            `Found ${response.results.length} pages referencing ${issueKey}`,
          );
          return {
            content: [
              { type: "text", text: JSON.stringify(response, null, 2) },
            ],
          };
        } catch (error) {
          console.error(
            `Error finding Confluence pages for issue ${issueKey}:`,
            error,
          );
          return {
            content: [
              {
                type: "text",
                text: `Error finding Confluence pages: ${formatToolError(error)}`,
              },
            ],
          };
        }
      },
    );

    this.server.tool(
      "map_jira_project_to_confluence_space",
      "Map a Jira project key to the matching Confluence space (Jira projects often share the same key with a Confluence space)",
      {
        projectKey: z
          .string()
          .describe("The Jira project key to map (e.g., PROJ)"),
      },
      async ({ projectKey }) => {
        try {
          console.log(
            `Mapping Jira project key "${projectKey}" to Confluence space`,
          );

          // First, try direct key match
          const spaces = await this.confluenceService.getSpaces({
            keys: [projectKey],
            status: "current",
          });
          if (spaces.results.length > 0) {
            const space = spaces.results[0];
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      projectKey,
                      match: {
                        spaceId: space.id,
                        spaceKey: space.key,
                        spaceName: space.name,
                        webUrl: `${this.atlassianBaseUrl}${space._links.webui}`,
                        matchType: "key",
                      },
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          }

          // Fall back to matching by project name
          console.log(
            `No direct key match for "${projectKey}", trying name match...`,
          );
          const project = await this.jiraService.getProjectByKey(projectKey);
          const allSpaces = await this.confluenceService.getSpaces({
            limit: 50,
          });
          const nameMatch = allSpaces.results.find(
            (s) => s.name.toLowerCase() === project.name.toLowerCase(),
          );

          if (nameMatch) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      projectKey,
                      projectName: project.name,
                      match: {
                        spaceId: nameMatch.id,
                        spaceKey: nameMatch.key,
                        spaceName: nameMatch.name,
                        webUrl: `${this.atlassianBaseUrl}${nameMatch._links.webui}`,
                        matchType: "name",
                      },
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          }

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    projectKey,
                    projectName: project.name,
                    match: null,
                    hint: `No Confluence space found with key "${projectKey}" or name "${project.name}". Here are all available spaces.`,
                    allSpaces: allSpaces.results.map((s) => ({
                      id: s.id,
                      key: s.key,
                      name: s.name,
                      type: s.type,
                    })),
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        } catch (error) {
          console.error(
            `Error mapping project ${projectKey} to Confluence space:`,
            error,
          );
          return {
            content: [
              {
                type: "text",
                text: `Error mapping project to Confluence space: ${formatToolError(error)}`,
              },
            ],
          };
        }
      },
    );
  }

  async connect(transport: Transport): Promise<void> {
    console.log("Connecting to transport...");
    await this.server.connect(transport);
    console.log("Server connected and ready to process requests");
  }
}

function formatToolError(error: unknown): string {
  if (isStatusError(error)) {
    return `HTTP ${error.status}: ${error.err}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function isStatusError(
  value: unknown,
): value is { status: number; err: string } {
  if (!value || typeof value !== "object") {
    return false;
  }

  const error = value as { status?: unknown; err?: unknown };
  return typeof error.status === "number" && typeof error.err === "string";
}
