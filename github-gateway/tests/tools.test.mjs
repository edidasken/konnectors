/**
 * Unit tests for allowlists, close rules, and tool layer (mocked GitHub).
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  makeTempWorkspace,
  createTestContext,
  seedIssue,
  seedLinkedPr,
  readAudit,
} from './helpers.mjs';

function freshState() {
  return {issues: {}, timelines: {}, pulls: {}, comments: {}};
}

test('github_issue_read returns issue on allowlisted repo', async () => {
  const ws = makeTempWorkspace();
  const state = freshState();
  seedIssue(state, 'edidasken', 'code', 61, {title: 'Ticket 55'});
  seedLinkedPr(state, 'edidasken', 'code', 61, 307, true);
  const ctx = createTestContext(ws, state);

  const result = await ctx.tools.invoke({
    name: 'github_issue_read',
    args: {owner: 'edidasken', repo: 'code', issue_number: 61},
    clientId: ws.clientId,
    transport: 'test',
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.title, 'Ticket 55');
  assert.deepEqual(result.data.merged_linked_prs, [307]);
});

test('repo allowlist denial does not call GitHub for foreign owner', async () => {
  const ws = makeTempWorkspace();
  let called = false;
  const state = freshState();
  const ctx = createTestContext(ws, state);
  const orig = ctx.github.request.bind(ctx.github);
  ctx.github.request = async (...args) => {
    called = true;
    return orig(...args);
  };

  const result = await ctx.tools.invoke({
    name: 'github_issue_read',
    args: {owner: 'octocat', repo: 'Hello-World', issue_number: 1},
    clientId: ws.clientId,
    transport: 'test',
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'REPO_NOT_ALLOWLISTED');
  assert.equal(called, false);

  const audit = readAudit(ws.auditPath);
  assert.ok(audit.some((e) => e.error_class === 'REPO_NOT_ALLOWLISTED'));
});

test('action allowlist denial for unknown tool', async () => {
  const ws = makeTempWorkspace();
  const ctx = createTestContext(ws, freshState());
  const result = await ctx.tools.invoke({
    name: 'github_merge_pr',
    args: {owner: 'edidasken', repo: 'code', issue_number: 1},
    clientId: ws.clientId,
    transport: 'test',
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'ACTION_NOT_ALLOWLISTED');
});

test('github_issue_comment creates comment', async () => {
  const ws = makeTempWorkspace();
  const state = freshState();
  seedIssue(state, 'edidasken', 'server', 1);
  const ctx = createTestContext(ws, state);
  const result = await ctx.tools.invoke({
    name: 'github_issue_comment',
    args: {
      owner: 'edidasken',
      repo: 'server',
      issue_number: 1,
      body: 'hello from gateway test',
    },
    clientId: ws.clientId,
    transport: 'test',
  });
  assert.equal(result.ok, true);
  assert.ok(result.data.id);
});

test('close refused when no linked PR', async () => {
  const ws = makeTempWorkspace();
  const state = freshState();
  seedIssue(state, 'edidasken', 'code', 10);
  const ctx = createTestContext(ws, state);
  const result = await ctx.tools.invoke({
    name: 'github_issue_close',
    args: {
      owner: 'edidasken',
      repo: 'code',
      issue_number: 10,
      state_reason: 'completed',
    },
    clientId: ws.clientId,
    transport: 'test',
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'CLOSE_REQUIRES_MERGED_PR');
  assert.match(result.error.message, /no linked PR/i);
});

test('close refused when linked PR is not merged', async () => {
  const ws = makeTempWorkspace();
  const state = freshState();
  seedIssue(state, 'edidasken', 'code', 11);
  seedLinkedPr(state, 'edidasken', 'code', 11, 99, false);
  const ctx = createTestContext(ws, state);
  const result = await ctx.tools.invoke({
    name: 'github_issue_close',
    args: {
      owner: 'edidasken',
      repo: 'code',
      issue_number: 11,
      state_reason: 'completed',
    },
    clientId: ws.clientId,
    transport: 'test',
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'CLOSE_REQUIRES_MERGED_PR');
  assert.match(result.error.message, /not merged/i);
});

test('close with override_unmerged_pr succeeds and is audit-logged', async () => {
  const ws = makeTempWorkspace();
  const state = freshState();
  seedIssue(state, 'edidasken', 'code', 12);
  seedLinkedPr(state, 'edidasken', 'code', 12, 100, false);
  const ctx = createTestContext(ws, state);
  const result = await ctx.tools.invoke({
    name: 'github_issue_close',
    args: {
      owner: 'edidasken',
      repo: 'code',
      issue_number: 12,
      state_reason: 'not_planned',
      override_unmerged_pr: true,
    },
    clientId: ws.clientId,
    transport: 'test',
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.state, 'closed');
  assert.equal(result.data.close_override, true);

  const audit = readAudit(ws.auditPath);
  assert.ok(
    audit.some((e) => e.close_override === true && e.tool === 'github_issue_close'),
    'audit must record close_override',
  );
});

test('close succeeds when linked PR is merged', async () => {
  const ws = makeTempWorkspace();
  const state = freshState();
  seedIssue(state, 'edidasken', 'code', 13);
  seedLinkedPr(state, 'edidasken', 'code', 13, 200, true);
  const ctx = createTestContext(ws, state);
  const result = await ctx.tools.invoke({
    name: 'github_issue_close',
    args: {
      owner: 'edidasken',
      repo: 'code',
      issue_number: 13,
      state_reason: 'completed',
    },
    clientId: ws.clientId,
    transport: 'test',
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.state, 'closed');
  assert.equal(result.data.state_reason, 'completed');
  assert.deepEqual(result.data.merged_linked_prs, [200]);
  assert.equal(result.data.close_override, false);
});

test('audit log contains no secrets', async () => {
  const ws = makeTempWorkspace();
  const state = freshState();
  seedIssue(state, 'edidasken', 'code', 1);
  const ctx = createTestContext(ws, state);
  await ctx.tools.invoke({
    name: 'github_issue_read',
    args: {owner: 'edidasken', repo: 'code', issue_number: 1},
    clientId: ws.clientId,
    transport: 'test',
  });
  const raw = readAudit(ws.auditPath)
    .map((e) => JSON.stringify(e))
    .join('\n');
  assert.doesNotMatch(raw, /test-mock-token/);
  assert.doesNotMatch(raw, /gmgk_/);
  assert.doesNotMatch(raw, /Bearer /i);
  assert.doesNotMatch(raw, /ghp_|github_pat_|ghs_/);
});
