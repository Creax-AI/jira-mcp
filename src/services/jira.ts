import axios, { AxiosError } from "axios";
import {
  JiraError,
  JiraIssue,
  JiraProject,
  JiraProjectListResponse,
  JiraSearchParams,
  JiraSearchResponse,
  JiraIssueTypeResponse,
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
    method: "GET" | "POST" = "GET",
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
        data: method === "POST" ? data : undefined,
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
}

function writeLogs(name: string, value: any) {
  const logsDir = "logs";
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
  }
  fs.writeFileSync(`${logsDir}/${name}`, JSON.stringify(value, null, 2));
}
