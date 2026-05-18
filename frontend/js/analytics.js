import { auth, db } from "./firebase-config.js";
import { COLLECTIONS, ROLES } from "./constants.js";
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getUserGroups, getUserRoleInGroup } from "./groupService.js";

/* ══════════════════════════════════════════════════════════
   DOM REFERENCES
   ══════════════════════════════════════════════════════════ */
const el = (id) => document.getElementById(id);

const reportTypeSelect = el('report-type');
const groupSelector    = el('group-selector');
const dateFromInput    = el('date-from');
const dateToInput      = el('date-to');
const generateBtn      = el('generate-report-btn');
const exportCsvBtn     = el('export-csv-btn');
const exportPdfBtn     = el('export-pdf-btn');
const reportContent    = el('report-content');
const reportSummary    = el('report-summary');
const reportHeader     = el('report-header');
const reportTitle      = el('report-title-display');
const reportMetadata   = el('report-metadata-display');

let currentReportData = [];
let currentReportType = '';
let currentGroupName  = '';

/* ══════════════════════════════════════════════════════════
   INITIALIZATION
   ══════════════════════════════════════════════════════════ */
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    window.location.href = 'login.html';
    return;
  }

  // Load user groups
  const groups = await getUserGroups(user.uid);
  groupSelector.innerHTML = groups.map(g => `<option value="${g.id}">${g.name}</option>`).join('');

  if (groups.length === 0) {
    groupSelector.innerHTML = '<option value="">No groups found</option>';
    generateBtn.disabled = true;
  } else {
    // Initial check for the first group in the list
    await checkAccessForGroup(groups[0].id, user.uid);
  }
});

groupSelector.addEventListener('change', async () => {
  const user = auth.currentUser;
  if (user && groupSelector.value) {
    await checkAccessForGroup(groupSelector.value, user.uid);
  }
});

async function checkAccessForGroup(groupId, uid) {
  generateBtn.disabled = true;
  reportContent.innerHTML = '<div style="padding: 2rem; text-align: center;">Verifying permissions...</div>';

  const role = await getUserRoleInGroup(groupId, uid);
  const roleLower = role?.toLowerCase();

  if (roleLower === ROLES.ADMIN.toLowerCase() || roleLower === ROLES.TREASURER.toLowerCase()) {
    generateBtn.disabled = false;
    exportCsvBtn.disabled = false;
    exportPdfBtn.disabled = false;
    reportContent.innerHTML = '<div style="padding: var(--space-10); text-align: center; color: var(--color-text-muted);">Select report parameters and click "Generate Report" to view data.</div>';
  } else {
    reportContent.innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--color-danger);">Access Denied. You must be an Admin or Treasurer of this group to view analytics.</div>';
    generateBtn.disabled = true;
    exportCsvBtn.disabled = true;
    exportPdfBtn.disabled = true;
  }
}

generateBtn.addEventListener('click', generateReport);
exportCsvBtn.addEventListener('click', exportToCSV);
exportPdfBtn.addEventListener('click', () => window.print());

/* ══════════════════════════════════════════════════════════
   REPORT GENERATION
   ══════════════════════════════════════════════════════════ */
async function generateReport() {
  const type    = reportTypeSelect.value;
  const groupId = groupSelector.value;
  const from    = dateFromInput.value;
  const to      = dateToInput.value;

  if (!groupId) return;

  reportContent.innerHTML = '<div style="padding: 2rem; text-align: center;">Generating report...</div>';
  reportSummary.innerHTML = '';
  reportHeader.style.display = 'none';

  currentReportType = type;
  currentGroupName  = groupSelector.options[groupSelector.selectedIndex].text;

  try {
    if (type === 'compliance') {
      await generateComplianceReport(groupId, from, to);
    } else if (type === 'payouts') {
      await generatePayoutsReport(groupId);
    } else if (type === 'custom') {
      await generateCustomReport(groupId, from, to);
    }

    reportHeader.style.display = 'block';
    reportTitle.textContent = reportTypeSelect.options[reportTypeSelect.selectedIndex].text;
    reportMetadata.textContent = `Group: ${currentGroupName} | Period: ${from || 'All time'} to ${to || 'Present'}`;
  } catch (err) {
    console.error('Report error:', err);
    reportContent.innerHTML = `<div style="padding: 2rem; text-align: center; color: var(--color-danger);">Error generating report: ${err.message}</div>`;
  }
}

/* ── Compliance Report ── */
async function generateComplianceReport(groupId, from, to) {
  // 1. Get all members
  const membersSnap = await getDocs(collection(db, `groups/${groupId}/members`));
  const members = {};
  membersSnap.forEach(doc => {
    const data = doc.data();
    members[doc.id] = {
      name: data.displayName || 'User ' + doc.id.substring(0, 5),
      totalDue: 0,
      confirmed: 0,
      missed: 0,
      pending: 0
    };
  });

  // 2. Get contributions
  let q = query(collection(db, COLLECTIONS.CONTRIBUTIONS), where('groupId', '==', groupId));
  const contribSnap = await getDocs(q);

  contribSnap.forEach(doc => {
    const c = doc.data();
    if (!members[c.userId]) return;

    // Filter by date if applicable
    if (from && c.date < from) return;
    if (to && c.date > to) return;

    members[c.userId].totalDue += 1;
    if (c.status === 'confirmed') members[c.userId].confirmed += 1;
    else if (c.status === 'missed') members[c.userId].missed += 1;
    else members[c.userId].pending += 1;
  });

  const data = Object.values(members).map(m => ({
    Member: m.name,
    'Total Due': m.totalDue,
    'Confirmed': m.confirmed,
    'Missed': m.missed,
    'Pending': m.pending,
    'Compliance %': m.totalDue > 0 ? Math.round((m.confirmed / m.totalDue) * 100) + '%' : '0%'
  }));

  currentReportData = data;
  renderTable(data);

  const totalConfirmed = data.reduce((sum, m) => sum + m.Confirmed, 0);
  const totalDue = data.reduce((sum, m) => sum + m['Total Due'], 0);
  const avgCompliance = totalDue > 0 ? Math.round((totalConfirmed / totalDue) * 100) : 0;

  renderSummary([
    { label: 'Avg Compliance', value: avgCompliance + '%' },
    { label: 'Total Confirmed', value: totalConfirmed },
    { label: 'Total Missed', value: data.reduce((sum, m) => sum + m.Missed, 0) }
  ]);
}

/* ── Payouts Report ── */
async function generatePayoutsReport(groupId) {
  const payoutsSnap = await getDocs(query(collection(db, COLLECTIONS.PAYOUTS), where('groupId', '==', groupId), orderBy('order', 'asc')));

  const data = payoutsSnap.docs.map(doc => {
    const p = doc.data();
    const today = new Date().toISOString().split('T')[0];

    let statusText = 'Upcoming';
    if (p.status === 'completed') {
      statusText = 'Paid';
    } else if (p.payoutDate < today) {
      statusText = 'Overdue';
    }

    return {
      Order: p.order,
      Member: p.userDisplayName,
      Date: p.payoutDate,
      Amount: 'R ' + p.amount.toLocaleString('en-ZA'),
      Status: statusText
    };
  });

  currentReportData = data;
  renderTable(data);

  const totalAmount = payoutsSnap.docs.reduce((sum, d) => sum + (d.data().amount || 0), 0);
  const upcomingCount = data.filter(d => d.Status === 'Upcoming').length;

  renderSummary([
    { label: 'Total Payout Volume', value: 'R ' + totalAmount.toLocaleString('en-ZA') },
    { label: 'Upcoming Payouts', value: upcomingCount },
    { label: 'Next Payout', value: data.find(d => d.Status === 'Upcoming')?.Date || 'None' }
  ]);
}

/* ── Custom Contribution View ── */
async function generateCustomReport(groupId, from, to) {
  let q = query(collection(db, COLLECTIONS.CONTRIBUTIONS), where('groupId', '==', groupId), orderBy('date', 'desc'));
  const contribSnap = await getDocs(q);

  const data = [];
  let totalAmount = 0;

  for (const doc of contribSnap.docs) {
    const c = doc.data();
    if (from && c.date < from) continue;
    if (to && c.date > to) continue;

    // We might need to fetch display names if they aren't in the contribution doc
    const memberName = c.userDisplayName || 'Member';

    data.push({
      Date: c.date,
      Member: memberName,
      Amount: 'R ' + c.amount.toLocaleString('en-ZA'),
      Status: c.status.toUpperCase(),
      Method: c.paymentEvidence === 'online' ? 'Online' : 'Manual/Proof'
    });

    if (c.status === 'confirmed') {
      totalAmount += Number(c.amount) || 0;
    }
  }

  currentReportData = data;
  renderTable(data);

  renderSummary([
    { label: 'Transaction Count', value: data.length },
    { label: 'Confirmed Total', value: 'R ' + totalAmount.toLocaleString('en-ZA') },
    { label: 'Confirmed Count', value: data.filter(d => d.Status === 'CONFIRMED').length }
  ]);
}

/* ══════════════════════════════════════════════════════════
   UI HELPERS
   ══════════════════════════════════════════════════════════ */
function renderTable(data) {
  if (data.length === 0) {
    reportContent.innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--color-text-muted);">No data found for the selected criteria.</div>';
    return;
  }

  const headers = Object.keys(data[0]);
  const table = document.createElement('table');
  table.className = 'report-table';

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  headers.forEach(h => {
    const th = document.createElement('th');
    th.textContent = h;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  data.forEach(row => {
    const tr = document.createElement('tr');
    headers.forEach(h => {
      const td = document.createElement('td');
      td.textContent = row[h];
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  reportContent.innerHTML = '';
  reportContent.appendChild(table);
}

function renderSummary(stats) {
  reportSummary.innerHTML = stats.map(s => `
    <div class="report-stat">
      <p class="report-stat__label">${s.label}</p>
      <p class="report-stat__value">${s.value}</p>
    </div>
  `).join('');
}

/* ══════════════════════════════════════════════════════════
   EXPORT LOGIC
   ══════════════════════════════════════════════════════════ */
function exportToCSV() {
  if (!currentReportData.length) return;

  const headers = Object.keys(currentReportData[0]);
  const rows = currentReportData.map(obj =>
    headers.map(h => {
      let val = obj[h];
      if (typeof val === 'string' && val.includes(',')) return `"${val}"`;
      return val;
    }).join(',')
  );

  const csvContent = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', `StokPal_Report_${currentReportType}_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
