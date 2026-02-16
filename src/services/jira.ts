import {
  JiraADFBlockNode,
  JiraADFBulletListNode,
  JiraADFDocument,
  JiraADFInlineNode,
  JiraADFListItemNode,
  JiraADFMark,
  JiraADFOrderedListNode,
  JiraADFParagraphNode,
  JiraBoard,
  JiraBoardConfiguration,
  JiraBoardsResponse,
  JiraComment,
  JiraCreateIssueResponse,
  JiraError,
  JiraIssue,
  JiraIssueLinkRequest,
  JiraIssueLinkTypesResponse,
  JiraIssueTypeResponse,
  JiraProject,
  JiraSearchParams,
  JiraSearchResponse,
  JiraSprint,
  JiraSprintsResponse,
  JiraTransitionsResponse,
  JiraUserSearchResponse,
} from "~/types/jira";

export type JiraLogSink = (name: string, value: unknown) => Promise<void> | void;

export class JiraService {
  private readonly baseUrl: string;
  private readonly auth: {
    username: string;
    password: string;
  };
  private readonly logSink?: JiraLogSink;

  constructor(baseUrl: string, username: string, apiToken: string, logSink?: JiraLogSink) {
    // Ensure the base URL doesn't end with a trailing slash
    this.baseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    this.auth = {
      username,
      password: apiToken,
    };
    this.logSink = logSink;
  }

  private async request<T>(
    endpoint: string,
    method: "GET" | "POST" | "PUT" = "GET",
    data?: any,
  ): Promise<T> {
    try {
      console.log(`Calling ${this.baseUrl}${endpoint}`);

      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Basic ${toBase64(`${this.auth.username}:${this.auth.password}`)}`,
        },
        ...(method === "POST" || method === "PUT" ? { body: JSON.stringify(data) } : {}),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => undefined);
        throw {
          status: response.status,
          err: formatJiraErrorMessage(errorBody, response.statusText),
        } as JiraError;
      }

      if (response.status === 204) {
        return undefined as T;
      }

      return (await response.json()) as T;
    } catch (error) {
      if (isJiraError(error)) {
        throw error;
      }
      throw new Error(
        `Failed to make request to Jira API: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async writeLog(name: string, value: unknown): Promise<void> {
    if (!this.logSink) {
      return;
    }
    await this.logSink(name, value);
  }

  private parseMarkdownInline(text: string): JiraADFInlineNode[] {
    const nodes: JiraADFInlineNode[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      let match: RegExpMatchArray | null = null;

      const patterns: Array<{
        regex: RegExp;
        markType: JiraADFMark["type"];
        textGroup: number;
        hrefGroup?: number;
      }> = [
        { regex: /^\*\*([^*]+)\*\*/, markType: "strong", textGroup: 1 },
        { regex: /^\*([^*]+)\*/, markType: "em", textGroup: 1 },
        { regex: /^__([^_]+)__/, markType: "strong", textGroup: 1 },
        { regex: /^_([^_]+)_/, markType: "em", textGroup: 1 },
        { regex: /^`([^`]+)`/, markType: "code", textGroup: 1 },
        {
          regex: /^\[([^\]]+)\]\(([^)]+)\)/,
          markType: "link",
          textGroup: 1,
          hrefGroup: 2,
        },
      ];

      for (const pattern of patterns) {
        match = remaining.match(pattern.regex);
        if (match) {
          const mark: JiraADFMark =
            pattern.markType === "link"
              ? { type: "link", attrs: { href: match[pattern.hrefGroup ?? 2] } }
              : { type: pattern.markType };

          nodes.push({
            type: "text",
            text: match[pattern.textGroup],
            marks: [mark],
          });
          remaining = remaining.slice(match[0].length);
          break;
        }
      }

      if (!match) {
        const nextSpecial = remaining.search(/\*\*|\*|__|_|`|\[|\]/);
        if (nextSpecial === -1) {
          if (remaining.length > 0) {
            nodes.push({ type: "text", text: remaining });
          }
          break;
        }

        if (nextSpecial === 0) {
          nodes.push({ type: "text", text: remaining[0] });
          remaining = remaining.slice(1);
        } else {
          nodes.push({ type: "text", text: remaining.slice(0, nextSpecial) });
          remaining = remaining.slice(nextSpecial);
        }
      }
    }

    return nodes;
  }

  private buildParagraph(text: string): JiraADFParagraphNode {
    const content = this.parseMarkdownInline(text);
    return {
      type: "paragraph",
      content: content.length ? content : [{ type: "text", text: "" }],
    };
  }

  private parseMarkdownBlocks(text: string): JiraADFBlockNode[] {
    const lines = text.replace(/\r\n/g, "\n").split("\n");
    const blocks: JiraADFBlockNode[] = [];
    let paragraphLines: string[] = [];
    let listBuffer: {
      type: "bullet" | "ordered";
      items: string[];
      start?: number;
    } | null = null;

    const flushParagraph = () => {
      if (paragraphLines.length === 0) {
        return;
      }
      const content = paragraphLines.join(" ").trim();
      if (content.length > 0) {
        blocks.push(this.buildParagraph(content));
      }
      paragraphLines = [];
    };

    const flushList = () => {
      if (!listBuffer || listBuffer.items.length === 0) {
        listBuffer = null;
        return;
      }

      const items: JiraADFListItemNode[] = listBuffer.items.map((item) => ({
        type: "listItem",
        content: [this.buildParagraph(item)],
      }));

      if (listBuffer.type === "bullet") {
        const listNode: JiraADFBulletListNode = {
          type: "bulletList",
          content: items,
        };
        blocks.push(listNode);
      } else {
        const listNode: JiraADFOrderedListNode = {
          type: "orderedList",
          content: items,
          attrs: listBuffer.start ? { order: listBuffer.start } : undefined,
        };
        blocks.push(listNode);
      }

      listBuffer = null;
    };

    for (const rawLine of lines) {
      const line = rawLine.trimEnd();
      const trimmed = line.trim();

      if (trimmed.length === 0) {
        flushParagraph();
        flushList();
        continue;
      }

      const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
      if (headingMatch) {
        flushParagraph();
        flushList();
        blocks.push({
          type: "heading",
          attrs: { level: headingMatch[1].length as 1 | 2 | 3 | 4 | 5 | 6 },
          content: this.parseMarkdownInline(headingMatch[2]),
        });
        continue;
      }

      const bulletMatch = trimmed.match(/^[-*]\s+(.*)$/);
      if (bulletMatch) {
        flushParagraph();
        if (listBuffer && listBuffer.type !== "bullet") {
          flushList();
        }
        if (!listBuffer) {
          listBuffer = { type: "bullet", items: [] };
        }
        listBuffer.items.push(bulletMatch[1]);
        continue;
      }

      const orderedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
      if (orderedMatch) {
        flushParagraph();
        if (listBuffer && listBuffer.type !== "ordered") {
          flushList();
        }
        if (!listBuffer) {
          listBuffer = {
            type: "ordered",
            items: [],
            start: Number(orderedMatch[1]),
          };
        }
        listBuffer.items.push(orderedMatch[2]);
        continue;
      }

      if (listBuffer) {
        listBuffer.items[listBuffer.items.length - 1] =
          `${listBuffer.items[listBuffer.items.length - 1]} ${trimmed}`.trim();
        continue;
      }

      paragraphLines.push(trimmed);
    }

    flushParagraph();
    flushList();

    if (blocks.length === 0) {
      return [this.buildParagraph("")];
    }

    return blocks;
  }

  private createTextADF(text: string): JiraADFDocument {
    return {
      type: "doc",
      version: 1,
      content: this.parseMarkdownBlocks(text),
    };
  }

  /**
   * Get a Jira issue by key
   */
  async getIssue(issueKey: string): Promise<JiraIssue> {
    const endpoint = `/rest/api/3/issue/${issueKey}`;
    const response = await this.request<JiraIssue>(endpoint);
    await this.writeLog(`jira-issue-${issueKey}.json`, response);
    return response;
  }

  /**
   * Add a new comment to an issue
   */
  async addComment(issueKey: string, comment: string): Promise<JiraComment> {
    const content = comment.trim();
    if (!content) {
      throw new Error("Comment text cannot be empty");
    }
    const endpoint = `/rest/api/3/issue/${issueKey}/comment`;
    const response = await this.request<JiraComment>(endpoint, "POST", {
      body: this.createTextADF(content),
    });
    await this.writeLog(`jira-comment-${issueKey}-${response.id}.json`, response);
    return response;
  }

  /**
   * Search for Jira issues using the enhanced JQL endpoint
   */
  async searchIssues(params: JiraSearchParams): Promise<JiraSearchResponse> {
    const endpoint = `/rest/api/3/search/jql`;
    const response = await this.request<JiraSearchResponse>(endpoint, "POST", params);
    await this.writeLog(`jira-search-${new Date().toISOString()}.json`, response);
    return response;
  }

  /**
   * Get issues assigned to the current user
   */
  async getAssignedIssues(
    projectKey?: string,
    maxResults: number = 50,
    includeCompleted: boolean = true,
  ): Promise<JiraSearchResponse> {
    const conditions = ["assignee = currentUser()"];
    if (projectKey) {
      conditions.push(`project = ${projectKey}`);
    }
    if (!includeCompleted) {
      conditions.push("statusCategory != Done");
    }

    const jql = `${conditions.join(" AND ")} ORDER BY updated DESC`;

    return this.searchIssues({
      jql,
      maxResults,
      fields: ["summary", "description", "status", "issuetype", "priority", "assignee", "project"],
    });
  }

  /**
   * Get issues by type
   */
  async getIssuesByType(
    issueType: string,
    projectKey?: string,
    maxResults: number = 50,
  ): Promise<JiraSearchResponse> {
    const jql = projectKey
      ? `issuetype = "${issueType}" AND project = ${projectKey} ORDER BY updated DESC`
      : `issuetype = "${issueType}" ORDER BY updated DESC`;

    return this.searchIssues({
      jql,
      maxResults,
      fields: ["summary", "description", "status", "issuetype", "priority", "assignee", "project"],
    });
  }

  /**
   * Get epics from a project
   */
  async getEpics(projectKey?: string, maxResults: number = 50): Promise<JiraSearchResponse> {
    const jql = projectKey
      ? `project = ${projectKey} AND issuetype = Epic ORDER BY updated DESC`
      : `issuetype = Epic ORDER BY updated DESC`;

    return this.searchIssues({
      jql,
      maxResults,
      fields: ["summary", "description", "status", "issuetype", "priority", "assignee", "project"],
    });
  }

  /**
   * Get child issues of an epic
   */
  async getEpicChildren(epicKey: string, maxResults: number = 50): Promise<JiraSearchResponse> {
    const jql = `parent = ${epicKey} ORDER BY updated DESC`;

    return this.searchIssues({
      jql,
      maxResults,
      fields: [
        "summary",
        "description",
        "status",
        "issuetype",
        "priority",
        "assignee",
        "project",
        "parent",
      ],
    });
  }

  /**
   * Get possible transitions for an issue
   */
  async getIssueTransitions(issueKey: string): Promise<JiraTransitionsResponse> {
    const endpoint = `/rest/api/3/issue/${issueKey}/transitions`;
    return this.request<JiraTransitionsResponse>(endpoint);
  }

  /**
   * Move an issue to a new status via transition id
   */
  async transitionIssue(issueKey: string, transitionId: string): Promise<void> {
    const endpoint = `/rest/api/3/issue/${issueKey}/transitions`;
    await this.request<void>(endpoint, "POST", {
      transition: {
        id: transitionId,
      },
    });
  }

  /**
   * Get list of projects
   */
  async getProjects(): Promise<JiraProject[]> {
    const endpoint = `/rest/api/3/project`;
    const response = await this.request<JiraProject[]>(endpoint);
    return response;
  }

  /**
   * Get list of issue types
   */
  async getIssueTypes(): Promise<JiraIssueTypeResponse> {
    const endpoint = `/rest/api/3/issuetype`;
    const response = await this.request<JiraIssueTypeResponse>(endpoint);
    return response;
  }

  /**
   * Create a new epic
   */
  async createEpic(
    projectKey: string,
    summary: string,
    description?: string,
  ): Promise<JiraCreateIssueResponse> {
    const endpoint = `/rest/api/3/issue`;
    const payload: any = {
      fields: {
        project: {
          key: projectKey,
        },
        summary,
        issuetype: {
          name: "Epic",
        },
      },
    };

    if (description) {
      payload.fields.description = this.createTextADF(description);
    }

    const response = await this.request<JiraCreateIssueResponse>(endpoint, "POST", payload);
    await this.writeLog(`jira-create-epic-${response.key}.json`, response);
    return response;
  }

  /**
   * Create a new issue with a parent (linked to an epic)
   */
  async createIssueWithParent(
    projectKey: string,
    issueType: string,
    summary: string,
    parentKey: string,
    description?: string,
  ): Promise<JiraCreateIssueResponse> {
    const endpoint = `/rest/api/3/issue`;
    const payload: any = {
      fields: {
        project: {
          key: projectKey,
        },
        summary,
        issuetype: {
          name: issueType,
        },
        parent: {
          key: parentKey,
        },
      },
    };

    if (description) {
      payload.fields.description = this.createTextADF(description);
    }

    const response = await this.request<JiraCreateIssueResponse>(endpoint, "POST", payload);
    await this.writeLog(`jira-create-issue-${response.key}.json`, response);
    return response;
  }

  /**
   * Set the parent of an issue (works for both epic→issue and issue→subtask relationships)
   */
  async setParentIssue(issueKey: string, parentKey: string): Promise<void> {
    const endpoint = `/rest/api/3/issue/${issueKey}`;
    await this.request<void>(endpoint, "PUT", {
      fields: {
        parent: {
          key: parentKey,
        },
      },
    });
  }

  /**
   * Update the description of an issue
   */
  async updateIssueDescription(issueKey: string, description: string): Promise<void> {
    const content = description.trim();
    if (!content) {
      throw new Error("Description text cannot be empty");
    }
    const endpoint = `/rest/api/3/issue/${issueKey}`;
    await this.request<void>(endpoint, "PUT", {
      fields: {
        description: this.createTextADF(content),
      },
    });
  }

  /**
   * Assign an issue to a user
   * @param issueKey The issue key (e.g., "PROJECT-123")
   * @param assignee The user account ID, email, or username to assign the issue to
   */
  async assignIssue(issueKey: string, assignee: string): Promise<void> {
    const endpoint = `/rest/api/3/issue/${issueKey}`;

    // Try to find the user first to get their account ID
    try {
      const users = await this.searchUsers(assignee);
      const user = users.find(
        (u) =>
          u.accountId === assignee || u.emailAddress === assignee || u.displayName === assignee,
      );

      if (user) {
        await this.request<void>(endpoint, "PUT", {
          fields: {
            assignee: {
              accountId: user.accountId,
            },
          },
        });
      } else {
        // If user not found, try directly with the provided value (might be account ID)
        await this.request<void>(endpoint, "PUT", {
          fields: {
            assignee: {
              accountId: assignee,
            },
          },
        });
      }
    } catch {
      // If search fails, try direct assignment
      await this.request<void>(endpoint, "PUT", {
        fields: {
          assignee: {
            accountId: assignee,
          },
        },
      });
    }
  }

  /**
   * Search for users in the workspace
   * @param query Search query for user name or email
   * @returns Array of users matching the query
   */
  async searchUsers(query: string): Promise<JiraUserSearchResponse> {
    const endpoint = `/rest/api/3/user/search`;
    const queryParams = new URLSearchParams();
    queryParams.append("query", query);
    const fullUrl = `${endpoint}?${queryParams.toString()}`;
    return this.request<JiraUserSearchResponse>(fullUrl);
  }

  /**
   * Get all available issue link types
   */
  async getIssueLinkTypes(): Promise<JiraIssueLinkTypesResponse> {
    const endpoint = `/rest/api/3/issueLinkType`;
    return this.request<JiraIssueLinkTypesResponse>(endpoint);
  }

  /**
   * Create a link between two issues
   */
  async linkIssues(
    inwardIssueKey: string,
    outwardIssueKey: string,
    linkTypeName: string,
    comment?: string,
  ): Promise<void> {
    const endpoint = `/rest/api/3/issueLink`;
    const payload: JiraIssueLinkRequest = {
      type: {
        name: linkTypeName,
      },
      inwardIssue: {
        key: inwardIssueKey,
      },
      outwardIssue: {
        key: outwardIssueKey,
      },
    };

    if (comment) {
      payload.comment = {
        body: this.createTextADF(comment),
      };
    }

    await this.request<void>(endpoint, "POST", payload);
  }

  async getAllBoards(
    maxResults: number = 50,
    startAt: number = 0,
    projectKeyOrId?: string,
    boardType?: "scrum" | "kanban",
  ): Promise<JiraBoardsResponse> {
    const queryParams = new URLSearchParams({
      maxResults: String(maxResults),
      startAt: String(startAt),
    });
    if (projectKeyOrId) {
      queryParams.append("projectKeyOrId", projectKeyOrId);
    }
    if (boardType) {
      queryParams.append("type", boardType);
    }
    const endpoint = `/rest/agile/1.0/board?${queryParams.toString()}`;
    const response = await this.request<JiraBoardsResponse>(endpoint);
    await this.writeLog(`jira-boards-${new Date().toISOString()}.json`, response);
    return response;
  }

  async getBoard(boardId: number): Promise<JiraBoard> {
    const endpoint = `/rest/agile/1.0/board/${boardId}`;
    const response = await this.request<JiraBoard>(endpoint);
    await this.writeLog(`jira-board-${boardId}.json`, response);
    return response;
  }

  async getBoardIssues(
    boardId: number,
    params?: {
      jql?: string;
      maxResults?: number;
      startAt?: number;
      fields?: string[];
      expand?: string[];
    },
  ): Promise<JiraSearchResponse> {
    const queryParams = new URLSearchParams();
    if (params?.maxResults) {
      queryParams.append("maxResults", String(params.maxResults));
    }
    if (params?.startAt) {
      queryParams.append("startAt", String(params.startAt));
    }
    if (params?.jql) {
      queryParams.append("jql", params.jql);
    }
    if (params?.fields) {
      params.fields.forEach((field) => {
        queryParams.append("fields", field);
      });
    }
    if (params?.expand) {
      params.expand.forEach((exp) => {
        queryParams.append("expand", exp);
      });
    }

    const endpoint = `/rest/agile/1.0/board/${boardId}/issue?${queryParams.toString()}`;
    const response = await this.request<JiraSearchResponse>(endpoint);
    await this.writeLog(`jira-board-${boardId}-issues-${new Date().toISOString()}.json`, response);
    return response;
  }

  async getBoardSprints(
    boardId: number,
    state?: "future" | "active" | "closed",
    maxResults: number = 50,
    startAt: number = 0,
  ): Promise<JiraSprintsResponse> {
    const queryParams = new URLSearchParams({
      maxResults: String(maxResults),
      startAt: String(startAt),
    });
    if (state) {
      queryParams.append("state", state);
    }
    const endpoint = `/rest/agile/1.0/board/${boardId}/sprint?${queryParams.toString()}`;
    const response = await this.request<JiraSprintsResponse>(endpoint);
    await this.writeLog(`jira-board-${boardId}-sprints.json`, response);
    return response;
  }

  async createSprint(params: {
    name: string;
    originBoardId: number;
    startDate?: string;
    endDate?: string;
    goal?: string;
  }): Promise<JiraSprint> {
    const endpoint = `/rest/agile/1.0/sprint`;
    const payload = {
      name: params.name,
      originBoardId: params.originBoardId,
      startDate: params.startDate,
      endDate: params.endDate,
      goal: params.goal,
    };
    const response = await this.request<JiraSprint>(endpoint, "POST", payload);
    await this.writeLog(
      `jira-sprint-create-${params.originBoardId}-${new Date().toISOString()}.json`,
      response,
    );
    return response;
  }

  async getSprint(sprintId: number): Promise<JiraSprint> {
    const endpoint = `/rest/agile/1.0/sprint/${sprintId}`;
    const response = await this.request<JiraSprint>(endpoint);
    await this.writeLog(`jira-sprint-${sprintId}.json`, response);
    return response;
  }

  async addIssuesToSprint(sprintId: number, issues: string[]): Promise<void> {
    const endpoint = `/rest/agile/1.0/sprint/${sprintId}/issue`;
    const payload = { issues };
    await this.request<void>(endpoint, "POST", payload);
    await this.writeLog(`jira-sprint-${sprintId}-add-issues.json`, payload);
  }

  async removeIssuesFromSprint(issues: string[]): Promise<void> {
    const endpoint = `/rest/agile/1.0/backlog/issue`;
    const payload = { issues };
    await this.request<void>(endpoint, "POST", payload);
    await this.writeLog(`jira-backlog-move-${new Date().toISOString()}.json`, payload);
  }

  async updateSprint(
    sprintId: number,
    params: {
      name?: string;
      goal?: string;
      startDate?: string;
      endDate?: string;
      completeDate?: string;
      state?: "future" | "active" | "closed";
    },
  ): Promise<JiraSprint> {
    const endpoint = `/rest/agile/1.0/sprint/${sprintId}`;
    const response = await this.request<JiraSprint>(endpoint, "PUT", params);
    await this.writeLog(
      `jira-sprint-${sprintId}-update-${new Date().toISOString()}.json`,
      response,
    );
    return response;
  }

  async getSprintIssues(
    boardId: number,
    sprintId: number,
    params?: {
      jql?: string;
      maxResults?: number;
      startAt?: number;
      fields?: string[];
      expand?: string[];
    },
  ): Promise<JiraSearchResponse> {
    const queryParams = new URLSearchParams();
    if (params?.maxResults) {
      queryParams.append("maxResults", String(params.maxResults));
    }
    if (params?.startAt) {
      queryParams.append("startAt", String(params.startAt));
    }
    if (params?.jql) {
      queryParams.append("jql", params.jql);
    }
    if (params?.fields) {
      params.fields.forEach((field) => {
        queryParams.append("fields", field);
      });
    }
    if (params?.expand) {
      params.expand.forEach((exp) => {
        queryParams.append("expand", exp);
      });
    }

    const endpoint = `/rest/agile/1.0/board/${boardId}/sprint/${sprintId}/issue?${queryParams.toString()}`;
    const response = await this.request<JiraSearchResponse>(endpoint);
    await this.writeLog(
      `jira-sprint-${sprintId}-issues-${new Date().toISOString()}.json`,
      response,
    );
    return response;
  }

  async getBoardBacklog(
    boardId: number,
    params?: {
      jql?: string;
      maxResults?: number;
      startAt?: number;
      fields?: string[];
      expand?: string[];
    },
  ): Promise<JiraSearchResponse> {
    const queryParams = new URLSearchParams();
    if (params?.maxResults) {
      queryParams.append("maxResults", String(params.maxResults));
    }
    if (params?.startAt) {
      queryParams.append("startAt", String(params.startAt));
    }
    if (params?.jql) {
      queryParams.append("jql", params.jql);
    }
    if (params?.fields) {
      params.fields.forEach((field) => {
        queryParams.append("fields", field);
      });
    }
    if (params?.expand) {
      params.expand.forEach((exp) => {
        queryParams.append("expand", exp);
      });
    }

    const endpoint = `/rest/agile/1.0/board/${boardId}/backlog?${queryParams.toString()}`;
    const response = await this.request<JiraSearchResponse>(endpoint);
    await this.writeLog(`jira-board-${boardId}-backlog-${new Date().toISOString()}.json`, response);
    return response;
  }

  async moveIssuesToBoard(
    boardId: number,
    issues: string[],
    rankAfterIssue?: string,
    rankBeforeIssue?: string,
  ): Promise<void> {
    const endpoint = `/rest/agile/1.0/board/${boardId}/issue`;
    const payload: {
      issues: string[];
      rankAfterIssue?: string;
      rankBeforeIssue?: string;
    } = { issues };
    if (rankAfterIssue) {
      payload.rankAfterIssue = rankAfterIssue;
    }
    if (rankBeforeIssue) {
      payload.rankBeforeIssue = rankBeforeIssue;
    }
    await this.request<void>(endpoint, "POST", payload);
    await this.writeLog(`jira-board-${boardId}-move-issues.json`, {
      issues,
      payload,
    });
  }

  async getBoardConfiguration(boardId: number): Promise<JiraBoardConfiguration> {
    const endpoint = `/rest/agile/1.0/board/${boardId}/configuration`;
    const response = await this.request<JiraBoardConfiguration>(endpoint);
    await this.writeLog(`jira-board-${boardId}-config.json`, response);
    return response;
  }
}

type JiraErrorBody = {
  errorMessages?: unknown;
  errors?: unknown;
  message?: unknown;
};

function formatJiraErrorMessage(errorBody: unknown, statusText: string): string {
  const parsed = isJiraErrorBody(errorBody) ? errorBody : undefined;

  const topLevelMessages = Array.isArray(parsed?.errorMessages)
    ? parsed.errorMessages.filter(isNonEmptyString)
    : [];

  const fieldMessages = isStringRecord(parsed?.errors)
    ? Object.entries(parsed.errors)
        .filter(([, message]) => isNonEmptyString(message))
        .map(([field, message]) => `${field}: ${message}`)
    : [];

  if (topLevelMessages.length > 0 || fieldMessages.length > 0) {
    return [...topLevelMessages, ...fieldMessages].join(" | ");
  }

  if (isNonEmptyString(parsed?.message)) {
    return parsed.message;
  }

  if (isNonEmptyString(errorBody)) {
    return errorBody;
  }

  return statusText || "Unknown error";
}

function isJiraErrorBody(value: unknown): value is JiraErrorBody {
  return !!value && typeof value === "object";
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object") {
    return false;
  }

  return Object.values(value).every((recordValue) => typeof recordValue === "string");
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function toBase64(value: string): string {
  if (typeof btoa === "function") {
    return btoa(value);
  }

  return Buffer.from(value, "utf8").toString("base64");
}

function isJiraError(value: unknown): value is JiraError {
  if (!value || typeof value !== "object") {
    return false;
  }

  const maybeError = value as { status?: unknown; err?: unknown };
  return typeof maybeError.status === "number" && typeof maybeError.err === "string";
}
