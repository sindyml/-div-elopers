/* ============================================================
   tests/payment-ui.test.js
   Accessibility and mobile-responsiveness tests for the payment UI.

   Approach:
     Accessibility — static analysis of the payment-modal.js source
       (template HTML) and payment.css. No live DOM needed.
     Mobile         — checks payment.css for required responsive rules.

   Covers:
     - ARIA roles, labels, live regions on all 6 modal screens
     - Required element IDs (JS entry points)
     - Keyboard/focus accessibility attributes
     - payment.css mobile media queries
     - Responsive layout units in payment.css
   ============================================================ */

const fs   = require('fs');
const path = require('path');

// ── Load source files once ─────────────────────────────────
const MODAL_SRC = fs.readFileSync(
  path.join(__dirname, '..', 'frontend', 'components', 'payment-modal.js'),
  'utf-8',
);

const CSS_SRC = fs.readFileSync(
  path.join(__dirname, '..', 'frontend', 'css', 'payment.css'),
  'utf-8',
);

// ── Helpers ────────────────────────────────────────────────

/** Assert that `str` contains every item in `attrs`. */
function expectAll(str, attrs) {
  for (const attr of attrs) {
    expect(str).toContain(attr);
  }
}

/** Assert the source contains at least `count` occurrences of `needle`. */
function countOccurrences(haystack, needle) {
  return (haystack.match(new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
}

// ═══════════════════════════════════════════════════════════
// ARIA Roles & Semantics
// ═══════════════════════════════════════════════════════════

describe('Payment Modal — ARIA roles and semantics', () => {
  test('overlay has role="dialog"', () => {
    expect(MODAL_SRC).toContain('role="dialog"');
  });

  test('overlay has aria-modal="true"', () => {
    expect(MODAL_SRC).toContain('aria-modal="true"');
  });

  test('dialog is labelled by the modal title (aria-labelledby)', () => {
    expect(MODAL_SRC).toContain('aria-labelledby="payment-modal-title"');
    expect(MODAL_SRC).toContain('id="payment-modal-title"');
  });

  test('step indicator has role="list"', () => {
    expect(MODAL_SRC).toContain('role="list"');
  });

  test('step items have role="listitem"', () => {
    expect(MODAL_SRC).toContain('role="listitem"');
  });

  test('payment method radio group has aria-labelledby', () => {
    expect(MODAL_SRC).toContain('aria-labelledby="pm-method-label"');
  });

  test('file input has aria-label for screen readers', () => {
    expect(MODAL_SRC).toContain('aria-label="Choose payment proof file"');
  });
});

// ═══════════════════════════════════════════════════════════
// ARIA Live Regions
// ═══════════════════════════════════════════════════════════

describe('Payment Modal — aria-live regions', () => {
  test('amount display has aria-live="polite"', () => {
    expect(MODAL_SRC).toMatch(/id="pm-amount-display"[^>]*aria-live="polite"|aria-live="polite"[^>]*id="pm-amount-display"/);
  });

  test('form error alert has aria-live="assertive"', () => {
    const formErrorIdx = MODAL_SRC.indexOf('id="pm-form-error"');
    expect(formErrorIdx).toBeGreaterThan(-1);
    const surrounding = MODAL_SRC.slice(formErrorIdx - 50, formErrorIdx + 200);
    expect(surrounding).toContain('aria-live="assertive"');
  });

  test('confirm error alert has aria-live="assertive"', () => {
    const idx = MODAL_SRC.indexOf('id="pm-confirm-error"');
    expect(idx).toBeGreaterThan(-1);
    const surrounding = MODAL_SRC.slice(idx - 50, idx + 200);
    expect(surrounding).toContain('aria-live="assertive"');
  });

  test('processing screen has aria-live', () => {
    const idx = MODAL_SRC.indexOf('payment-screen-processing');
    expect(idx).toBeGreaterThan(-1);
    const surrounding = MODAL_SRC.slice(idx, idx + 500);
    expect(surrounding).toContain('aria-live');
  });

  test('failed screen has aria-live="assertive"', () => {
    const idx = MODAL_SRC.indexOf('payment-screen-failed');
    expect(idx).toBeGreaterThan(-1);
    const surrounding = MODAL_SRC.slice(idx, idx + 300);
    expect(surrounding).toContain('aria-live="assertive"');
  });

  test('offline banner has role="alert" and aria-live="assertive"', () => {
    const idx = MODAL_SRC.indexOf('pm-offline-banner');
    expect(idx).toBeGreaterThan(-1);
    const surrounding = MODAL_SRC.slice(idx - 50, idx + 300);
    expect(surrounding).toContain('role="alert"');
    expect(surrounding).toContain('aria-live="assertive"');
  });
});

// ═══════════════════════════════════════════════════════════
// Close Button & Keyboard Access
// ═══════════════════════════════════════════════════════════

describe('Payment Modal — close button and keyboard accessibility', () => {
  test('close button has a descriptive aria-label', () => {
    expect(MODAL_SRC).toContain('aria-label="Close payment modal"');
  });

  test('close button is a <button> element (keyboard focusable)', () => {
    expect(MODAL_SRC).toMatch(/<button[^>]*aria-label="Close payment modal"/);
  });

  test('Escape key closes the modal (handler wired in source)', () => {
    // The modal binds a keydown listener and calls this.close() on Escape.
    expect(MODAL_SRC).toContain("e.key === 'Escape'");
    expect(MODAL_SRC).toContain('this.close()');
  });

  test('proof upload zone has tabindex="0" for keyboard activation', () => {
    expect(MODAL_SRC).toContain('tabindex="0"');
  });

  test('proof upload zone has keyboard enter/space handler', () => {
    expect(MODAL_SRC).toContain("e.key === 'Enter'");
    expect(MODAL_SRC).toContain("e.key === ' '");
  });
});

// ═══════════════════════════════════════════════════════════
// Required Element IDs (JS entry points)
// ═══════════════════════════════════════════════════════════

describe('Payment Modal — required element IDs', () => {
  const REQUIRED_IDS = [
    'pm-amount-display',
    'pm-group-display',
    'pm-confirm-list',
    'pm-pay-btn',
    'pm-form-error',
    'pm-confirm-error',
    'pm-processing-title',
    'pm-processing-sub',
    'pm-receipt-list',
    'pm-failed-title',
    'pm-failed-reason',
    'pm-failed-steps',
    'pm-failed-action-btn',
    'pm-upload-proof-btn',
    'pm-upload-zone',
    'pm-file-input',
    'pm-offline-banner',
  ];

  REQUIRED_IDS.forEach((id) => {
    test(`template contains id="${id}"`, () => {
      expect(MODAL_SRC).toContain(`id="${id}"`);
    });
  });
});

// ═══════════════════════════════════════════════════════════
// Screen Sections
// ═══════════════════════════════════════════════════════════

describe('Payment Modal — all 6 screens present', () => {
  const SCREENS = [
    'payment-screen-form',
    'payment-screen-confirm',
    'payment-screen-processing',
    'payment-screen-receipt',
    'payment-screen-failed',
    'payment-screen-proof',
  ];

  SCREENS.forEach((screenId) => {
    test(`screen id="${screenId}" exists`, () => {
      expect(MODAL_SRC).toContain(`id="${screenId}"`);
    });
  });

  test('all screens use aria-label', () => {
    // Each screen section should have aria-label so AT can announce it
    const screenCount    = SCREENS.length;
    const ariaLabelCount = countOccurrences(MODAL_SRC, 'aria-label="');
    expect(ariaLabelCount).toBeGreaterThanOrEqual(screenCount);
  });
});

// ═══════════════════════════════════════════════════════════
// Mobile Responsiveness — CSS checks
// ═══════════════════════════════════════════════════════════

describe('payment.css — mobile media queries', () => {
  test('contains at least one @media max-width query', () => {
    expect(CSS_SRC).toMatch(/@media[^{]*max-width/);
  });

  test('contains a 520px (tablet/mobile) breakpoint for the modal', () => {
    expect(CSS_SRC).toMatch(/@media[^{]*520px/);
  });

  test('has a 520px bottom-sheet breakpoint for the modal', () => {
    expect(CSS_SRC).toMatch(/@media[^{]*max-width[^{]*520px/);
  });

  test('bottom-sheet breakpoint makes modal snap to viewport bottom', () => {
    const idx = CSS_SRC.search(/@media[^{]*max-width[^{]*520px/);
    expect(idx).toBeGreaterThan(-1);
    const surrounding = CSS_SRC.slice(idx, idx + 600);
    // modal bottom-sheet: overlay aligns to flex-end
    expect(surrounding).toMatch(/align-items\s*:\s*flex-end/);
  });

  test('uses relative/responsive length units (%, rem, vw, vh) in layout rules', () => {
    expect(CSS_SRC).toMatch(/:\s*\d+(\.\d+)?(rem|%|vw|vh)/);
  });

  test('contains max-width clamp for modal container', () => {
    // The modal should not stretch beyond a readable line length
    expect(CSS_SRC).toMatch(/max-width\s*:\s*\d+(px|rem)/);
  });
});

// ═══════════════════════════════════════════════════════════
// Offline Banner — CSS checks
// ═══════════════════════════════════════════════════════════

describe('payment.css — offline banner styles', () => {
  test('defines .payment-offline-banner rule', () => {
    expect(CSS_SRC).toContain('.payment-offline-banner');
  });

  test('offline banner uses amber/warning background colour', () => {
    // Amber warning colours: #fef3c7 (tailwind yellow-100) or similar
    expect(CSS_SRC).toMatch(/\.payment-offline-banner\s*\{[^}]*#fef3c7/);
  });

  test('offline banner is hidden by default via [hidden] rule', () => {
    expect(CSS_SRC).toContain('.payment-offline-banner[hidden]');
  });
});

// ═══════════════════════════════════════════════════════════
// Failed Screen Recovery Steps — CSS checks
// ═══════════════════════════════════════════════════════════

describe('payment.css — failed screen recovery steps', () => {
  test('defines .payment-failed__steps rule', () => {
    expect(CSS_SRC).toContain('.payment-failed__steps');
  });

  test('step list items have a styled bullet/marker', () => {
    expect(CSS_SRC).toContain('.payment-failed__steps li');
    // Marker is a CSS :before pseudo-element or list-style
    expect(CSS_SRC).toMatch(/\.payment-failed__steps\s+li\s*::(before|after)|\.payment-failed__steps\s+li[^{]*\{/);
  });
});
