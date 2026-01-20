import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { JiraService } from "./services/jira";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import express, { Request, Response } from "express";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { IncomingMessage, ServerResponse } from "http";
import {
  JiraBoard,
  JiraBoardConfiguration,
  JiraBoardsResponse,
  JiraSprintsResponse,
} from "./types/jira";

export class JiraMcpServer {
  private readonly server: McpServer;
  private readonly jiraService: JiraService;
  private sseTransport: SSEServerTransport | null = null;

  constructor(jiraUrl: string, username: string, apiToken: string) {
    this.jiraService = new JiraService(jiraUrl, username, apiToken);
    this.server = new McpServer({
      name: "Jira MCP Server",
      version: "0.1.0",
    });

    this.registerTools();
  }

  private registerTools(): void {
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
            content: [{ type: "text", text: `Error fetching issue: ${error}` }],
          };
        }
      },
    );

    // Tool to add a comment to an issue
    this.server.tool(
      "add_comment",
      "Add a comment to an existing Jira issue",
      {
        issueKey: z
          .string()
          .describe("The Jira issue key to comment on (e.g., PROJ-123)"),
        comment: z
          .string()
          .min(1)
          .describe("The text of the comment to add to the issue"),
      },
      async ({ issueKey, comment }) => {
        try {
          console.log(`Adding comment to issue ${issueKey}`);
          const response = await this.jiraService.addComment(issueKey, comment);
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
            content: [{ type: "text", text: `Error adding comment: ${error}` }],
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
          console.error(`Error transitioning issue ${issueKey}:`, error);
          return {
            content: [
              { type: "text", text: `Error transitioning issue: ${error}` },
            ],
          };
        }
      },
    );

    // Tool to list available transitions for an issue
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
              { type: "text", text: `Error fetching transitions: ${error}` },
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
            projectKey,
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
                text: `Error fetching epics: ${error}`,
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
                text: `Error fetching epic children: ${error}`,
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
            projectKey,
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
                text: `Error fetching assigned issues: ${error}`,
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
            projectKey,
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
                text: `Error fetching pending assigned issues: ${error}`,
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
            projectKey,
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
              { type: "text", text: `Error fetching issues by type: ${error}` },
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
              { type: "text", text: `Error fetching projects: ${error}` },
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
              { type: "text", text: `Error fetching issue types: ${error}` },
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
      },
      async ({ projectKey, summary, description }) => {
        try {
          console.log(`Creating epic in project ${projectKey}: ${summary}`);
          const response = await this.jiraService.createEpic(
            projectKey,
            summary,
            description,
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
            content: [{ type: "text", text: `Error creating epic: ${error}` }],
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
      },
      async ({ projectKey, issueType, summary, parentKey, description }) => {
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
                text: `Error creating issue with parent: ${error}`,
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
              { type: "text", text: `Error setting parent issue: ${error}` },
            ],
          };
        }
      },
    );

    // Tool to update an issue description
    this.server.tool(
      "update_issue_description",
      "Replace the description of an existing Jira issue",
      {
        issueKey: z
          .string()
          .describe("The key of the issue to update (e.g., PROJ-123)"),
        description: z
          .string()
          .min(1)
          .describe("The new markdown/plain text description to set"),
      },
      async ({ issueKey, description }) => {
        try {
          console.log(`Updating description for issue ${issueKey}`);
          await this.jiraService.updateIssueDescription(issueKey, description);
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
                text: `Error updating description: ${error}`,
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
                text: `Error fetching issue link types: ${error}`,
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
                text: `Error linking issues: ${error}`,
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
              { type: "text", text: `Error creating sprint: ${error}` },
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
              { type: "text", text: `Error fetching sprint: ${error}` },
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
          console.log(`Fetching sprint ${sprintId} for project ${projectKeyOrId}`);
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
                text: `Error fetching sprint for project: ${error}`,
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
              { type: "text", text: `Error adding issues to sprint: ${error}` },
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
                text: `Error removing issues from sprint: ${error}`,
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
              { type: "text", text: `Error starting sprint: ${error}` },
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
              { type: "text", text: `Error completing sprint: ${error}` },
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
              { type: "text", text: `Error fetching sprint issues: ${error}` },
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
              { type: "text", text: `Error fetching board issues: ${error}` },
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
              { type: "text", text: `Error fetching board sprints: ${error}` },
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
          console.error(`Error fetching project sprints for ${projectKeyOrId}:`, error);
          return {
            content: [
              {
                type: "text",
                text: `Error fetching project sprints: ${error}`,
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
              { type: "text", text: `Error moving issues to board: ${error}` },
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
              { type: "text", text: `Error fetching board details: ${error}` },
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
              { type: "text", text: `Error fetching board backlog: ${error}` },
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

  async startHttpServer(port: number): Promise<void> {
    const app = express();

    app.get("/sse", async (req: Request, res: Response) => {
      console.log("New SSE connection established");
      this.sseTransport = new SSEServerTransport(
        "/messages",
        res as unknown as ServerResponse<IncomingMessage>,
      );
      await this.server.connect(this.sseTransport);
    });

    app.post("/messages", async (req: Request, res: Response) => {
      if (!this.sseTransport) {
        res.sendStatus(400);
        return;
      }
      await this.sseTransport.handlePostMessage(
        req as unknown as IncomingMessage,
        res as unknown as ServerResponse<IncomingMessage>,
      );
    });

    app.listen(port, () => {
      console.log(`HTTP server listening on port ${port}`);
      console.log(`SSE endpoint available at http://localhost:${port}/sse`);
      console.log(
        `Message endpoint available at http://localhost:${port}/messages`,
      );
    });
  }
}
