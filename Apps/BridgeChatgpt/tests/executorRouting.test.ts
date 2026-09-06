import assert from 'node:assert';
import { executorCwdForWorkspace } from '../server/executorRouting.js';

assert.equal(
  executorCwdForWorkspace('proj-default', 'proj-default', 'Apps/BridgeChatgpt'),
  '.',
  'BridgeChatgpt jobs must execute from the repository root where .git and package.json live',
);

assert.equal(
  executorCwdForWorkspace('proj-default', 'project-learning-khmer', 'Apps/LearningKhmer'),
  'Apps/LearningKhmer',
  'independent projects must execute from their Apps/<Project> directory',
);

assert.equal(
  executorCwdForWorkspace('proj-default', 'project-demo', './Apps/Demo/'),
  'Apps/Demo',
  'project cwd should normalize a leading ./ and trailing slash',
);

assert.throws(
  () => executorCwdForWorkspace('proj-default', 'project-escape', '../Outside'),
  /must stay under Apps/,
  'independent projects must never escape the Apps shelf',
);

assert.throws(
  () => executorCwdForWorkspace('', 'project-demo', 'Apps/Demo'),
  /project id is required/,
);

console.log('executorRouting.test.ts passed');
