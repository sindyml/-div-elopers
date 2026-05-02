/* ============================================================
   payment-reminders.js — Payment Reminder Notification System
                           (UI only — no push notifications)

   Queries upcoming and overdue contributions, then surfaces
   them as dismissable toast banners in the current page.

   Usage (call once on page load after auth):
     import { initPaymentReminders } from './payment-reminders.js';
     initPaymentReminders(userId);

   The module injects a #reminder-root container into the DOM
   if one does not already exist, then manages all reminder
   banners inside it.
   ============================================================ */

import { db }                 from './firebase-config.js';
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getUserGroups }      from './groupService.js';
import { COLLECTIONS }        from './constants.js';

/* ── Constants ─────────────────────────────────────────────── */

/** Days before due date to start showing "upcoming" reminders */
const REMIND_DAYS_AHEAD  = 3;

/** Local-storage key prefix for dismissed reminders */
const DISMISSED_KEY      = 'stokpal_dismissed_reminders';

/** Auto-hide toast banners after this many ms (0 = never) */
const TOAST_AUTO_HIDE_MS = 0;

/* ── Types of reminders ─────────────────────────────────────── */

const REMINDER_TYPES = {
  OVERDUE:   { label: 'Overdue',   cssClass: 'reminder--overdue',   icon: '🚨', priority: 1 },
  DUE_TODAY: { label: 'Due Today', cssClass: 'reminder--due-today', icon: '⏰', priority: 2 },
  UPCOMING:  { label: 'Upcoming',  cssClass: 'reminder--upcoming',  icon: '📅', priority: 3 },
};

/* ── Dismissed state (persisted in localStorage) ───────────── */

function _getDismissed() {
  try {
    return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]'));
  } catch { return new Set(); }
}

function _saveDismissed(set) {
  try {
    // Only keep entries from the last 30 days to avoid stale data
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...set].slice(-200)));
  } catch { /* ignore */ }
}

function _isDismissed(id) { return _getDismissed().has(id); }

function _dismiss(id) {
  const set = _getDismissed();
  set.add(id);
  _saveDismissed(set);
}

/* ── DOM Injection ─────────────────────────────────────────── */

function _ensureReminderRoot() {
  let root = document.getElementById('reminder-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'reminder-root';
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', 'Payment reminders');
    root.style.cssText =
      'position:fixed;top:var(--space-4, 1rem);right:var(--space-4, 1rem);' +
      'z-index:900;display:flex;flex-direction:column;gap:0.5rem;' +
      'max-width:360px;width:calc(100% - 2rem);pointer-events:none;';
    document.body.appendChild(root);
  }
  return root;
}

/* ── Banner Builder ─────────────────────────────────────────── */

function _createBanner(reminder) {
  const { id, type, groupName, amount, daysUntilDue, contributionId } = reminder;
  const t = REMINDER_TYPES[type];

  let bodyText = '';
  if (type === 'OVERDUE') {
    bodyText = `You have an overdue payment of <strong>R ${amount.toFixed(2)}</strong> for <strong>${_esc(groupName)}</strong>.`;
  } else if (type === 'DUE_TODAY') {
    bodyText = `Your contribution of <strong>R ${amount.toFixed(2)}</strong> for <strong>${_esc(groupName)}</strong> is due today.`;
  } else {
    bodyText = `Your contribution of <strong>R ${amount.toFixed(2)}</strong> for <strong>${_esc(groupName)}</strong> is due in ${daysUntilDue} day${daysUntilDue !== 1 ? 's' : ''}.`;
  }

  const banner = document.createElement('div');
  banner.className = `payment-reminder ${t.cssClass}`;
  banner.setAttribute('role', 'alert');
  banner.setAttribute('aria-live', 'polite');
  banner.style.pointerEvents = 'all';
  banner.innerHTML = `
    <div class="reminder__icon" aria-hidden="true">${t.icon}</div>
    <div class="reminder__body">
      <p class="reminder__badge">${t.label}</p>
      <p class="reminder__text">${bodyText}</p>
      <div class="reminder__actions">
        <a href="payment.html" class="btn btn--primary btn--xs">Pay Now</a>
        <button class="btn btn--ghost btn--xs js-reminder-snooze" data-id="${_esc(id)}">
          Remind later
        </button>
      </div>
    </div>
    <button class="reminder__close js-reminder-dismiss"
            data-id="${_esc(id)}"
            aria-label="Dismiss reminder">✕</button>
  `;

  // Wire dismiss
  banner.querySelector('.js-reminder-dismiss').addEventListener('click', () => {
    _dismiss(id);
    banner.classList.add('reminder--hiding');
    setTimeout(() => banner.remove(), 300);
  });

  // Wire snooze (24h — flagged in localStorage)
  banner.querySelector('.js-reminder-snooze').addEventListener('click', () => {
    const snoozeKey = `${DISMISSED_KEY}_snooze_${id}`;
    try {
      localStorage.setItem(snoozeKey, String(Date.now() + 24 * 60 * 60 * 1000));
    } catch { /* ignore */ }
    banner.classList.add('reminder--hiding');
    setTimeout(() => banner.remove(), 300);
  });

  if (TOAST_AUTO_HIDE_MS > 0) {
    setTimeout(() => {
      banner.classList.add('reminder--hiding');
      setTimeout(() => banner.remove(), 300);
    }, TOAST_AUTO_HIDE_MS);
  }

  return banner;
}

/* ── Snooze check ───────────────────────────────────────────── */

function _isSnoozed(id) {
  try {
    const snoozeKey = `${DISMISSED_KEY}_snooze_${id}`;
    const until = parseInt(localStorage.getItem(snoozeKey) || '0', 10);
    return Date.now() < until;
  } catch { return false; }
}

/* ── Data loading ───────────────────────────────────────────── */

/**
 * Fetch pending/missed contributions, classify them by urgency, and
 * return an array of reminder objects sorted by priority.
 *
 * @param {string} userId
 * @returns {Promise<Array>}
 */
export async function loadReminders(userId) {
  const groups   = await getUserGroups(userId).catch(() => []);
  const groupMap = {};
  groups.forEach(g => { groupMap[g.id] = g.name; });

  const snap = await getDocs(
    query(
      collection(db, COLLECTIONS.CONTRIBUTIONS),
      where('userId', '==', userId),
      where('status', 'in', ['pending', 'missed']),
      orderBy('date', 'asc')
    )
  ).catch(() => ({ docs: [] }));

  const now        = Date.now();
  const dayMs      = 86_400_000;
  const reminders  = [];

  snap.docs.forEach(d => {
    const c        = { id: d.id, ...d.data() };
    const dueMs    = c.date?.toMillis
      ? c.date.toMillis()
      : (typeof c.date === 'number' ? c.date : Date.parse(c.date) || 0);

    if (!dueMs) return;

    const daysUntilDue = Math.floor((dueMs - now) / dayMs);
    const amount       = parseFloat(c.amount) || 0;
    const groupName    = groupMap[c.groupId] || 'Your group';

    let type = null;
    if (c.status === 'missed' || daysUntilDue < 0) {
      type = 'OVERDUE';
    } else if (daysUntilDue === 0) {
      type = 'DUE_TODAY';
    } else if (daysUntilDue <= REMIND_DAYS_AHEAD) {
      type = 'UPCOMING';
    }

    if (!type) return; // not yet due — skip

    const reminderId = `${c.id}_${type}`;
    reminders.push({ id: reminderId, type, groupName, amount, daysUntilDue: Math.max(daysUntilDue, 0), contributionId: c.id });
  });

  return reminders.sort((a, b) => REMINDER_TYPES[a.type].priority - REMINDER_TYPES[b.type].priority);
}

/* ── Public API ─────────────────────────────────────────────── */

/**
 * Initialise the payment reminder system.
 * Loads reminders and injects banners for any non-dismissed ones.
 *
 * @param {string} userId
 * @returns {Promise<number>}  Number of active reminders shown.
 */
export async function initPaymentReminders(userId) {
  const reminders = await loadReminders(userId);
  const root      = _ensureReminderRoot();
  let shown       = 0;

  reminders.forEach(r => {
    if (_isDismissed(r.id) || _isSnoozed(r.id)) return;
    const banner = _createBanner(r);
    root.appendChild(banner);
    shown += 1;
  });

  return shown;
}

/**
 * Get a count of active (non-dismissed) reminders without showing UI.
 * Useful for notification badges.
 *
 * @param {string} userId
 * @returns {Promise<{ total: number, overdue: number, dueToday: number, upcoming: number }>}
 */
export async function getReminderCounts(userId) {
  const reminders = await loadReminders(userId);
  const active    = reminders.filter(r => !_isDismissed(r.id) && !_isSnoozed(r.id));

  return {
    total:    active.length,
    overdue:  active.filter(r => r.type === 'OVERDUE').length,
    dueToday: active.filter(r => r.type === 'DUE_TODAY').length,
    upcoming: active.filter(r => r.type === 'UPCOMING').length,
  };
}

/* ── Private helpers ───────────────────────────────────────── */

function _esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
