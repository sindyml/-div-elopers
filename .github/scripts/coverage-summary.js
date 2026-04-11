const fs = require('fs')
const path = require('path')

const summaryPath = path.join(process.env.GITHUB_WORKSPACE, 'coverage', 'coverage-summary.json')
if (!fs.existsSync(summaryPath)) {
  console.error('Coverage summary not found')
  process.exit(1)
}

const coverage = JSON.parse(fs.readFileSync(summaryPath, 'utf8'))
const total = coverage.total

const rows = []
for (const [key, value] of Object.entries(total)) {
  if (key === 'lines' || key === 'statements' || key === 'functions' || key === 'branches') {
    rows.push(`| ${key} | ${value.total} | ${value.covered} | ${value.pct}% |`)
  }
}

const markdown = `
## 📊 Coverage Report

| Metric | Total | Covered | Coverage |
|--------|-------|---------|----------|
${rows.join('\n')}
`

const summary = process.env.GITHUB_STEP_SUMMARY
if (summary) {
  fs.appendFileSync(summary, markdown)
} else {
  console.log(markdown)
}