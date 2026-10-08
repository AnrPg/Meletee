// Playwright's test with one option: requireAccount. Meletee needs an account by default (config.js);
// most specs test the app itself, so they run with requireAccount off unless a spec turns it on with
// test.use({ requireAccount: true }) (tests/account.spec.js). config.js assigns window.MELETEE_CONFIG
// itself, so the override is a setter installed before any script of the page runs.
import { test as base, expect } from '@playwright/test';

export const noAccountGate = () => {
  let c;
  Object.defineProperty(window, 'MELETEE_CONFIG', {
    configurable: true,
    get: () => c,
    set: (v) => { c = { ...v, requireAccount: false }; },
  });
};

export const test = base.extend({
  requireAccount: [false, { option: true }],
  context: async ({ context, requireAccount }, use) => {
    if (!requireAccount) await context.addInitScript(noAccountGate);
    await use(context);
  },
});

export { expect };
