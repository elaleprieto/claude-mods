import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// WCAG 2.1 AA plus axe best practices.
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'];

// Fails with the rule and offending HTML of every violation, so the report says what to fix.
async function expectNoViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  const report = violations
    .map(
      (violation) =>
        `[${violation.impact ?? 'unknown'}] ${violation.id}: ${violation.help}\n${violation.nodes.map((node) => `    ${node.html}`).join('\n')}`
    )
    .join('\n\n');

  expect(
    violations.map((violation) => violation.id),
    report
  ).toEqual([]);
}

// One test per screen or UI state worth scanning: open menus, dialogs and loaded results too.
test('home page has no axe violations', async ({ page }) => {
  await page.goto('/');

  await expectNoViolations(page);
});
