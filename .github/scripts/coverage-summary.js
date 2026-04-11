import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const summaryPath = path.join(process.env.GITHUB_WORKSPACE, 'coverage', 'coverage-summary.json');

if (!fs.existsSync(summaryPath)) {
  console.error('Coverage summary not found at', summaryPath);
  process.exit(1);
}

const coverage = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
const total = coverage.total;

const rows = [];
for (const [key, value] of Object.entries(total)) {
  if (['lines', 'statements', 'functions', 'branches'].includes(key)) {
    rows.push(`| ${key} | ${value.total} | ${value.covered} | ${value.pct}% |`);
  }
}

const markdown = `
## 📊 Coverage Report

| Metric | Total | Covered | Coverage |
|--------|-------|---------|----------|
${rows.join('\n')}
`;

const summaryFile = process.env.GITHUB_STEP_SUMMARY;
if (summaryFile) {
  fs.appendFileSync(summaryFile, markdown);
} else {
  console.log(markdown);
}