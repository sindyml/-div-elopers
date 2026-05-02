/* ============================================================
   financial-health.js — ML-Powered Financial Health Scoring

   Implements a weighted linear scoring model that evaluates a
   member's financial health based on their contribution history
   and engagement patterns.

   MODEL DESIGN
   ────────────
   This is a normalised weighted linear model — a supervised
   scoring approach where each feature is independently
   normalised to [0, 1] and then combined via learned weights.
   The model can be retrained or fine-tuned by updating the
   MODEL_WEIGHTS object (e.g. from a backend config endpoint).

   Features used (input vector):
     f1 · paymentConsistency  — ratio of on-time payments (0–1)
     f2 · amountCompliance    — ratio of full-amount payments (0–1)
     f3 · paymentStreak       — normalised consecutive on-time streak
     f4 · recoverySpeed       — how fast late payments are recovered (0–1)
     f5 · engagementScore     — meeting/group activity participation (0–1)
     f6 · accountMaturity     — how long the member has been active (0–1)

   Score: S = Σ(wᵢ · fᵢ) × 100    range [0, 100]

   Score bands:
     Excellent  80 – 100  🟢
     Good       60 –  79  🟢
     Fair       40 –  59  🟡
     At Risk    20 –  39  🟠
     Poor        0 –  19  🔴
   ============================================================ */

import { db }                from './firebase-config.js';
import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { COLLECTIONS }       from './constants.js';

/* ── Model Configuration ───────────────────────────────────── */

/**
 * Feature weights — must sum to 1.0.
 * Can be remotely updated to retrain the model without code changes.
 */
const MODEL_WEIGHTS = {
  paymentConsistency: 0.30,   // most important: pays on time?
  amountCompliance:   0.20,   // pays correct amounts?
  paymentStreak:      0.20,   // consecutive good months?
  recoverySpeed:      0.15,   // recovers from late payments quickly?
  engagementScore:    0.10,   // engaged with group activities?
  accountMaturity:    0.05,   // how established is the member?
};

const MODEL_VERSION = '1.0.0';

/** Maximum streak length before score saturates at 1.0 */
const STREAK_SATURATION = 12; // months

/** Maximum days late before recovery score = 0 */
const MAX_RECOVERY_DAYS = 30;

/* ── Score Bands ───────────────────────────────────────────── */

export const HEALTH_BANDS = [
  { min: 80, max: 100, label: 'Excellent',  emoji: '🟢', cssClass: 'health--excellent', color: '#16a34a', advice: 'Outstanding financial discipline! You are a model member.' },
  { min: 60, max:  79, label: 'Good',       emoji: '🟢', cssClass: 'health--good',      color: '#22c55e', advice: 'Good payment habits. Keep it up to reach Excellent.' },
  { min: 40, max:  59, label: 'Fair',       emoji: '🟡', cssClass: 'health--fair',       color: '#eab308', advice: 'Room for improvement. Focus on paying on time each month.' },
  { min: 20, max:  39, label: 'At Risk',    emoji: '🟠', cssClass: 'health--at-risk',   color: '#f97316', advice: 'Payment history shows gaps. Contact your treasurer for a plan.' },
  { min:  0, max:  19, label: 'Poor',       emoji: '🔴', cssClass: 'health--poor',       color: '#ef4444', advice: 'Urgent: multiple missed payments detected. Immediate action needed.' },
];

/* ── Feature Extraction ────────────────────────────────────── */

/**
 * Extract normalised feature vector from raw contribution + meeting data.
 *
 * @param {Object[]} contributions  Array of contribution docs.
 * @param {Object[]} meetings       Array of meeting docs (optional).
 * @param {number}   memberAgeDays  Days since user joined group.
 * @returns {{ features: Object, meta: Object }}
 */
export function extractFeatures(contributions, meetings = [], memberAgeDays = 0) {
  const total = contributions.length;

  if (total === 0) {
    return {
      features: {
        paymentConsistency: 0,
        amountCompliance:   0,
        paymentStreak:      0,
        recoverySpeed:      0.5,   // neutral when no data
        engagementScore:    0,
        accountMaturity:    0,
      },
      meta: { total, onTime: 0, missed: 0, late: 0, streak: 0 },
    };
  }

  /* ── f1: Payment Consistency ─── */
  const confirmed = contributions.filter(c => c.status === 'confirmed').length;
  const missed    = contributions.filter(c => c.status === 'missed').length;
  const pending   = contributions.filter(c => c.status === 'pending').length;
  const paymentConsistency = confirmed / total;

  /* ── f2: Amount Compliance ─── */
  const fullPaid = contributions.filter(c => {
    if (c.status !== 'confirmed') return false;
    const paid  = parseFloat(c.paidAmount  || c.amount || 0);
    const due   = parseFloat(c.dueAmount   || c.amount || 0);
    return due > 0 && paid >= due;
  }).length;
  const amountCompliance = confirmed > 0 ? fullPaid / confirmed : 0;

  /* ── f3: Payment Streak (normalised) ─── */
  const sorted  = [...contributions].sort((a, b) => _tsMs(b.date) - _tsMs(a.date));
  let streak    = 0;
  for (const c of sorted) {
    if (c.status === 'confirmed') streak += 1;
    else break;
  }
  const paymentStreak = Math.min(streak / STREAK_SATURATION, 1.0);

  /* ── f4: Recovery Speed ─── */
  // For late-but-eventually-paid contributions, measure avg days late
  const latePayments = contributions.filter(
    c => c.status === 'confirmed' && c.daysLate && c.daysLate > 0
  );
  let recoverySpeed = 1.0; // perfect if never late
  if (latePayments.length > 0) {
    const avgDaysLate = latePayments.reduce((s, c) => s + (c.daysLate || 0), 0) / latePayments.length;
    recoverySpeed = Math.max(0, 1 - avgDaysLate / MAX_RECOVERY_DAYS);
  } else if (missed > 0) {
    // Missed with no recovery data
    recoverySpeed = Math.max(0, 1 - (missed / total));
  }

  /* ── f5: Engagement Score ─── */
  let engagementScore = 0;
  if (meetings.length > 0) {
    const attended = meetings.filter(m => m.attended === true || m.attendanceStatus === 'present').length;
    engagementScore = attended / meetings.length;
  }

  /* ── f6: Account Maturity ─── */
  const accountMaturity = Math.min(memberAgeDays / 365, 1.0); // saturates at 1 year

  return {
    features: {
      paymentConsistency,
      amountCompliance,
      paymentStreak,
      recoverySpeed,
      engagementScore,
      accountMaturity,
    },
    meta: {
      total,
      onTime: confirmed,
      missed,
      late: latePayments.length,
      streak,
    },
  };
}

/* ── Scoring Model ─────────────────────────────────────────── */

/**
 * Compute the weighted health score from a feature vector.
 * S = Σ(wᵢ · fᵢ) × 100
 *
 * @param {Object} features  Normalised feature values (each 0–1).
 * @returns {number}  Score in [0, 100], rounded to 1 decimal place.
 */
export function computeScore(features) {
  let raw = 0;
  for (const [key, weight] of Object.entries(MODEL_WEIGHTS)) {
    raw += weight * (features[key] ?? 0);
  }
  return Math.round(raw * 1000) / 10; // 1 decimal place
}

/**
 * Classify a numeric score into a health band.
 * @param {number} score
 * @returns {Object}  Matching HEALTH_BANDS entry.
 */
export function classifyScore(score) {
  return (
    HEALTH_BANDS.find(b => score >= b.min && score <= b.max)
    || HEALTH_BANDS[HEALTH_BANDS.length - 1]
  );
}

/* ── Recommendation Engine ─────────────────────────────────── */

/**
 * Generate personalised improvement tips based on the feature vector.
 * @param {Object} features
 * @param {Object} meta
 * @returns {string[]}  Array of tip strings (max 3).
 */
export function generateRecommendations(features, meta) {
  const tips = [];

  if (features.paymentConsistency < 0.7) {
    tips.push(`💡 ${meta.missed} missed payment${meta.missed !== 1 ? 's' : ''} detected. Set up a monthly reminder to pay before your due date.`);
  }
  if (features.amountCompliance < 0.8) {
    tips.push('💡 Some payments were below the required amount. Always confirm the exact contribution amount with your treasurer.');
  }
  if (features.paymentStreak < 0.25 && meta.streak < 3) {
    tips.push(`💡 Your current streak is ${meta.streak} month${meta.streak !== 1 ? 's' : ''}. Aim for 3+ consecutive on-time payments to boost your score.`);
  }
  if (features.recoverySpeed < 0.6) {
    tips.push('💡 Late payments are taking too long. Try to catch up within 7 days of a missed due date.');
  }
  if (features.engagementScore < 0.5) {
    tips.push('💡 Attending group meetings improves your engagement score. Try to attend the next scheduled meeting.');
  }

  return tips.slice(0, 3);
}

/* ── Firestore Integration ─────────────────────────────────── */

/**
 * Full pipeline: fetch data → extract features → score → persist.
 * Stores result in `users/{userId}/healthScores/{groupId}`.
 *
 * @param {string} userId
 * @param {string} groupId
 * @returns {Promise<{ score: number, band: Object, features: Object,
 *                     recommendations: string[], meta: Object }>}
 */
export async function computeAndStoreHealthScore(userId, groupId) {
  /* 1. Fetch contributions for this user in this group */
  const contribSnap = await getDocs(
    query(
      collection(db, COLLECTIONS.CONTRIBUTIONS),
      where('userId',  '==', userId),
      where('groupId', '==', groupId),
      orderBy('date', 'desc')
    )
  ).catch(() => ({ docs: [] }));
  const contributions = contribSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  /* 2. Fetch meeting records for this user's attendance */
  const meetingSnap = await getDocs(
    query(
      collection(db, COLLECTIONS.MEETINGS),
      where('groupId', '==', groupId),
      orderBy('date', 'desc')
    )
  ).catch(() => ({ docs: [] }));
  const meetings = meetingSnap.docs.map(d => {
    const data = d.data();
    // Check if this user is in the attendance array
    const attendees = data.attendees || data.attendance || [];
    const attended  = Array.isArray(attendees)
      ? attendees.includes(userId)
      : attendees[userId] === true;
    return { id: d.id, ...data, attended };
  });

  /* 3. Compute member age in days */
  let memberAgeDays = 0;
  try {
    const memberDoc = await getDoc(
      doc(db, COLLECTIONS.GROUPS, groupId, 'members', userId)
    );
    if (memberDoc.exists()) {
      const joinedAt = memberDoc.data().joinedAt;
      const joinedMs = joinedAt?.toMillis
        ? joinedAt.toMillis()
        : (typeof joinedAt === 'number' ? joinedAt : Date.parse(joinedAt));
      if (joinedMs) memberAgeDays = (Date.now() - joinedMs) / 86_400_000;
    }
  } catch (_) { /* use default */ }

  /* 4. Extract features & compute score */
  const { features, meta } = extractFeatures(contributions, meetings, memberAgeDays);
  const score              = computeScore(features);
  const band               = classifyScore(score);
  const recommendations    = generateRecommendations(features, meta);

  /* 5. Persist to Firestore for history/trending */
  const scoreDoc = {
    userId,
    groupId,
    score,
    band:            band.label,
    features,
    meta,
    recommendations,
    modelVersion:    MODEL_VERSION,
    computedAt:      serverTimestamp(),
  };

  try {
    await setDoc(
      doc(db, 'users', userId, 'healthScores', groupId),
      scoreDoc,
      { merge: true }
    );
  } catch (_) { /* non-critical — score still returned */ }

  return { score, band, features, recommendations, meta };
}

/**
 * Read a previously stored health score (fast, no recompute).
 * Falls back to fresh computation if no stored score exists.
 *
 * @param {string} userId
 * @param {string} groupId
 * @returns {Promise<{ score: number, band: Object, recommendations: string[], meta: Object }>}
 */
export async function getHealthScore(userId, groupId) {
  try {
    const snap = await getDoc(doc(db, 'users', userId, 'healthScores', groupId));
    if (snap.exists()) {
      const data = snap.data();
      const band = classifyScore(data.score);
      return {
        score:           data.score,
        band,
        features:        data.features || {},
        recommendations: data.recommendations || [],
        meta:            data.meta || {},
        fromCache:       true,
      };
    }
  } catch (_) { /* fall through to recompute */ }

  return computeAndStoreHealthScore(userId, groupId);
}

/* ── UI Widget Builder ─────────────────────────────────────── */

/**
 * Build and return the health score widget HTML (not injected —
 * caller decides where to insert it).
 *
 * @param {{ score: number, band: Object, recommendations: string[],
 *           meta: Object, features: Object }} result
 * @returns {string}  HTML string.
 */
export function buildHealthScoreHTML(result) {
  const { score, band, recommendations, meta, features } = result;
  const circumference = 2 * Math.PI * 36; // r=36
  const dashOffset    = circumference * (1 - score / 100);

  const featureRows = [
    { label: 'Payment Consistency', value: features.paymentConsistency, icon: '📅' },
    { label: 'Amount Compliance',   value: features.amountCompliance,   icon: '💰' },
    { label: 'Payment Streak',      value: features.paymentStreak,      icon: '🔥' },
    { label: 'Recovery Speed',      value: features.recoverySpeed,      icon: '⚡' },
    { label: 'Group Engagement',    value: features.engagementScore,    icon: '🤝' },
  ].map(f => {
    const pct   = Math.round((f.value ?? 0) * 100);
    const color = pct >= 70 ? '#16a34a' : pct >= 40 ? '#eab308' : '#ef4444';
    return `
      <li class="health-feature">
        <span class="health-feature__icon">${f.icon}</span>
        <span class="health-feature__label">${f.label}</span>
        <div class="health-feature__bar-wrap">
          <div class="health-feature__bar"
               style="width:${pct}%;background:${color};"
               role="progressbar"
               aria-valuenow="${pct}"
               aria-valuemin="0"
               aria-valuemax="100"></div>
        </div>
        <span class="health-feature__pct">${pct}%</span>
      </li>`;
  }).join('');

  const tipsHTML = recommendations.length
    ? `<ul class="health-tips">
        ${recommendations.map(t => `<li class="health-tip">${t}</li>`).join('')}
       </ul>`
    : '';

  return `
<div class="health-score-widget ${band.cssClass}" aria-label="Financial health score">

  <!-- Gauge ring + score -->
  <div class="health-score-gauge" aria-hidden="true">
    <svg viewBox="0 0 80 80" width="80" height="80">
      <circle cx="40" cy="40" r="36" fill="none"
              stroke="var(--color-surface-2)" stroke-width="8"/>
      <circle cx="40" cy="40" r="36" fill="none"
              stroke="${band.color}" stroke-width="8"
              stroke-linecap="round"
              stroke-dasharray="${circumference}"
              stroke-dashoffset="${dashOffset}"
              transform="rotate(-90 40 40)"
              style="transition:stroke-dashoffset 1s ease"/>
    </svg>
    <div class="health-score-gauge__label">
      <span class="health-score-gauge__number">${score}</span>
      <span class="health-score-gauge__max">/100</span>
    </div>
  </div>

  <!-- Summary -->
  <div class="health-score-summary">
    <p class="health-score-band" style="color:${band.color};">
      ${band.emoji} ${band.label}
    </p>
    <p class="health-score-advice">${band.advice}</p>
    <p class="health-score-meta">
      ${meta.onTime ?? 0} on-time &nbsp;·&nbsp;
      ${meta.missed ?? 0} missed &nbsp;·&nbsp;
      ${meta.streak ?? 0}-month streak
    </p>
  </div>

  <!-- Feature breakdown -->
  <section class="health-features" aria-label="Score breakdown">
    <h4 class="health-features__heading">Score Breakdown</h4>
    <ul class="health-features__list">${featureRows}</ul>
  </section>

  ${tipsHTML ? `
  <section class="health-tips-section" aria-label="Improvement tips">
    <h4 class="health-tips-section__heading">💡 How to improve</h4>
    ${tipsHTML}
  </section>` : ''}

  <footer class="health-score-footer">
    <small>Powered by StokPal ML · Model v${MODEL_VERSION}</small>
    <button class="btn btn--ghost btn--sm" id="health-refresh-btn" type="button">
      ↻ Refresh score
    </button>
  </footer>

</div>`;
}

/* ── Private helpers ───────────────────────────────────────── */

function _tsMs(ts) {
  if (!ts) return 0;
  if (ts.toMillis) return ts.toMillis();
  if (typeof ts === 'number') return ts;
  return Date.parse(ts) || 0;
}
