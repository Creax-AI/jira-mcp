import axios, { AxiosError } from "axios";
import {
  JiraADFDocument,
  JiraBoard,
  JiraBoardConfiguration,
  JiraBoardIssue,
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
} from "~/types/jira";
import fs from "fs";

export class JiraService {
  private readonly baseUrl: string;
  private readonly auth: {
    username: string;
    password: string;
  };

  constructor(baseUrl: string, username: string, apiToken: string) {
    // Ensure the base URL doesn't end with a trailing slash
    this.baseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    this.auth = {
      username,
      password: apiToken,
    };
  }

  private async request<T>(
    endpoint: string,
    method: "GET" | "POST" | "PUT" = "GET",
    data?: any,
  ): Promise<T> {
    try {
      console.log(`Calling ${this.baseUrl}${endpoint}`);

      const config = {
        method,
        url: `${this.baseUrl}${endpoint}`,
        auth: this.auth,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        data: method === "POST" || method === "PUT" ? data : undefined,
      };

      const response = await axios(config);
      return response.data;
    } catch (error) {
      if (error instanceof AxiosError && error.response) {
        throw {
          status: error.response.status,
          err:
            (error.response.data as { errorMessages?: string[] })
              ?.errorMessages?.[0] || "Unknown error",
        } as JiraError;
      }
      throw new Error(
        `Failed to make request to Jira API: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private createTextADF(text: string): JiraADFDocument {
    return {
      type: "doc",
      version: 1,
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text,
            },
          ],
        },
      ],
    };
  }

  /**
   * Get a Jira issue by key
   */
  async getIssue(issueKey: string): Promise<JiraIssue> {
    const endpoint = `/rest/api/3/issue/${issueKey}`;
    const response = await this.request<JiraIssue>(endpoint);
    writeLogs(`jira-issue-${issueKey}.json`, response);
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
    writeLogs(`jira-comment-${issueKey}-${response.id}.json`, response);
    return response;
  }

  /**
   * Search for Jira issues using the enhanced JQL endpoint
   */
  async searchIssues(params: JiraSearchParams): Promise<JiraSearchResponse> {
    const endpoint = `/rest/api/3/search/jql`;
    const response = await this.request<JiraSearchResponse>(
      endpoint,
      "POST",
      params,
    );
    writeLogs(`jira-search-${new Date().toISOString()}.json`, response);
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
      fields: [
        "summary",
        "description",
        "status",
        "issuetype",
        "priority",
        "assignee",
        "project",
      ],
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
      fields: [
        "summary",
        "description",
        "status",
        "issuetype",
        "priority",
        "assignee",
        "project",
      ],
    });
  }

  /**
   * Get epics from a project
   */
  async getEpics(
    projectKey?: string,
    maxResults: number = 50,
  ): Promise<JiraSearchResponse> {
    const jql = projectKey
      ? `project = ${projectKey} AND issuetype = Epic ORDER BY updated DESC`
      : `issuetype = Epic ORDER BY updated DESC`;

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
      ],
    });
  }

  /**
   * Get child issues of an epic
   */
  async getEpicChildren(
    epicKey: string,
    maxResults: number = 50,
  ): Promise<JiraSearchResponse> {
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
  async getIssueTransitions(
    issueKey: string,
  ): Promise<JiraTransitionsResponse> {
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

    const response = await this.request<JiraCreateIssueResponse>(
      endpoint,
      "POST",
      payload,
    );
    writeLogs(`jira-create-epic-${response.key}.json`, response);
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

    const response = await this.request<JiraCreateIssueResponse>(
      endpoint,
      "POST",
      payload,
    );
    writeLogs(`jira-create-issue-${response.key}.json`, response);
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
  async updateIssueDescription(
    issueKey: string,
    description: string,
  ): Promise<void> {
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
    writeLogs(`jira-boards-${new Date().toISOString()}.json`, response);
    return response;
  }

  async getBoard(boardId: number): Promise<JiraBoard> {
    const endpoint = `/rest/agile/1.0/board/${boardId}`;
    const response = await this.request<JiraBoard>(endpoint);
    writeLogs(`jira-board-${boardId}.json`, response);
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
      params.fields.forEach((field) => queryParams.append("fields", field));
    }
    if (params?.expand) {
      params.expand.forEach((exp) => queryParams.append("expand", exp));
    }

    const endpoint = `/rest/agile/1.0/board/${boardId}/issue?${queryParams.toString()}`;
    const response = await this.request<JiraSearchResponse>(endpoint);
    writeLogs(
      `jira-board-${boardId}-issues-${new Date().toISOString()}.json`,
      response,
    );
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
    writeLogs(`jira-board-${boardId}-sprints.json`, response);
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
    writeLogs(
      `jira-sprint-create-${params.originBoardId}-${new Date().toISOString()}.json`,
      response,
    );
    return response;
  }

  async getSprint(sprintId: number): Promise<JiraSprint> {
    const endpoint = `/rest/agile/1.0/sprint/${sprintId}`;
    const response = await this.request<JiraSprint>(endpoint);
    writeLogs(`jira-sprint-${sprintId}.json`, response);
    return response;
  }

  async addIssuesToSprint(sprintId: number, issues: string[]): Promise<void> {
    const endpoint = `/rest/agile/1.0/sprint/${sprintId}/issue`;
    const payload = { issues };
    await this.request<void>(endpoint, "POST", payload);
    writeLogs(`jira-sprint-${sprintId}-add-issues.json`, payload);
  }

  async removeIssuesFromSprint(issues: string[]): Promise<void> {
    const endpoint = `/rest/agile/1.0/backlog/issue`;
    const payload = { issues };
    await this.request<void>(endpoint, "POST", payload);
    writeLogs(`jira-backlog-move-${new Date().toISOString()}.json`, payload);
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
    writeLogs(
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
      params.fields.forEach((field) => queryParams.append("fields", field));
    }
    if (params?.expand) {
      params.expand.forEach((exp) => queryParams.append("expand", exp));
    }

    const endpoint = `/rest/agile/1.0/board/${boardId}/sprint/${sprintId}/issue?${queryParams.toString()}`;
    const response = await this.request<JiraSearchResponse>(endpoint);
    writeLogs(
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
      params.fields.forEach((field) => queryParams.append("fields", field));
    }
    if (params?.expand) {
      params.expand.forEach((exp) => queryParams.append("expand", exp));
    }

    const endpoint = `/rest/agile/1.0/board/${boardId}/backlog?${queryParams.toString()}`;
    const response = await this.request<JiraSearchResponse>(endpoint);
    writeLogs(
      `jira-board-${boardId}-backlog-${new Date().toISOString()}.json`,
      response,
    );
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
    writeLogs(`jira-board-${boardId}-move-issues.json`, { issues, payload });
  }

  async getBoardConfiguration(
    boardId: number,
  ): Promise<JiraBoardConfiguration> {
    const endpoint = `/rest/agile/1.0/board/${boardId}/configuration`;
    const response = await this.request<JiraBoardConfiguration>(endpoint);
    writeLogs(`jira-board-${boardId}-config.json`, response);
    return response;
  }
}

function writeLogs(name: string, value: any) {
  const logsDir = "logs";
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
  }
  fs.writeFileSync(`${logsDir}/${name}`, JSON.stringify(value, null, 2));
}
