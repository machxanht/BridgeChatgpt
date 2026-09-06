export function executorCwdForWorkspace(bridgeProjectIdRaw: unknown, workspaceProjectIdRaw: unknown, localPathRaw: unknown) {
  const bridgeProjectId = String(bridgeProjectIdRaw || '').trim();
  const workspaceProjectId = String(workspaceProjectIdRaw || '').trim();
  const localPath = String(localPathRaw || '').trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');

  if (!bridgeProjectId || !workspaceProjectId) throw new Error('project id is required for executor routing');

  // BridgeChatgpt is a monorepo-style special case: its application source lives
  // in Apps/BridgeChatgpt, while the Git repository, package.json, runtime/docs,
  // and executor root live at E:\AI\Bridge. Therefore Bridge's own jobs execute
  // at the approved repository root.
  if (workspaceProjectId === bridgeProjectId) return '.';

  // All independent managed projects must execute inside the Apps shelf.
  if (!localPath || !(localPath === 'Apps' || localPath.startsWith('Apps/'))) {
    throw new Error(`Executor project path must stay under Apps/: ${localPath || '(empty)'}`);
  }
  return localPath;
}
