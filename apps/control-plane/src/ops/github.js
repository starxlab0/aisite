const fs = require("fs");
const path = require("path");
const { createEvent, getRepoChange, listRepoChanges, transitionRepoChange, updateRepoChange } = require("./store");
const { evaluateActionPolicy, getAutoActionPolicy, matchesActionPolicy } = require("./auto-action-policy");
const { listRecommendations } = require("../signals/store");

function isActiveRepoChange(change) {
  return !["merged", "reverted", "cancelled"].includes(String(change?.status || ""));
}

function isRiskFollowupRepoChange(change) {
  return String(change?.kind || "") === "ai_concierge_strategy_followup";
}

function isRepoChangeMergeCandidate(change, metadata = {}) {
  const targetType = String(metadata.targetType || change?.targetType || "");
  if (!["product", "collection"].includes(targetType)) return false;
  if (!metadata.prUrl && !change?.prUrl) return false;
  if ((metadata.failedJobs ?? []).length > 0) return false;
  if ((metadata.workflowConclusion || change?.workflowConclusion) === "failure") return false;
  if ((metadata.ciStatus || change?.ciStatus) !== "success") return false;
  if (metadata.prMergedAt || change?.mergedAt) return false;
  if (change?.revertPrNumber || metadata.revertPrNumber) return false;
  return true;
}

function desiredAutoMergeLabels(change) {
  const labels = ["low-risk", "merge-candidate", "auto-merge-candidate"];
  if (String(change?.targetType || "") === "product" || String(change?.targetType || "") === "collection") {
    labels.push("seo-fix");
  }
  return labels;
}

function desiredRiskFollowupLabels(change) {
  const labels = ["risk-followup", "manual-review-only", "keep-draft"];
  if (String(change?.targetType || "") === "product" || String(change?.targetType || "") === "collection") {
    labels.push("seo-fix");
  }
  return labels;
}

function isRepoChangeAutoMergeCandidate(change, metadata = {}) {
  if (!isRepoChangeMergeCandidate(change, metadata)) return false;
  if ((metadata.prIsDraft ?? change?.prIsDraft) !== false) return false;
  return true;
}

function isRepoChangeAutoMergeExecutable(change, metadata = {}) {
  if (!isRepoChangeAutoMergeCandidate(change, metadata)) return false;
  if (isRiskFollowupRepoChange(change)) return false;
  const labels = metadata.prLabels ?? change?.prLabels ?? [];
  if (!Array.isArray(labels) || !labels.includes("auto-merge-candidate")) return false;
  const policy = getAutoActionPolicy();
  return matchesActionPolicy(policy.autoMerge, change);
}

function buildAutoActionGate(change, metadata = {}) {
  const policy = getAutoActionPolicy();
  const labels = metadata.prLabels ?? change?.prLabels ?? [];
  const autoMergePolicy = evaluateActionPolicy(policy.autoMerge, change);
  const autoRevertPolicy = evaluateActionPolicy(policy.autoRevert, change);

  const autoMergeReasons = [];
  if (isRiskFollowupRepoChange(change)) autoMergeReasons.push("risk follow-up must stay in draft manual review");
  if (autoMergePolicy.allowed) autoMergeReasons.push("policy matched");
  else autoMergeReasons.push(...autoMergePolicy.reasons);
  if ((metadata.prIsDraft ?? change?.prIsDraft) !== false) autoMergeReasons.push("pr still draft");
  if (!Array.isArray(labels) || !labels.includes("auto-merge-candidate")) autoMergeReasons.push("missing auto-merge-candidate label");
  if ((metadata.ciStatus || change?.ciStatus) !== "success") autoMergeReasons.push("ci not successful");
  if ((metadata.failedJobs ?? change?.failedJobs ?? []).length > 0) autoMergeReasons.push("failed jobs present");

  const autoRevertReasons = [];
  if (autoRevertPolicy.allowed) autoRevertReasons.push("policy matched");
  else autoRevertReasons.push(...autoRevertPolicy.reasons);
  const riskCount = Math.max(0, Number(change?.postMergeRiskCount || 0));
  if (riskCount < Number(policy.autoRevert?.minRiskCount || 2)) {
    autoRevertReasons.push(`risk count ${riskCount}/${Number(policy.autoRevert?.minRiskCount || 2)}`);
  }
  if (change?.revertPrNumber || change?.revertPrUrl) autoRevertReasons.push("revert pr already exists");
  if (change?.revertedAt) autoRevertReasons.push("already reverted");

  const autoMergePolicyOk = !isRiskFollowupRepoChange(change) && autoMergePolicy.allowed;
  const autoMergeCiOk =
    (metadata.ciStatus || change?.ciStatus) === "success" && ((metadata.failedJobs ?? change?.failedJobs ?? []).length === 0);
  const autoMergeLabelsOk = Array.isArray(labels) && labels.includes("auto-merge-candidate");

  const autoRevertPolicyOk = autoRevertPolicy.allowed;
  const autoRevertRiskOk = riskCount >= Number(policy.autoRevert?.minRiskCount || 2);
  const autoRevertExecutionOk = !change?.revertPrNumber && !change?.revertPrUrl && !change?.revertedAt;

  return {
    autoMerge: {
      allowed:
        autoMergePolicyOk &&
        (metadata.prIsDraft ?? change?.prIsDraft) === false &&
        autoMergeLabelsOk &&
        autoMergeCiOk,
      reasons: Array.from(new Set(autoMergeReasons)),
      snapshot: {
        policy: {
          ok: autoMergePolicyOk,
          label: "policy",
          detail: autoMergePolicy.reasons.join(" · "),
        },
        ci: {
          ok: autoMergeCiOk,
          label: "ci",
          detail:
            (metadata.ciStatus || change?.ciStatus) === "success"
              ? ((metadata.failedJobs ?? change?.failedJobs ?? []).length === 0 ? "success" : "failed jobs present")
              : "ci not successful",
        },
        labels: {
          ok: autoMergeLabelsOk,
          label: "labels",
          detail: autoMergeLabelsOk ? "auto-merge-candidate ready" : "missing auto-merge-candidate label",
        },
      },
    },
    autoRevert: {
      allowed:
        autoRevertPolicyOk &&
        autoRevertRiskOk &&
        autoRevertExecutionOk,
      reasons: Array.from(new Set(autoRevertReasons)),
      snapshot: {
        policy: {
          ok: autoRevertPolicyOk,
          label: "policy",
          detail: autoRevertPolicy.reasons.join(" · "),
        },
        risk: {
          ok: autoRevertRiskOk,
          label: "risk",
          detail: `count ${riskCount}/${Number(policy.autoRevert?.minRiskCount || 2)}`,
        },
        execution: {
          ok: autoRevertExecutionOk,
          label: "revert",
          detail: change?.revertedAt ? "already reverted" : change?.revertPrNumber || change?.revertPrUrl ? "revert pr already exists" : "revert path open",
        },
      },
    },
  };
}

function sameGateState(a, b) {
  return JSON.stringify(a || null) === JSON.stringify(b || null);
}

function emitAutoActionGateEvents(previousGate, nextGate, change, actor) {
  if (!change?.targetType || !change?.targetId || !nextGate) return;
  const definitions = [
    {
      key: "autoMerge",
      allowAction: "auto_merge_gate_allow",
      holdAction: "auto_merge_gate_hold",
      label: "auto-merge",
    },
    {
      key: "autoRevert",
      allowAction: "auto_revert_gate_allow",
      holdAction: "auto_revert_gate_hold",
      label: "auto-revert",
    },
  ];

  definitions.forEach((item) => {
    if (sameGateState(previousGate?.[item.key], nextGate?.[item.key])) return;
    const gate = nextGate[item.key];
    if (!gate) return;
    createEvent({
      actor,
      action: gate.allowed ? item.allowAction : item.holdAction,
      target: { type: change.targetType, id: change.targetId },
      note: `${item.label} gate ${gate.allowed ? "allow" : "hold"} · ${gate.reasons.join(" · ")}`,
    });
  });
}

function buildRecommendedNextStep(change, metadata = {}, gate) {
  const prIsDraft = metadata.prIsDraft ?? change?.prIsDraft;
  const ciStatus = metadata.ciStatus || change?.ciStatus;
  const failedJobs = metadata.failedJobs ?? change?.failedJobs ?? [];
  const riskCount = Math.max(0, Number(change?.postMergeRiskCount || 0));
  const revertThreshold = Number(getAutoActionPolicy().autoRevert?.minRiskCount || 2);

  if (change?.status === "reverted") {
    return { code: "done_reverted", label: "reverted; monitor target stability", tone: "neutral" };
  }
  if (change?.status === "cancelled") {
    return { code: "done_cancelled", label: "cancelled; no further action", tone: "neutral" };
  }
  if (change?.status === "merged" && !change?.autoMergedAt) {
    return { code: "done_merged", label: "merged manually; monitor target stability", tone: "neutral" };
  }
  if (change?.status === "merged" && gate?.autoRevert?.allowed) {
    return { code: "auto_revert_ready", label: "ready to create revert pr", tone: "warning" };
  }
  if (change?.status === "revert_candidate") {
    if (change?.revertPrUrl || change?.revertPrNumber) {
      return { code: "revert_pr_open", label: "review revert pr", tone: "warning" };
    }
    if (gate?.autoRevert?.allowed) {
      return { code: "auto_revert_ready", label: "ready to create revert pr", tone: "warning" };
    }
    if (riskCount < revertThreshold) {
      return { code: "wait_risk_threshold", label: `risk threshold not reached (${riskCount}/${revertThreshold})`, tone: "hold" };
    }
    return { code: "blocked_revert_policy", label: "blocked by policy for auto-revert", tone: "hold" };
  }
  if (change?.revertPrUrl || change?.revertPrNumber) {
    return { code: "revert_pr_open", label: "review revert pr", tone: "warning" };
  }
  if (change?.status === "auto_merge_candidate") {
    if (gate?.autoMerge?.allowed) {
      return { code: "ready_auto_merge", label: "ready to auto-merge", tone: "ready" };
    }
    if (ciStatus !== "success" || failedJobs.length > 0) {
      return { code: "wait_ci", label: "wait for ci", tone: "hold" };
    }
    return { code: "blocked_auto_merge_policy", label: "blocked by policy for auto-merge", tone: "hold" };
  }
  if (change?.status === "merge_candidate") {
    if (isRiskFollowupRepoChange(change)) {
      return {
        code: "hold_risk_followup",
        label: prIsDraft === true ? "keep draft for manual risk review" : "manual risk review required",
        tone: "warning",
      };
    }
    if (prIsDraft === true) {
      return { code: "ready_for_review", label: "mark pr ready for review", tone: "ready" };
    }
    return { code: "wait_auto_merge_labeling", label: "wait for auto-merge candidate labeling", tone: "progress" };
  }
  if (change?.status === "ci_running") {
    return { code: "wait_ci", label: "wait for ci", tone: "progress" };
  }
  if (change?.status === "ci_failed") {
    return { code: "investigate_ci", label: "investigate ci failure", tone: "warning" };
  }
  if (change?.status === "ci_passed") {
    return { code: "wait_candidate_promotion", label: "wait for merge candidate promotion", tone: "progress" };
  }
  if (change?.status === "pr_opened") {
    return { code: "wait_ci_start", label: "wait for ci to start", tone: "progress" };
  }
  if (change?.status === "draft") {
    return { code: "open_pr", label: "open draft pr", tone: "progress" };
  }
  return { code: "monitor", label: "monitor and resync", tone: "neutral" };
}

function getPostMergeRisk(change) {
  if (!change?.targetType || !change?.targetId) return null;
  const activeRecommendations = listRecommendations({
    targetType: change.targetType,
    targetId: change.targetId,
    statuses: ["open", "in_progress"],
  });
  const critical = activeRecommendations.filter((item) => item.severity === "critical");
  if (!critical.length) return null;

  return {
    recommendationIds: critical.map((item) => item.id),
    reasons: critical.map((item) => item.reason).filter(Boolean),
    summary:
      critical[0]?.reason ||
      critical[0]?.headline ||
      critical[0]?.recommendation ||
      "Critical post-merge anomaly detected for this target.",
  };
}

function toBase64Utf8(text) {
  return Buffer.from(String(text), "utf8").toString("base64");
}

function fromBase64Utf8(text) {
  return Buffer.from(String(text || ""), "base64").toString("utf8");
}

function repoChangeManifestPath(change) {
  return `.ops/repo-changes/${change.id}.md`;
}

function repoChangeSeoOverridesPath() {
  return "apps/web/src/lib/seo/repo-change-overrides.json";
}

function repoChangeTargetRegistryPath() {
  return "apps/control-plane/src/data/bootstrap-content.js";
}

function repoChangePullRequestTitle(change) {
  if (change?.prDraft?.title) return change.prDraft.title;
  return change.title ? `Repo change: ${change.title}` : `Repo change ${change.id}`;
}

function repoChangePullRequestBody(change) {
  if (change?.prDraft?.body) return change.prDraft.body;
  return [
    `## Repo change`,
    "",
    `- id: \`${change.id}\``,
    change.proposalId ? `- proposal: \`${change.proposalId}\`` : null,
    change.targetType && change.targetId ? `- target: \`${change.targetType}:${change.targetId}\`` : null,
    change.trigger ? `- trigger: \`${change.trigger}\`` : null,
    "",
    `## Summary`,
    "",
    change.summary || "No summary provided.",
    "",
    `## Notes`,
    "",
    `This draft PR was generated by the repo publish control plane as a starting point for follow-up implementation.`,
  ]
    .filter(Boolean)
    .join("\n");
}

function repoChangeRevertPullRequestTitle(change) {
  return change.title ? `Revert repo change: ${change.title}` : `Revert repo change ${change.id}`;
}

function repoChangeRevertPullRequestBody(change) {
  return [
    `## Revert repo change`,
    "",
    `- source repo change: \`${change.id}\``,
    change.prNumber ? `- source PR: #${change.prNumber}` : null,
    change.targetType && change.targetId ? `- target: \`${change.targetType}:${change.targetId}\`` : null,
    "",
    `## Reason`,
    "",
    `This draft PR removes the low-risk repo change patch generated earlier and restores the repository to a safer state for follow-up review.`,
  ]
    .filter(Boolean)
    .join("\n");
}

function repoChangeManifestContent(change) {
  const checklist =
    Array.isArray(change?.prDraft?.checklist) && change.prDraft.checklist.length > 0
      ? [
          "",
          `## Checklist`,
          "",
          ...change.prDraft.checklist.map((item) => `- [ ] ${item}`),
        ]
      : [];
  return [
    `# ${repoChangePullRequestTitle(change)}`,
    "",
    `- Repo change: \`${change.id}\``,
    change.proposalId ? `- Proposal: \`${change.proposalId}\`` : null,
    change.targetType && change.targetId ? `- Target: \`${change.targetType}:${change.targetId}\`` : null,
    change.trigger ? `- Trigger: \`${change.trigger}\`` : null,
    "",
    `## Summary`,
    "",
    change.summary || "No summary provided.",
    "",
    `## Prepared draft`,
    "",
    change.linkedDraftId ? `- Linked draft: \`${change.linkedDraftId}\`` : `- Linked draft: n/a`,
    change.linkedRecommendationId ? `- Recommendation: \`${change.linkedRecommendationId}\`` : `- Recommendation: n/a`,
    ...checklist,
  ]
    .filter(Boolean)
    .join("\n");
}

function repoChangeRevertManifestPath(change) {
  return `.ops/repo-changes/${change.id}.revert.md`;
}

function repoChangeRevertManifestContent(change) {
  return [
    `# ${repoChangeRevertPullRequestTitle(change)}`,
    "",
    `- Source repo change: \`${change.id}\``,
    change.prNumber ? `- Source PR: #${change.prNumber}` : null,
    change.targetType && change.targetId ? `- Target: \`${change.targetType}:${change.targetId}\`` : null,
    "",
    `## Reason`,
    "",
    `This revert draft was generated by the repo publish control plane to roll back the low-risk repo change patch for review.`,
  ]
    .filter(Boolean)
    .join("\n");
}

function titleizeSlug(slug) {
  return String(slug || "")
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function summarizeDescription(change) {
  const source = String(change.summary || "").trim();
  if (!source) return null;
  return source.length > 150 ? `${source.slice(0, 147).trim()}...` : source;
}

function anomalySeoCopy(change, readable) {
  const trigger = String(change?.trigger || "");
  if (!trigger) return null;

  const isProduct = change.targetType === "product";
  if (trigger === "blocked_publish") {
    return {
      title: isProduct ? `${readable} | Verified product details` : `${readable} | Verified collection overview`,
      description: isProduct
        ? `Updated ${readable} metadata after blocked publish verification to keep product details clear and review-ready.`
        : `Updated ${readable} collection metadata after blocked publish verification to keep navigation and page intent clear.`,
      canonical: isProduct ? `/product/${change.targetId}` : `/collection/${change.targetId}`,
      robots: {
        index: true,
        follow: true,
      },
    };
  }

  if (trigger === "auto_rollback") {
    return {
      title: isProduct ? `${readable} | Updated product guidance` : `${readable} | Updated collection guidance`,
      description: isProduct
        ? `Refined ${readable} metadata after an automatic rollback so product messaging is clearer before the next publish.`
        : `Refined ${readable} collection metadata after an automatic rollback so browsing context is clearer before the next publish.`,
    };
  }

  if (trigger === "warning_threshold") {
    return {
      description: isProduct
        ? `Adjusted ${readable} metadata after repeated verification warnings to improve clarity and reduce future publish risk.`
        : `Adjusted ${readable} collection metadata after repeated verification warnings to improve clarity and reduce future publish risk.`,
    };
  }

  return null;
}

function buildSeoOverrideEntry(change) {
  if (!change?.targetType || !change?.targetId) return null;
  if (change.targetType !== "product" && change.targetType !== "collection") return null;

  const readable = titleizeSlug(change.targetId);
  const anomalyCopy = anomalySeoCopy(change, readable);
  const defaultTitle =
    change.targetType === "product" ? `${readable} | Product details` : `${readable} | Collection overview`;
  const defaultDescription =
    summarizeDescription(change) ||
    (change.targetType === "product"
      ? `Learn more about ${readable}, including highlights, positioning, and support context.`
      : `Browse the ${readable} collection and supporting guides.`);

  return {
    [change.targetType]: {
      [change.targetId]: {
        ...(anomalyCopy
          ? {
              ...(anomalyCopy.title ? { title: anomalyCopy.title } : null),
              ...(anomalyCopy.description ? { description: anomalyCopy.description } : null),
              ...(anomalyCopy.canonical ? { canonical: anomalyCopy.canonical } : null),
              ...(anomalyCopy.robots ? { robots: anomalyCopy.robots } : null),
            }
          : {
              title: defaultTitle,
              description: defaultDescription,
            }),
        sourceRepoChangeId: change.id,
      },
    },
  };
}

function parseGitHubRepositoryFromUrl(url) {
  if (!url) return null;
  const match = String(url).trim().match(/github\.com[:/](.+?)\/(.+?)(?:\.git)?$/i);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

function readRepositoryFromGitConfig() {
  try {
    const gitConfigPath = path.resolve(__dirname, "../../../../.git/config");
    if (!fs.existsSync(gitConfigPath)) return null;
    const raw = fs.readFileSync(gitConfigPath, "utf8");
    const remoteSection = raw.match(/\[remote "origin"\]([\s\S]*?)(?:\n\[|$)/);
    const urlMatch = remoteSection?.[1]?.match(/url\s*=\s*(.+)/);
    return parseGitHubRepositoryFromUrl(urlMatch?.[1]?.trim());
  } catch {
    return null;
  }
}

function getGitHubRepoConfig() {
  const explicitOwner = process.env.REPO_PUBLISH_GITHUB_OWNER || "";
  const explicitRepo = process.env.REPO_PUBLISH_GITHUB_REPO || "";
  const explicitRepository = process.env.REPO_PUBLISH_GITHUB_REPOSITORY || process.env.GITHUB_REPOSITORY || "";
  const parsedRepository =
    explicitRepository && explicitRepository.includes("/")
      ? (() => {
          const [owner, repo] = explicitRepository.split("/");
          return { owner, repo };
        })()
      : null;
  const gitRepo = readRepositoryFromGitConfig();
  const owner = explicitOwner || parsedRepository?.owner || gitRepo?.owner || "";
  const repo = explicitRepo || parsedRepository?.repo || gitRepo?.repo || "";
  const token = process.env.REPO_PUBLISH_GITHUB_TOKEN || process.env.GITHUB_TOKEN || "";
  return {
    owner,
    repo,
    token,
    baseUrl: `https://github.com/${owner}/${repo}`,
    configured: Boolean(owner && repo),
    writeConfigured: Boolean(owner && repo && token),
  };
}

async function githubApi(pathname, config, init = {}) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "control-plane-repo-publish",
    ...(init.headers ?? {}),
  };
  if (config.token) {
    headers.Authorization = `Bearer ${config.token}`;
  }
  const response = await fetch(`https://api.github.com${pathname}`, {
    ...init,
    headers,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API ${response.status}: ${text.slice(0, 200)}`);
  }
  return response.json();
}

function normalizeCiStatus(checkRuns = [], statuses = []) {
  const combined = [
    ...checkRuns.map((item) => ({
      name: item.name,
      status: item.status,
      conclusion: item.conclusion,
    })),
    ...statuses.map((item) => ({
      name: item.context,
      status: item.state === "pending" ? "queued" : "completed",
      conclusion:
        item.state === "success" ? "success" : item.state === "pending" ? null : item.state,
    })),
  ];

  const active = combined.filter((item) => item.status === "in_progress" || item.status === "queued");
  if (active.length) {
    return {
      ciStatus: active.some((item) => item.status === "in_progress") ? "in_progress" : "queued",
      ciConclusion: null,
      checks: combined,
    };
  }

  const failed = combined.filter((item) =>
    ["failure", "timed_out", "cancelled", "startup_failure", "action_required"].includes(String(item.conclusion)),
  );
  if (failed.length) {
    return {
      ciStatus: "failure",
      ciConclusion: failed[0].conclusion,
      checks: combined,
    };
  }

  const succeeded = combined.filter((item) => item.conclusion === "success");
  if (combined.length && succeeded.length === combined.length) {
    return {
      ciStatus: "success",
      ciConclusion: "success",
      checks: combined,
    };
  }

  return {
    ciStatus: combined.length ? "queued" : "not_started",
    ciConclusion: null,
    checks: combined,
  };
}

function normalizeWorkflowStatus(run, jobs = []) {
  if (!run) {
    return {
      workflowStatus: "not_started",
      workflowConclusion: null,
      failedJobs: [],
      jobs: [],
    };
  }

  const normalizedJobs = jobs.map((job) => ({
    name: job.name,
    status: job.status,
    conclusion: job.conclusion,
    htmlUrl: job.html_url ?? null,
    startedAt: job.started_at ?? null,
    completedAt: job.completed_at ?? null,
  }));

  const failedJobs = normalizedJobs.filter((job) =>
    ["failure", "timed_out", "cancelled", "startup_failure", "action_required"].includes(String(job.conclusion)),
  );

  return {
    workflowStatus: run.status ?? "unknown",
    workflowConclusion: run.conclusion ?? null,
    failedJobs,
    jobs: normalizedJobs,
  };
}

async function fetchWorkflowRunMetadata(config, commitSha) {
  if (!commitSha) {
    return {
      workflowRunId: null,
      workflowRunUrl: null,
      workflowName: null,
      workflowStatus: "not_started",
      workflowConclusion: null,
      workflowUpdatedAt: null,
      failedJobs: [],
      workflowJobs: [],
    };
  }

  const runsResponse = await githubApi(
    `/repos/${config.owner}/${config.repo}/actions/runs?head_sha=${encodeURIComponent(commitSha)}&per_page=10`,
    config,
  ).catch(() => ({ workflow_runs: [] }));

  const run = Array.isArray(runsResponse?.workflow_runs)
    ? runsResponse.workflow_runs.find((item) => item.head_sha === commitSha) ?? runsResponse.workflow_runs[0] ?? null
    : null;

  if (!run) {
    return {
      workflowRunId: null,
      workflowRunUrl: null,
      workflowName: null,
      workflowStatus: "not_started",
      workflowConclusion: null,
      workflowUpdatedAt: null,
      failedJobs: [],
      workflowJobs: [],
    };
  }

  const jobsResponse = await githubApi(`/repos/${config.owner}/${config.repo}/actions/runs/${run.id}/jobs?per_page=100`, config).catch(
    () => ({ jobs: [] }),
  );
  const workflow = normalizeWorkflowStatus(run, jobsResponse?.jobs ?? []);

  return {
    workflowRunId: run.id ?? null,
    workflowRunUrl: run.html_url ?? null,
    workflowName: run.name ?? null,
    workflowStatus: workflow.workflowStatus,
    workflowConclusion: workflow.workflowConclusion,
    workflowUpdatedAt: run.updated_at ?? run.run_started_at ?? null,
    failedJobs: workflow.failedJobs,
    workflowJobs: workflow.jobs,
  };
}

async function getRepositoryInfo(config) {
  return githubApi(`/repos/${config.owner}/${config.repo}`, config);
}

async function getPullRequestByNumber(config, number) {
  if (!number) return null;
  return githubApi(`/repos/${config.owner}/${config.repo}/pulls/${number}`, config).catch(() => null);
}

async function getBranchRef(config, branchName) {
  return githubApi(`/repos/${config.owner}/${config.repo}/git/ref/heads/${encodeURIComponent(branchName)}`, config);
}

async function ensureBranchExists(config, branchName, baseSha) {
  try {
    return await getBranchRef(config, branchName);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message.includes("404")) throw error;
  }

  return githubApi(`/repos/${config.owner}/${config.repo}/git/refs`, config, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ref: `refs/heads/${branchName}`,
      sha: baseSha,
    }),
  });
}

async function getContents(config, filePath, ref) {
  try {
    return await githubApi(
      `/repos/${config.owner}/${config.repo}/contents/${filePath}?ref=${encodeURIComponent(ref)}`,
      config,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("404")) return null;
    throw error;
  }
}

function parseJsonFileContent(record, fallback) {
  if (!record?.content) return fallback;
  try {
    return JSON.parse(fromBase64Utf8(String(record.content).replace(/\n/g, "")));
  } catch {
    return fallback;
  }
}

function removeSeoOverrideEntry(current, change) {
  const next = {
    product: { ...(current?.product ?? {}) },
    collection: { ...(current?.collection ?? {}) },
  };
  if (!change?.targetType || !change?.targetId) return next;
  if (change.targetType !== "product" && change.targetType !== "collection") return next;
  delete next[change.targetType][change.targetId];
  return next;
}

async function upsertRepoChangeManifest(config, change, branchName) {
  const filePath = repoChangeManifestPath(change);
  const existing = await getContents(config, filePath, branchName);
  return githubApi(`/repos/${config.owner}/${config.repo}/contents/${filePath}`, config, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      message: `chore(repo-change): seed ${change.id}`,
      content: toBase64Utf8(repoChangeManifestContent(change)),
      branch: branchName,
      sha: existing?.sha ?? undefined,
    }),
  });
}

async function upsertRepoChangeSeoOverrides(config, change, branchName) {
  const patch = buildSeoOverrideEntry(change);
  if (!patch) return null;

  const filePath = repoChangeSeoOverridesPath();
  const existing = await getContents(config, filePath, branchName);
  const current = parseJsonFileContent(existing, { product: {}, collection: {} });
  const next = {
    product: {
      ...(current.product ?? {}),
      ...(patch.product ?? {}),
    },
    collection: {
      ...(current.collection ?? {}),
      ...(patch.collection ?? {}),
    },
  };

  return githubApi(`/repos/${config.owner}/${config.repo}/contents/${filePath}`, config, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      message: `chore(repo-change): seo override ${change.id}`,
      content: toBase64Utf8(JSON.stringify(next, null, 2)),
      branch: branchName,
      sha: existing?.sha ?? undefined,
    }),
  });
}

function buildTargetRegistryEntry(change) {
  const target = change?.registryTarget;
  if (!target || !target.targetType || !target.targetId || !target.targetPath) return null;
  const type = String(target.targetType);
  const id = String(target.targetId);
  const key = `${type}:${id}`;
  const title = String(target.title || id);
  const path = String(target.targetPath);

  if (type === "product") {
    return {
      objectName: "productTargets",
      key,
      content: [
        `  "${key}": {`,
        `    targetType: "product",`,
        `    targetId: "${id}",`,
        `    title: "${title}",`,
        `    targetPath: "${path}",`,
        `    currentTitle: "${title}",`,
        `    currentSubtitle: "",`,
        `    currentShortDescription: "",`,
        `    currentKeyBenefits: [],`,
        `    publishedVersionRef: null,`,
        `    versionHistory: [],`,
        `  },`,
      ].join("\n"),
    };
  }

  if (type === "collection") {
    return {
      objectName: "collectionTargets",
      key,
      content: [
        `  "${key}": {`,
        `    targetType: "collection",`,
        `    targetId: "${id}",`,
        `    title: "${title}",`,
        `    targetPath: "${path}",`,
        `    currentHeroTitle: "${title}",`,
        `    currentHeroSummary: "",`,
        `    currentModules: ["hero"],`,
        `    existingAngles: [],`,
        `    publishedVersionRef: null,`,
        `    versionHistory: [],`,
        `  },`,
      ].join("\n"),
    };
  }

  if (type === "guide") {
    return {
      objectName: "guideTargets",
      key,
      content: [
        `  "${key}": {`,
        `    targetType: "guide",`,
        `    targetId: "${id}",`,
        `    title: "${title}",`,
        `    targetPath: "${path}",`,
        `    currentTitle: "${title}",`,
        `    currentExcerpt: "",`,
        `    publishedVersionRef: null,`,
        `    versionHistory: [],`,
        `  },`,
      ].join("\n"),
    };
  }

  return null;
}

function insertEntryIntoNamedObject(source, objectName, entryLineBlock) {
  const marker = `const ${objectName} = {`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Cannot locate ${objectName} declaration`);
  const braceStart = source.indexOf("{", start);
  if (braceStart < 0) throw new Error(`Cannot locate ${objectName} opening brace`);

  let depth = 0;
  let inString = false;
  let stringChar = "";
  for (let i = braceStart; i < source.length; i += 1) {
    const ch = source[i];
    if (inString) {
      if (ch === "\\" && i + 1 < source.length) {
        i += 1;
        continue;
      }
      if (ch === stringChar) {
        inString = false;
        stringChar = "";
      }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inString = true;
      stringChar = ch;
      continue;
    }
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        const before = source.slice(0, i);
        const after = source.slice(i);
        const insertion = before.endsWith("\n") ? entryLineBlock : `\n${entryLineBlock}`;
        return `${before}${insertion}\n${after}`;
      }
    }
  }
  throw new Error(`Cannot locate ${objectName} closing brace`);
}

async function upsertRepoChangeTargetRegistry(config, change, branchName) {
  const entry = buildTargetRegistryEntry(change);
  if (!entry) return null;

  const filePath = repoChangeTargetRegistryPath();
  const existing = await getContents(config, filePath, branchName);
  const currentText = fromBase64Utf8(existing?.content || "");
  if (currentText.includes(`"${entry.key}":`)) return null;
  const nextText = insertEntryIntoNamedObject(currentText, entry.objectName, entry.content);

  return githubApi(`/repos/${config.owner}/${config.repo}/contents/${filePath}`, config, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      message: `chore(seo): register ${entry.key}`,
      content: toBase64Utf8(nextText),
      branch: branchName,
      sha: existing?.sha ?? undefined,
    }),
  });
}

async function revertRepoChangeSeoOverrides(config, change, branchName) {
  const filePath = repoChangeSeoOverridesPath();
  const existing = await getContents(config, filePath, branchName);
  const current = parseJsonFileContent(existing, { product: {}, collection: {} });
  const next = removeSeoOverrideEntry(current, change);

  return githubApi(`/repos/${config.owner}/${config.repo}/contents/${filePath}`, config, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      message: `revert(repo-change): seo override ${change.id}`,
      content: toBase64Utf8(JSON.stringify(next, null, 2)),
      branch: branchName,
      sha: existing?.sha ?? undefined,
    }),
  });
}

async function openDraftPullRequest(config, change, branchName, baseBranch) {
  return githubApi(`/repos/${config.owner}/${config.repo}/pulls`, config, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: repoChangePullRequestTitle(change),
      head: branchName,
      base: baseBranch,
      body: repoChangePullRequestBody(change),
      draft: true,
    }),
  });
}

async function openDraftRevertPullRequest(config, change, branchName, baseBranch) {
  return githubApi(`/repos/${config.owner}/${config.repo}/pulls`, config, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: repoChangeRevertPullRequestTitle(change),
      head: branchName,
      base: baseBranch,
      body: repoChangeRevertPullRequestBody(change),
      draft: true,
    }),
  });
}

async function markPullRequestReadyForReview(config, prNumber) {
  return githubApi(`/repos/${config.owner}/${config.repo}/pulls/${prNumber}/ready_for_review`, config, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
}

async function addPullRequestLabels(config, prNumber, labels) {
  return githubApi(`/repos/${config.owner}/${config.repo}/issues/${prNumber}/labels`, config, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ labels }),
  });
}

async function maybeApplyRiskFollowupLabels(change, metadata, config, actor) {
  if (!config.writeConfigured) return change;
  if (!isRiskFollowupRepoChange(change)) return change;
  if (!metadata?.prNumber) return change;
  const desired = desiredRiskFollowupLabels(change);
  const existing = Array.isArray(metadata.prLabels ?? change?.prLabels) ? metadata.prLabels ?? change?.prLabels : [];
  const missing = desired.filter((label) => !existing.includes(label));
  if (!missing.length) return updateRepoChange(change.id, { ...metadata, prLabels: existing }) ?? change;

  try {
    const response = await addPullRequestLabels(config, metadata.prNumber, missing);
    const appliedLabels = Array.isArray(response)
      ? Array.from(new Set([...existing, ...response.map((item) => item?.name).filter(Boolean)]))
      : Array.from(new Set([...existing, ...desired]));
    const updated =
      updateRepoChange(change.id, {
        ...metadata,
        prLabels: appliedLabels,
        lastSyncedAt: new Date().toISOString(),
        syncState: "ok",
        syncMessage: "Risk follow-up labels applied; PR remains draft for manual review.",
      }) ?? change;
    createEvent({
      actor,
      action: "repo_change_risk_followup_labeled",
      target: change.targetType && change.targetId ? { type: change.targetType, id: change.targetId } : undefined,
      note: `repo change ${change.id} labeled PR #${metadata.prNumber} as risk follow-up`,
    });
    return updated;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to label risk follow-up PR";
    return (
      updateRepoChange(change.id, {
        ...metadata,
        lastSyncedAt: new Date().toISOString(),
        syncState: "error",
        syncMessage: message,
      }) ?? change
    );
  }
}

async function mergePullRequest(config, prNumber, input = {}) {
  return githubApi(`/repos/${config.owner}/${config.repo}/pulls/${prNumber}/merge`, config, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      merge_method: input.mergeMethod || "squash",
      commit_title: input.commitTitle,
    }),
  });
}

async function fetchGitHubMetadataForRepoChange(change, config) {
  const head = `${config.owner}:${change.branchName}`;
  const pulls = await githubApi(`/repos/${config.owner}/${config.repo}/pulls?state=all&head=${encodeURIComponent(head)}`, config);
  const pr = Array.isArray(pulls) ? pulls[0] ?? null : null;

  let commitSha = pr?.head?.sha ?? change.commitSha ?? null;
  if (!commitSha && change.branchName) {
    try {
      const branch = await githubApi(`/repos/${config.owner}/${config.repo}/branches/${encodeURIComponent(change.branchName)}`, config);
      commitSha = branch?.commit?.sha ?? null;
    } catch {
      commitSha = null;
    }
  }

  let ci = { ciStatus: "not_started", ciConclusion: null, checks: [] };
  let workflow = {
    workflowRunId: null,
    workflowRunUrl: null,
    workflowName: null,
    workflowStatus: "not_started",
    workflowConclusion: null,
    workflowUpdatedAt: null,
    failedJobs: [],
    workflowJobs: [],
  };
  if (commitSha) {
    const [checkRunsResponse, statusResponse] = await Promise.all([
      githubApi(`/repos/${config.owner}/${config.repo}/commits/${commitSha}/check-runs?per_page=100`, config).catch(() => ({
        check_runs: [],
      })),
      githubApi(`/repos/${config.owner}/${config.repo}/commits/${commitSha}/status`, config).catch(() => ({
        statuses: [],
      })),
    ]);
    ci = normalizeCiStatus(checkRunsResponse?.check_runs ?? [], statusResponse?.statuses ?? []);
    workflow = await fetchWorkflowRunMetadata(config, commitSha);
    if (ci.ciStatus === "not_started" && workflow.workflowStatus !== "not_started") {
      ci = {
        ...ci,
        ciStatus:
          workflow.workflowConclusion === "success"
            ? "success"
            : workflow.workflowConclusion
              ? "failure"
              : workflow.workflowStatus === "in_progress"
                ? "in_progress"
                : "queued",
        ciConclusion: workflow.workflowConclusion,
      };
    }
  }

  const revertPr = change.revertPrNumber ? await getPullRequestByNumber(config, change.revertPrNumber) : null;

  return {
    repoOwner: config.owner,
    repoName: config.repo,
    repoUrl: config.baseUrl,
    prNumber: pr?.number ?? null,
    prUrl: pr?.html_url ?? null,
    prState: pr?.state ?? null,
    prIsDraft: typeof pr?.draft === "boolean" ? pr.draft : null,
    prLabels: Array.isArray(pr?.labels) ? pr.labels.map((item) => item?.name).filter(Boolean) : change.prLabels ?? [],
    prMergedAt: pr?.merged_at ?? null,
    commitSha,
    ciStatus: ci.ciStatus,
    ciConclusion: ci.ciConclusion,
    checks: ci.checks,
    workflowRunId: workflow.workflowRunId,
    workflowRunUrl: workflow.workflowRunUrl,
    workflowName: workflow.workflowName,
    workflowStatus: workflow.workflowStatus,
    workflowConclusion: workflow.workflowConclusion,
    workflowUpdatedAt: workflow.workflowUpdatedAt,
    failedJobs: workflow.failedJobs,
    workflowJobs: workflow.workflowJobs,
    revertPrNumber: revertPr?.number ?? change.revertPrNumber ?? null,
    revertPrUrl: revertPr?.html_url ?? change.revertPrUrl ?? null,
    revertPrState: revertPr?.state ?? change.revertPrState ?? null,
    revertPrMergedAt: revertPr?.merged_at ?? null,
  };
}

function applyDesiredRepoChangeStatus(change, metadata, actor) {
  let current = change;
  if (metadata.prUrl && current.status === "draft") {
    current = transitionRepoChange({
      id: current.id,
      actor,
      nextStatus: "pr_opened",
      note: "synced PR metadata from GitHub",
      patch: metadata,
    });
  }

  const desiredStatus =
    metadata.ciStatus === "success"
      ? "ci_passed"
      : metadata.ciStatus === "failure"
        ? "ci_failed"
        : metadata.ciStatus === "queued" || metadata.ciStatus === "in_progress"
          ? "ci_running"
          : null;

  if (
    desiredStatus &&
    current &&
    !current.message &&
    current.status !== desiredStatus &&
    !(current.status === "merge_candidate" && desiredStatus === "ci_passed") &&
    !(current.status === "auto_merge_candidate" && desiredStatus === "ci_passed")
  ) {
    const transitioned = transitionRepoChange({
      id: current.id,
      actor,
      nextStatus: desiredStatus,
      note: `synced CI status ${metadata.ciStatus}`,
      patch: metadata,
    });
    if (transitioned && !transitioned.message) {
      current = transitioned;
    }
  }

  if (
    current &&
    !current.message &&
    current.status === "ci_passed" &&
    isRepoChangeMergeCandidate(current, metadata)
  ) {
    const transitioned = transitionRepoChange({
      id: current.id,
      actor,
      nextStatus: "merge_candidate",
      note: "low-risk repo change is ready for review after successful CI",
      patch: {
        ...metadata,
        readyForReviewAt: new Date().toISOString(),
      },
    });
    if (transitioned && !transitioned.message) {
      current = transitioned;
    }
  }

  if (metadata.prMergedAt && current && !current.message && current.status !== "merged") {
    const transitioned = transitionRepoChange({
      id: current.id,
      actor,
      nextStatus: "merged",
      note: "synced merged PR state from GitHub",
      patch: {
        ...metadata,
        mergedAt: metadata.prMergedAt,
      },
    });
    if (transitioned && !transitioned.message) {
      current = transitioned;
    }
  }

  if (metadata.revertPrMergedAt && current && !current.message && current.status !== "reverted") {
    const transitioned = transitionRepoChange({
      id: current.id,
      actor,
      nextStatus: "reverted",
      note: "synced merged revert PR state from GitHub",
      patch: {
        ...metadata,
        revertedAt: metadata.revertPrMergedAt,
      },
    });
    if (transitioned && !transitioned.message) {
      current = transitioned;
    }
  }

  if (!current || current.message) return current;
  return updateRepoChange(current.id, metadata);
}

async function maybePromoteRepoChangeReadyForReview(change, metadata, config, actor) {
  if (!config.writeConfigured) return change;
  if (!change || change.status !== "merge_candidate") return change;
  if (isRiskFollowupRepoChange(change)) return change;
  if (!metadata.prNumber || metadata.prIsDraft !== true) return change;

  try {
    const pr = await markPullRequestReadyForReview(config, metadata.prNumber);
    const updated = updateRepoChange(change.id, {
      ...metadata,
      prState: pr?.state ?? metadata.prState ?? null,
      prIsDraft: typeof pr?.draft === "boolean" ? pr.draft : false,
      readyForReviewAt: new Date().toISOString(),
      lastSyncedAt: new Date().toISOString(),
      syncState: "ok",
      syncMessage: "Draft PR marked ready for review.",
    });

    createEvent({
      actor,
      action: "repo_change_ready_for_review",
      target: change.targetType && change.targetId ? { type: change.targetType, id: change.targetId } : undefined,
      note: `repo change ${change.id} marked PR #${metadata.prNumber} ready for review`,
    });

    return updated ?? change;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to mark draft PR ready for review";
    return (
      updateRepoChange(change.id, {
        ...metadata,
        lastSyncedAt: new Date().toISOString(),
        syncState: "error",
        syncMessage: message,
      }) ?? change
    );
  }
}

async function maybePromoteRepoChangeAutoMergeCandidate(change, metadata, config, actor) {
  if (!config.writeConfigured) return change;
  if (!change || change.status !== "merge_candidate") return change;
  if (isRiskFollowupRepoChange(change)) return change;
  if (!metadata.prNumber || !isRepoChangeAutoMergeCandidate(change, metadata)) return change;

  try {
    const labels = desiredAutoMergeLabels(change);
    const response = await addPullRequestLabels(config, metadata.prNumber, labels);
    const appliedLabels = Array.isArray(response) ? response.map((item) => item?.name).filter(Boolean) : labels;
    const transitioned = transitionRepoChange({
      id: change.id,
      actor,
      nextStatus: "auto_merge_candidate",
      note: "ready low-risk PR labeled for auto-merge review",
      patch: {
        ...metadata,
        prLabels: appliedLabels,
        autoMergeCandidateAt: new Date().toISOString(),
        lastSyncedAt: new Date().toISOString(),
        syncState: "ok",
        syncMessage: "PR labeled and promoted to auto-merge candidate.",
      },
    });

    createEvent({
      actor,
      action: "repo_change_auto_merge_candidate",
      target: change.targetType && change.targetId ? { type: change.targetType, id: change.targetId } : undefined,
      note: `repo change ${change.id} labeled PR #${metadata.prNumber} as auto-merge candidate`,
    });

    return transitioned && !transitioned.message ? transitioned : change;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to label PR for auto-merge candidate";
    return (
      updateRepoChange(change.id, {
        ...metadata,
        lastSyncedAt: new Date().toISOString(),
        syncState: "error",
        syncMessage: message,
      }) ?? change
    );
  }
}

async function maybeAutoMergeRepoChange(change, metadata, config, actor) {
  if (!config.writeConfigured) return change;
  if (!change || change.status !== "auto_merge_candidate") return change;
  if (!metadata.prNumber || !isRepoChangeAutoMergeExecutable(change, metadata)) return change;

  try {
    const mergeResult = await mergePullRequest(config, metadata.prNumber, {
      mergeMethod: "squash",
      commitTitle: change.title ? `Auto-merge: ${change.title}` : `Auto-merge repo change ${change.id}`,
    });
    if (!mergeResult?.merged) {
      return (
        updateRepoChange(change.id, {
          ...metadata,
          lastSyncedAt: new Date().toISOString(),
          syncState: "error",
          syncMessage: mergeResult?.message || "GitHub merge API did not merge the PR.",
        }) ?? change
      );
    }

    const transitioned = transitionRepoChange({
      id: change.id,
      actor,
      nextStatus: "merged",
      note: "auto-merged low-risk PR after candidate checks passed",
      patch: {
        ...metadata,
        mergedAt: new Date().toISOString(),
        autoMergedAt: new Date().toISOString(),
        mergeMethod: "squash",
        mergeCommitSha: mergeResult?.sha ?? null,
        prState: "closed",
        lastSyncedAt: new Date().toISOString(),
        syncState: "ok",
        syncMessage: "PR auto-merged after low-risk checks passed.",
      },
    });

    createEvent({
      actor,
      action: "repo_change_auto_merged",
      target: change.targetType && change.targetId ? { type: change.targetType, id: change.targetId } : undefined,
      note: `repo change ${change.id} auto-merged PR #${metadata.prNumber}`,
    });

    return transitioned && !transitioned.message ? transitioned : change;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to auto-merge PR";
    return (
      updateRepoChange(change.id, {
        ...metadata,
        lastSyncedAt: new Date().toISOString(),
        syncState: "error",
        syncMessage: message,
      }) ?? change
    );
  }
}

function maybePromoteRepoChangeRevertCandidate(change, actor) {
  if (!change || !["merged", "revert_candidate"].includes(change.status)) return change;
  if (!change.autoMergedAt) return change;
  if (change.revertPrNumber || change.revertedAt) return change;

  const risk = getPostMergeRisk(change);
  if (!risk) return change;

  const nextRiskCount = Math.max(0, Number(change.postMergeRiskCount || 0)) + 1;
  if (change.status === "merged") {
    const transitioned = transitionRepoChange({
      id: change.id,
      actor,
      nextStatus: "revert_candidate",
      note: "critical post-merge anomaly detected after auto-merge",
      patch: {
        postMergeRiskAt: new Date().toISOString(),
        postMergeRiskSummary: risk.summary,
        postMergeRecommendationIds: risk.recommendationIds,
        postMergeRiskCount: nextRiskCount,
      },
    });

    createEvent({
      actor,
      action: "repo_change_revert_candidate",
      target: change.targetType && change.targetId ? { type: change.targetType, id: change.targetId } : undefined,
      note: `repo change ${change.id} marked revert candidate after post-merge anomaly`,
    });

    return transitioned && !transitioned.message ? transitioned : change;
  }

  return (
    updateRepoChange(change.id, {
      postMergeRiskAt: new Date().toISOString(),
      postMergeRiskSummary: risk.summary,
      postMergeRecommendationIds: risk.recommendationIds,
      postMergeRiskCount: nextRiskCount,
      syncState: "ok",
      syncMessage: "Post-merge critical risk still active.",
    }) ?? change
  );
}

async function maybeAutoCreateRevertPullRequest(change, actor) {
  if (!change || change.status !== "revert_candidate") return change;
  if (change.revertPrUrl || change.revertPrNumber || change.revertedAt) return change;
  const policy = getAutoActionPolicy();
  if (!matchesActionPolicy(policy.autoRevert, change)) return change;
  if (Math.max(0, Number(change.postMergeRiskCount || 0)) < Number(policy.autoRevert?.minRiskCount || 2)) return change;

  const result = await createRepoChangeRevertPullRequest({ id: change.id, actor });
  return result?.repoChange ?? change;
}

async function syncRepoChangeFromGitHub({ id, actor = "system:github_sync" }) {
  const existing = getRepoChange(id);
  if (!existing) return null;

  const config = getGitHubRepoConfig();
  if (!config.configured) {
    const updated = updateRepoChange(id, {
      lastSyncedAt: new Date().toISOString(),
      syncState: "unconfigured",
      syncMessage: "GitHub repository is not configured for repo publish sync.",
    });
    return {
      repoChange: updated,
      sync: { status: "unconfigured", message: updated.syncMessage },
    };
  }

  try {
    const metadata = await fetchGitHubMetadataForRepoChange(existing, config);
    const gateFromExisting = buildAutoActionGate(existing, metadata);
    const transitioned = applyDesiredRepoChangeStatus(existing, {
      ...metadata,
      autoActionGate: gateFromExisting,
      lastSyncedAt: new Date().toISOString(),
      syncState: "ok",
      syncMessage: metadata.prUrl ? "GitHub metadata synced." : "No PR found for this branch yet.",
    }, actor);
    const labeled = await maybeApplyRiskFollowupLabels(
      transitioned && !transitioned.message ? transitioned : existing,
      metadata,
      config,
      actor,
    );
    const synced = await maybePromoteRepoChangeReadyForReview(
      labeled,
      metadata,
      config,
      actor,
    );
    const promoted = await maybePromoteRepoChangeAutoMergeCandidate(synced, metadata, config, actor);
    const merged =
      existing.status === "auto_merge_candidate"
        ? await maybeAutoMergeRepoChange(
            promoted,
            {
              ...metadata,
              prLabels: promoted?.prLabels ?? metadata.prLabels,
              prIsDraft: promoted?.prIsDraft ?? metadata.prIsDraft,
            },
            config,
            actor,
          )
        : promoted;
    const mergedWithGate = updateRepoChange(merged.id, { autoActionGate: buildAutoActionGate(merged, metadata) }) ?? merged;
    const verified = maybePromoteRepoChangeRevertCandidate(mergedWithGate, actor);
    const stabilizedRevert = existing.status === "revert_candidate" ? await maybeAutoCreateRevertPullRequest(verified, actor) : verified;
    const finalGate = buildAutoActionGate(stabilizedRevert, metadata);
    const nextStep = buildRecommendedNextStep(stabilizedRevert, metadata, finalGate);
    const finalized = updateRepoChange(stabilizedRevert.id, {
      autoActionGate: finalGate,
      recommendedNextStep: nextStep,
    }) ?? stabilizedRevert;
    emitAutoActionGateEvents(existing.autoActionGate, finalGate, finalized, actor);

    createEvent({
      actor,
      action: "repo_change_sync",
      target: existing.targetType && existing.targetId ? { type: existing.targetType, id: existing.targetId } : undefined,
      note: `repo change ${id} synced${metadata.prNumber ? ` · pr #${metadata.prNumber}` : ""}${metadata.ciStatus ? ` · ci ${metadata.ciStatus}` : ""}`,
    });

    return {
      repoChange: finalized,
      sync: {
        status: "ok",
        message: finalized?.syncMessage ?? "GitHub metadata synced.",
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "GitHub sync failed";
    const updated = updateRepoChange(id, {
      lastSyncedAt: new Date().toISOString(),
      syncState: "error",
      syncMessage: message,
    });
    return {
      repoChange: updated,
      sync: { status: "error", message },
    };
  }
}

async function syncActiveRepoChangesFromGitHub({ actor = "system:github_sync", limit = 5, targetType, targetId } = {}) {
  const candidates = listRepoChanges({ targetType, targetId })
    .filter(isActiveRepoChange)
    .slice(0, Math.max(1, Math.min(20, Number(limit) || 5)));

  const results = [];
  for (const change of candidates) {
    // sequential on purpose to keep API usage predictable
    const synced = await syncRepoChangeFromGitHub({ id: change.id, actor });
    if (synced) results.push(synced);
  }

  return {
    total: results.length,
    items: results,
  };
}

async function createRepoChangePullRequest({ id, actor = "system:repo_pr" }) {
  const change = getRepoChange(id);
  if (!change) return null;

  const config = getGitHubRepoConfig();
  if (!config.writeConfigured) {
    const updated = updateRepoChange(id, {
      lastSyncedAt: new Date().toISOString(),
      syncState: "unconfigured",
      syncMessage: "GitHub write token is not configured for PR creation.",
    });
    return {
      repoChange: updated,
      result: { status: "unconfigured", message: updated.syncMessage },
    };
  }

  try {
    const existingMetadata = await fetchGitHubMetadataForRepoChange(change, config);
    if (existingMetadata.prUrl) {
      const synced = applyDesiredRepoChangeStatus(change, {
        ...existingMetadata,
        lastSyncedAt: new Date().toISOString(),
        syncState: "ok",
        syncMessage: "Draft PR already exists.",
      }, actor);
      return {
        repoChange: synced,
        result: { status: "exists", message: "Draft PR already exists." },
      };
    }

    const repoInfo = await getRepositoryInfo(config);
    const defaultBranch = repoInfo.default_branch || "main";
    const baseRef = await getBranchRef(config, defaultBranch);
    const baseSha = baseRef?.object?.sha;
    if (!baseSha) {
      throw new Error(`Cannot resolve base branch sha for ${defaultBranch}`);
    }

    await ensureBranchExists(config, change.branchName, baseSha);
    const manifestCommitResult = await upsertRepoChangeManifest(config, change, change.branchName);
    const seoCommitResult = await upsertRepoChangeSeoOverrides(config, change, change.branchName);
    const registryCommitResult = await upsertRepoChangeTargetRegistry(config, change, change.branchName);
    const pr = await openDraftPullRequest(config, change, change.branchName, defaultBranch);
    const labeled = await maybeApplyRiskFollowupLabels(
      change,
      {
        prNumber: pr.number ?? null,
        prUrl: pr.html_url ?? null,
        prState: pr.state ?? null,
        prIsDraft: true,
        prLabels: [],
      },
      config,
      actor,
    );

    let next = change;
    if (change.status === "draft") {
      const transitioned = transitionRepoChange({
        id: change.id,
        actor,
        nextStatus: "pr_opened",
        note: "draft PR created from repo change",
        patch: {
          repoOwner: config.owner,
          repoName: config.repo,
          repoUrl: config.baseUrl,
          prNumber: pr.number ?? null,
          prUrl: pr.html_url ?? null,
          prState: pr.state ?? null,
          prLabels: labeled?.prLabels ?? [],
          commitSha:
            registryCommitResult?.commit?.sha ??
            seoCommitResult?.commit?.sha ??
            manifestCommitResult?.commit?.sha ??
            pr?.head?.sha ??
            null,
          lastSyncedAt: new Date().toISOString(),
          syncState: "ok",
          syncMessage: "Draft PR created from repo change.",
        },
      });
      if (transitioned && !transitioned.message) {
        next = transitioned;
      }
    }

    const updated = updateRepoChange(change.id, {
      repoOwner: config.owner,
      repoName: config.repo,
      repoUrl: config.baseUrl,
      prNumber: pr.number ?? null,
      prUrl: pr.html_url ?? null,
      prState: pr.state ?? null,
      prLabels: labeled?.prLabels ?? [],
      commitSha:
        registryCommitResult?.commit?.sha ??
        seoCommitResult?.commit?.sha ??
        manifestCommitResult?.commit?.sha ??
        pr?.head?.sha ??
        null,
      lastSyncedAt: new Date().toISOString(),
      syncState: "ok",
      syncMessage: "Draft PR created from repo change.",
    });

    createEvent({
      actor,
      action: "repo_change_open_pr",
      target: change.targetType && change.targetId ? { type: change.targetType, id: change.targetId } : undefined,
      note: `repo change ${id} opened draft PR #${pr.number}`,
    });

    return {
      repoChange: updated ?? next,
      result: { status: "created", message: "Draft PR created from repo change." },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create draft PR";
    const updated = updateRepoChange(id, {
      lastSyncedAt: new Date().toISOString(),
      syncState: "error",
      syncMessage: message,
    });
    return {
      repoChange: updated,
      result: { status: "error", message },
    };
  }
}

async function createRepoChangeRevertPullRequest({ id, actor = "system:repo_revert_pr" }) {
  const change = getRepoChange(id);
  if (!change) return null;

  const config = getGitHubRepoConfig();
  if (!config.writeConfigured) {
    const updated = updateRepoChange(id, {
      lastSyncedAt: new Date().toISOString(),
      syncState: "unconfigured",
      syncMessage: "GitHub write token is not configured for revert PR creation.",
    });
    return {
      repoChange: updated,
      result: { status: "unconfigured", message: updated.syncMessage },
    };
  }

  if (!["merged", "revert_candidate"].includes(change.status)) {
    return {
      repoChange: change,
      result: { status: "blocked", message: "Only merged or revert-candidate repo changes can open a revert PR." },
    };
  }

  if (change.revertPrUrl) {
    return {
      repoChange: change,
      result: { status: "exists", message: "Revert draft PR already exists." },
    };
  }

  try {
    const repoInfo = await getRepositoryInfo(config);
    const defaultBranch = repoInfo.default_branch || "main";
    const baseRef = await getBranchRef(config, defaultBranch);
    const baseSha = baseRef?.object?.sha;
    if (!baseSha) {
      throw new Error(`Cannot resolve base branch sha for ${defaultBranch}`);
    }

    const branchName = `ai/revert/${change.id}`;
    await ensureBranchExists(config, branchName, baseSha);
    const revertManifestExisting = await getContents(config, repoChangeRevertManifestPath(change), branchName);
    const revertManifestCommit = await githubApi(
      `/repos/${config.owner}/${config.repo}/contents/${repoChangeRevertManifestPath(change)}`,
      config,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: `revert(repo-change): seed ${change.id}`,
          content: toBase64Utf8(repoChangeRevertManifestContent(change)),
          branch: branchName,
          sha: revertManifestExisting?.sha ?? undefined,
        }),
      },
    );
    const revertSeoCommit = await revertRepoChangeSeoOverrides(config, change, branchName);
    const pr = await openDraftRevertPullRequest(config, change, branchName, defaultBranch);

    const updated = updateRepoChange(id, {
      revertBranchName: branchName,
      revertPrNumber: pr.number ?? null,
      revertPrUrl: pr.html_url ?? null,
      revertPrState: pr.state ?? null,
      revertCommitSha: revertSeoCommit?.commit?.sha ?? revertManifestCommit?.commit?.sha ?? pr?.head?.sha ?? null,
      lastSyncedAt: new Date().toISOString(),
      syncState: "ok",
      syncMessage: "Draft revert PR created from merged repo change.",
    });

    createEvent({
      actor,
      action: "repo_change_open_revert_pr",
      target: change.targetType && change.targetId ? { type: change.targetType, id: change.targetId } : undefined,
      note: `repo change ${id} opened revert draft PR #${pr.number}`,
    });

    return {
      repoChange: updated,
      result: { status: "created", message: "Draft revert PR created from merged repo change." },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create revert PR";
    const updated = updateRepoChange(id, {
      lastSyncedAt: new Date().toISOString(),
      syncState: "error",
      syncMessage: message,
    });
    return {
      repoChange: updated,
      result: { status: "error", message },
    };
  }
}

module.exports = {
  anomalySeoCopy,
  buildSeoOverrideEntry,
  createRepoChangePullRequest,
  createRepoChangeRevertPullRequest,
  getGitHubRepoConfig,
  isActiveRepoChange,
  isRepoChangeAutoMergeCandidate,
  isRepoChangeAutoMergeExecutable,
  isRepoChangeMergeCandidate,
  mergePullRequest,
  markPullRequestReadyForReview,
  syncRepoChangeFromGitHub,
  syncActiveRepoChangesFromGitHub,
  normalizeCiStatus,
};
