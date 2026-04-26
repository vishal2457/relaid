import type { Octokit } from "@octokit/rest";

export async function getClient(token: string): Promise<Octokit> {
  const { Octokit } = await import("@octokit/rest");
  return new Octokit({ auth: token });
}

export async function getUserRepos(token: string) {
  const octokit = await getClient(token);
  const { data } = await octokit.repos.listForAuthenticatedUser({
    sort: "updated",
    per_page: 50,
  });
  return data;
}

export async function getRepoPRs(
  token: string,
  owner: string,
  repo: string,
  state: "open" | "closed" | "all" = "open",
) {
  const octokit = await getClient(token);
  const { data } = await octokit.pulls.list({ owner, repo, state });
  return data;
}

export async function getPRDetails(
  token: string,
  owner: string,
  repo: string,
  pull_number: number,
) {
  const octokit = await getClient(token);
  const { data } = await octokit.pulls.get({ owner, repo, pull_number });
  return data;
}

export async function getPRDiff(
  token: string,
  owner: string,
  repo: string,
  pull_number: number,
) {
  const octokit = await getClient(token);
  const { data } = await octokit.pulls.get({
    owner,
    repo,
    pull_number,
    mediaType: { format: "diff" },
  });
  return data;
}

export async function submitPRReview(
  token: string,
  owner: string,
  repo: string,
  pull_number: number,
  body: string,
  event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT",
) {
  const octokit = await getClient(token);
  const { data } = await octokit.pulls.createReview({
    owner,
    repo,
    pull_number,
    body,
    event,
  });
  return data;
}

export async function getAuthenticatedUser(token: string) {
  const octokit = await getClient(token);
  const { data } = await octokit.users.getAuthenticated();
  return data;
}
