const fs = require('fs');
const vm = require('vm');
const path = require('path');

// ── Load the financial-health.js source ──────────────────────────────
// Strip imports and exports
const SRC = fs.readFileSync(
  path.join(__dirname, '..', 'frontend', 'js', 'financial-health.js'),
  'utf-8',
)
.replace(/import\s+[^;]+from\s+[^;]+;/g, '')
.replace(/export\s+const\s+/g, 'const ')
.replace(/export\s+async\s+function\s+/g, 'async function ')
.replace(/export\s+function\s+/g, 'function ');

function createSandbox(overrides = {}) {
  const sandbox = {
    console: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
    Date,
    parseFloat,
    Math,
    Object,
    Array,
    ...overrides,
  };

  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox, { filename: 'financial-health.js' });

  return sandbox;
}

describe('Financial Health Score ML System', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = createSandbox();
  });

  test('extractFeatures should correctly normalize data', () => {
    const mockContributions = [
      { status: 'confirmed', amount: 1000, paidAmount: 1000, date: '2023-01-01' },
      { status: 'confirmed', amount: 1000, paidAmount: 1000, date: '2023-02-01' },
      { status: 'confirmed', amount: 1000, paidAmount: 1000, date: '2023-03-01' },
      { status: 'missed', amount: 1000, date: '2023-04-01' },
      { status: 'confirmed', amount: 1000, paidAmount: 1000, date: '2023-05-01', daysLate: 5 },
    ];

    const mockMeetings = [
      { attended: true },
      { attended: false },
      { attendanceStatus: 'present' },
    ];

    const memberAgeDays = 120;

    const { features, meta } = sandbox.extractFeatures(mockContributions, mockMeetings, memberAgeDays);

    expect(meta.total).toBe(5);
    expect(meta.onTime).toBe(4);
    expect(meta.missed).toBe(1);
    expect(meta.streak).toBe(1); // last one is confirmed, but one before was missed

    expect(features.paymentConsistency).toBe(4/5);
    expect(features.amountCompliance).toBe(1); // all confirmed were full amount
    expect(features.engagementScore).toBe(2/3);
    expect(features.accountMaturity).toBeCloseTo(120/365);
  });

  test('computeScore should return a value between 0 and 100', () => {
    const mockContributions = [
        { status: 'confirmed', amount: 1000, paidAmount: 1000, date: '2023-01-01' }
    ];
    const { features } = sandbox.extractFeatures(mockContributions, [], 30);
    const score = sandbox.computeScore(features);

    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  test('classifyScore should return correct band', () => {
    expect(sandbox.classifyScore(95).label).toBe('Excellent');
    expect(sandbox.classifyScore(70).label).toBe('Good');
    expect(sandbox.classifyScore(50).label).toBe('Fair');
    expect(sandbox.classifyScore(30).label).toBe('At Risk');
    expect(sandbox.classifyScore(10).label).toBe('Poor');
  });

  test('generateRecommendations should provide relevant tips', () => {
    const mockContributions = [
        { status: 'missed', amount: 1000, date: '2023-04-01' }
    ];
    const { features, meta } = sandbox.extractFeatures(mockContributions, [], 30);
    const tips = sandbox.generateRecommendations(features, meta);

    expect(tips.length).toBeGreaterThan(0);
    expect(tips.some(t => t.includes('missed'))).toBe(true);
  });

  test('perfect score for perfect history', () => {
      const perfectContributions = Array(12).fill({ status: 'confirmed', amount: 1000, paidAmount: 1000, date: '2023-01-01' });
      const perfectMeetings = Array(5).fill({ attended: true });
      const perfectAge = 365;

      const { features } = sandbox.extractFeatures(perfectContributions, perfectMeetings, perfectAge);
      const score = sandbox.computeScore(features);

      expect(score).toBe(100);
      expect(sandbox.classifyScore(score).label).toBe('Excellent');
  });
});
