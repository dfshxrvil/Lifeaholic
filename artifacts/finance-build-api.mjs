import { spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

const credentials = spawnSync('git', ['credential', 'fill'], {
  input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8',
  env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
});
const fields = Object.fromEntries(credentials.stdout.trim().split('\n').map(line => {
  const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)];
}));
if (!fields.password) throw new Error('GitHub authentication unavailable');
const base = 'https://api.github.com/repos/dfshxrvil/Lifeaholic';
const headers = { Authorization: `Bearer ${fields.password}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Lifeaholic-IPA-build' };
const [action, id] = process.argv.slice(2);
async function api(path, options = {}) {
  const response = await fetch(base + path, { ...options, headers });
  if (!response.ok) throw new Error(`GitHub request failed: ${response.status}`);
  return response.status === 204 ? null : response.json();
}
if (action === 'dispatch') {
  await api('/actions/workflows/ios-sideloadly.yml/dispatches', {
    method: 'POST', body: JSON.stringify({ ref: 'build/personal-finance-ipa' }),
  });
  console.log('IPA workflow dispatched for build/personal-finance-ipa');
} else if (action === 'status') {
  const data = await api('/actions/workflows/ios-sideloadly.yml/runs?branch=build%2Fpersonal-finance-ipa&per_page=3');
  for (const run of data.workflow_runs) {
    const jobs = await api(`/actions/runs/${run.id}/jobs`);
    console.log(JSON.stringify({ id: run.id, sha: run.head_sha, status: run.status, conclusion: run.conclusion, url: run.html_url,
      jobs: jobs.jobs.map(job => ({ name: job.name, status: job.status, conclusion: job.conclusion, steps: job.steps?.map(step => ({ name: step.name, status: step.status, conclusion: step.conclusion })) })) }));
  }
} else if (action === 'download') {
  if (!/^\d+$/.test(id)) throw new Error('Run ID required');
  const run = await api(`/actions/runs/${id}`);
  if (run.conclusion !== 'success' || !run.head_sha.startsWith('8697298')) throw new Error('Expected finance build has not succeeded');
  const data = await api(`/actions/runs/${id}/artifacts`);
  const artifact = data.artifacts.find(item => item.name === 'Lifeaholic-sideloadly');
  if (!artifact || artifact.expired) throw new Error('IPA artifact unavailable');
  const response = await fetch(base + `/actions/artifacts/${artifact.id}/zip`, { headers });
  if (!response.ok) throw new Error(`Artifact download failed: ${response.status}`);
  const path = `artifacts/Lifeaholic-finance-${id}.zip`;
  await writeFile(path, Buffer.from(await response.arrayBuffer()));
  await writeFile(`artifacts/Lifeaholic-finance-${id}.json`, JSON.stringify({ runId: run.id, sha: run.head_sha, url: run.html_url, artifactId: artifact.id, createdAt: artifact.created_at, digest: artifact.digest }, null, 2));
  console.log(path);
} else throw new Error('Expected dispatch, status, or download');
