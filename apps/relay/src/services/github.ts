import { Octokit } from "@octokit/rest";

export function getClient(token: string): Octokit {
  return new Octokit({ auth: token });
}

export async function getUserRepos(token: string) {
  const octokit = getClient(token);
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
  const octokit = getClient(token);
  const { data } = await octokit.pulls.list({ owner, repo, state });
  return data;
}

export async function getPRDetails(
  token: string,
  owner: string,
  repo: string,
  pull_number: number,
) {
  const octokit = getClient(token);
  const { data } = await octokit.pulls.get({ owner, repo, pull_number });
  return data;
}

export async function getPRDiff(
  token: string,
  owner: string,
  repo: string,
  pull_number: number,
) {
  const octokit = getClient(token);
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
  const octokit = getClient(token);
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
  const octokit = getClient(token);
  const { data } = await octokit.users.getAuthenticated();
  return data;
}
