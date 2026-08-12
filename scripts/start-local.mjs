import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const firebaseBin = process.platform === 'win32' ? 'firebase.cmd' : 'firebase';
const args = [
  'emulators:exec',
  '--project',
  'demo-kit-pr-poster',
  '--export-on-exit=.firebase-data',
];
if (existsSync('.firebase-data/firebase-export-metadata.json'))
  args.push('--import=.firebase-data');
args.push('npm run dev:local');
const result = spawnSync(firebaseBin, args, { stdio: 'inherit', shell: false });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
