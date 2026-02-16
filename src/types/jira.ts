export interface JiraError {
  status: number;
  err: string;
}

export interface JiraUser {
  accountId: string;
  accountType: string;
  displayName: string;
  emailAddress: string;
  active: boolean;
  self: string;
}

export interface JiraUserSearchResponse extends Array<JiraUser> {}

export interface JiraIssue {
  id: string;
  key: string;
  self: string;
  fields: {
    summary: string;
    description?: string;
    status: {
      name: string;
      statusCategory: {
        name: string;
      };
    };
    issuetype: {
      name: string;
      iconUrl: string;
    };
    priority?: {
      name: string;
      iconUrl: string;
    };
    assignee?: {
      displayName: string;
      emailAddress: string;
      accountId: string;
    };
    reporter?: {
      displayName: string;
      emailAddress: string;
      accountId: string;
    };
    created: string;
    updated: string;
    project: {
      key: string;
      name: string;
    };
    labels?: string[];
    components?: Array<{
      name: string;
    }>;
    fixVersions?: Array<{
      name: string;
    }>;
    duedate?: string;
  };
}

export interface JiraBoardIssue {
  id: string;
  key: string;
  self: string;
  fields: {
    summary: string;
    description?: string;
    status: {
      name: string;
      statusCategory: {
        name: string;
      };
    };
    issuetype: {
      name: string;
      iconUrl: string;
    };
    priority?: {
      name: string;
      iconUrl: string;
    };
    assignee?: {
      displayName: string;
      emailAddress: string;
      accountId: string;
    };
    reporter?: {
      displayName: string;
      emailAddress: string;
      accountId: string;
    };
    created: string;
    updated: string;
    project: {
      key: string;
      name: string;
    };
    labels?: string[];
    components?: Array<{
      name: string;
    }>;
    fixVersions?: Array<{
      name: string;
    }>;
    duedate?: string;
    flagged?: boolean;
    sprint?: {
      id: number;
      self: string;
      state: "future" | "active" | "closed";
      name: string;
      startDate?: string;
      endDate?: string;
      completeDate?: string;
      originBoardId: number;
      goal?: string;
    };
    closedSprints?: Array<{
      id: number;
      self: string;
      state: "future" | "active" | "closed";
      name: string;
      startDate?: string;
      endDate?: string;
      completeDate?: string;
      originBoardId: number;
      goal?: string;
    }>;
    epic?: {
      id: number;
      self: string;
      name: string;
      summary: string;
      color: {
        key: string;
      };
      done: boolean;
    };
  };
}

export type JiraADFMark =
  | { type: "strong" }
  | { type: "em" }
  | { type: "code" }
  | { type: "link"; attrs: { href: string } };

export interface JiraADFTextNode {
  type: "text";
  text: string;
  marks?: JiraADFMark[];
}

export interface JiraADFHardBreakNode {
  type: "hardBreak";
}

export type JiraADFInlineNode = JiraADFTextNode | JiraADFHardBreakNode;

export interface JiraADFParagraphNode {
  type: "paragraph";
  content: JiraADFInlineNode[];
}

export interface JiraADFHeadingNode {
  type: "heading";
  attrs: {
    level: 1 | 2 | 3 | 4 | 5 | 6;
  };
  content: JiraADFInlineNode[];
}

export interface JiraADFListItemNode {
  type: "listItem";
  content: JiraADFParagraphNode[];
}

export interface JiraADFBulletListNode {
  type: "bulletList";
  content: JiraADFListItemNode[];
}

export interface JiraADFOrderedListNode {
  type: "orderedList";
  attrs?: {
    order?: number;
  };
  content: JiraADFListItemNode[];
}

export type JiraADFBlockNode =
  | JiraADFParagraphNode
  | JiraADFHeadingNode
  | JiraADFBulletListNode
  | JiraADFOrderedListNode;

export interface JiraADFDocument {
  type: "doc";
  version: 1;
  content: JiraADFBlockNode[];
}

export interface JiraComment {
  id: string;
  body: JiraADFDocument;
  self: string;
  created: string;
  updated: string;
  author: {
    accountId: string;
    displayName: string;
  };
  updateAuthor?: {
    accountId: string;
    displayName: string;
  };
}

export interface JiraSearchParams {
  jql: string;
  maxResults?: number;
  fields?: string[];
  expand?: string[];
  fieldsByKeys?: boolean;
  nextPageToken?: string;
  properties?: string[];
  reconcileIssues?: number[];
}

export interface JiraSearchResponse {
  issues: JiraIssue[];
  startAt?: number;
  maxResults?: number;
  total?: number;
  isLast?: boolean;
  nextPageToken?: string;
  warningMessages?: string[];
}

export interface JiraTransition {
  id: string;
  name: string;
  to: {
    id: string;
    name: string;
    statusCategory: {
      key: string;
      name: string;
    };
  };
}

export interface JiraTransitionsResponse {
  transitions: JiraTransition[];
}

export interface JiraUser {
  accountId: string;
  displayName: string;
  emailAddress: string;
}

export interface JiraProject {
  id: string;
  key: string;
  name: string;
  description?: string;
  lead: JiraUser;
}

export interface JiraProjectListResponse {
  projects: JiraProject[];
}

export interface JiraIssueTypeResponse {
  issueTypes: Array<{
    id: string;
    name: string;
    description: string;
    iconUrl: string;
  }>;
}

export interface JiraCreateIssueResponse {
  id: string;
  key: string;
  self: string;
}

export interface JiraIssueLinkType {
  id: string;
  name: string;
  inward: string;
  outward: string;
  self: string;
}

export interface JiraIssueLinkTypesResponse {
  issueLinkTypes: JiraIssueLinkType[];
}

export interface JiraIssueLinkRequest {
  type: {
    name: string;
  };
  inwardIssue: {
    key: string;
  };
  outwardIssue: {
    key: string;
  };
  comment?: {
    body: JiraADFDocument;
  };
}

export interface JiraBoard {
  id: number;
  self: string;
  name: string;
  type: "scrum" | "kanban";
  location?: {
    type: "project" | "user";
    projectId?: number;
    projectKey?: string;
    projectName?: string;
    userAccountId?: string;
  };
}

export interface JiraBoardsResponse {
  isLast?: boolean;
  maxResults: number;
  startAt: number;
  total: number;
  values: JiraBoard[];
}

export interface JiraBoardLocation {
  type: "project" | "user";
  projectId?: number;
  projectKey?: string;
  projectName?: string;
  userAccountId?: string;
}

export interface JiraBoardDetails {
  id: number;
  self: string;
  name: string;
  type: "scrum" | "kanban";
  location: JiraBoardLocation;
}

export interface JiraSprint {
  id: number;
  self: string;
  state: "future" | "active" | "closed";
  name: string;
  startDate?: string;
  endDate?: string;
  completeDate?: string;
  originBoardId: number;
  goal?: string;
}

export interface JiraSprintsResponse {
  isLast?: boolean;
  maxResults: number;
  startAt: number;
  total: number;
  values: JiraSprint[];
}

export interface JiraBoardFilter {
  id: number;
  self: string;
}

export interface JiraBoardColumn {
  name: string;
  statuses: Array<{
    id: string;
    self: string;
  }>;
  min?: number;
  max?: number;
}

export interface JiraBoardConfiguration {
  id: number;
  self: string;
  name: string;
  filter: JiraBoardFilter;
  location: JiraBoardLocation;
  columnConfig: {
    columns: JiraBoardColumn[];
    constraintType: "none" | "issueCount" | "issueCountExclSubs";
  };
  estimation?: {
    type: "none" | "issueCount" | "field";
    field?: {
      fieldId: string;
      displayName: string;
    };
  };
  ranking?: {
    rankCustomFieldId: number;
  };
}
