// Runs matches in parallel on worker threads. Each job is
// { a: {name, src}, b: {name, src}, seed, rules, keepReplay }.

import { Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';

const WORKER = new URL('./worker.mjs', import.meta.url);

export async function runJobs(jobs, { threads = availableParallelism() - 1, onResult } = {}) {
  const results = new Array(jobs.length);
  let next = 0, done = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(threads, jobs.length)) }, () => new Worker(WORKER));
  await new Promise((resolve, reject) => {
    const feed = (w) => {
      if (next >= jobs.length) return;
      const id = next++;
      w.postMessage({ id, job: jobs[id] });
    };
    for (const w of workers) {
      w.on('message', ({ id, result }) => {
        results[id] = result;
        done++;
        onResult?.(result, done, jobs.length);
        if (done === jobs.length) resolve();
        else feed(w);
      });
      w.on('error', reject);
      feed(w);
    }
  });
  await Promise.all(workers.map((w) => w.terminate()));
  return results;
}
