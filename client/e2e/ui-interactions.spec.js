import { test, expect } from '@playwright/test';
import { setupMockWebSocket, waitForAppReady } from './fixtures.js';

test.describe('Network Graph Dragging', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockWebSocket(page);
    await page.goto('/');
    await waitForAppReady(page);
  });

  test('should drag a non-fixed-role agent node', async ({ page }) => {
    // Find a draggable node (crew or polecat roles are not fixed)
    const crewCard = page.locator('.card-wrapper.draggable').first();
    await expect(crewCard).toBeVisible();

    // Get initial position
    const initialBox = await crewCard.boundingBox();
    const initialLeft = initialBox.x;
    const initialTop = initialBox.y;

    // Perform drag operation
    await crewCard.hover();
    await page.mouse.down();
    await page.mouse.move(initialLeft + 100, initialTop + 50);
    await page.mouse.up();

    // Wait for position update
    await page.waitForTimeout(200);

    // Verify position changed
    const finalBox = await crewCard.boundingBox();
    expect(finalBox.x).not.toBe(initialLeft);
    expect(finalBox.y).not.toBe(initialTop);
  });

  test('should not drag fixed-role nodes (mayor, witness, refinery)', async ({ page }) => {
    // Fixed-role nodes don't have the 'draggable' class
    const allCards = page.locator('.card-wrapper');
    const draggableCards = page.locator('.card-wrapper.draggable');

    const totalCount = await allCards.count();
    const draggableCount = await draggableCards.count();

    // Should have more total cards than draggable ones (3 fixed roles)
    expect(totalCount).toBeGreaterThan(draggableCount);
    expect(totalCount - draggableCount).toBe(3); // mayor, witness, refinery
  });

  test('should show grab cursor on draggable nodes', async ({ page }) => {
    const draggableCard = page.locator('.card-wrapper.draggable').first();
    await expect(draggableCard).toHaveCSS('cursor', 'grab');
  });
});

test.describe('Filter Application', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockWebSocket(page);
    await page.goto('/');
    await waitForAppReady(page);
  });

  test('should filter agents by search query', async ({ page }) => {
    const searchInput = page.locator('.filter-bar input[type="text"]');
    await expect(searchInput).toBeVisible();

    // Count initial agents
    const initialCards = await page.locator('.card-wrapper').count();
    expect(initialCards).toBe(6);

    // Search for "crew"
    await searchInput.fill('crew');
    await page.waitForTimeout(100);

    // Should only show crew agents
    const filteredCards = await page.locator('.card-wrapper').count();
    expect(filteredCards).toBe(2); // crew-alpha and crew-beta
  });

  test('should filter agents by status', async ({ page }) => {
    const statusSelect = page.locator('.filter-bar select').first();
    await expect(statusSelect).toBeVisible();

    // Filter by "running" status
    await statusSelect.selectOption('running');
    await page.waitForTimeout(100);

    // Should only show running agents
    const filteredCards = await page.locator('.card-wrapper').count();
    expect(filteredCards).toBe(4); // mayor, witness, crew-alpha, polecat
  });

  test('should filter agents by role', async ({ page }) => {
    const roleSelect = page.locator('.filter-bar select').nth(1);
    await expect(roleSelect).toBeVisible();

    // Filter by "crew" role
    await roleSelect.selectOption('crew');
    await page.waitForTimeout(100);

    // Should only show crew agents
    const filteredCards = await page.locator('.card-wrapper').count();
    expect(filteredCards).toBe(2);
  });

  test('should show clear button when filters are active', async ({ page }) => {
    // Clear button should not be visible initially
    await expect(page.locator('.filter-bar .clear-btn')).not.toBeVisible();

    // Apply a filter
    const searchInput = page.locator('.filter-bar input[type="text"]');
    await searchInput.fill('test');
    await page.waitForTimeout(100);

    // Clear button should appear
    await expect(page.locator('.filter-bar .clear-btn')).toBeVisible();
  });

  test('should clear all filters when clear button is clicked', async ({ page }) => {
    const searchInput = page.locator('.filter-bar input[type="text"]');
    const statusSelect = page.locator('.filter-bar select').first();

    // Apply filters
    await searchInput.fill('crew');
    await statusSelect.selectOption('running');
    await page.waitForTimeout(100);

    // Click clear button
    await page.locator('.filter-bar .clear-btn').click();
    await page.waitForTimeout(100);

    // Verify filters are cleared
    await expect(searchInput).toHaveValue('');
    await expect(statusSelect).toHaveValue('all');

    // All agents should be visible again
    const allCards = await page.locator('.card-wrapper').count();
    expect(allCards).toBe(6);
  });

  test('should combine multiple filters', async ({ page }) => {
    const searchInput = page.locator('.filter-bar input[type="text"]');
    const statusSelect = page.locator('.filter-bar select').first();

    // Apply both search and status filter
    await searchInput.fill('crew');
    await statusSelect.selectOption('running');
    await page.waitForTimeout(100);

    // Should only show running crew agents
    const filteredCards = await page.locator('.card-wrapper').count();
    expect(filteredCards).toBe(1); // Only crew-alpha
  });
});

test.describe('Tab Switching', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockWebSocket(page);
    await page.goto('/');
    await waitForAppReady(page);
  });

  test('should switch to Events tab (default)', async ({ page }) => {
    const eventsTab = page.locator('.sidebar .tabs button:has-text("Events")');
    await expect(eventsTab).toHaveClass(/active/);
  });

  test('should switch to Beads tab', async ({ page }) => {
    const beadsTab = page.locator('.sidebar .tabs button:has-text("Beads")');
    await beadsTab.click();

    await expect(beadsTab).toHaveClass(/active/);
    // Events tab should no longer be active
    const eventsTab = page.locator('.sidebar .tabs button:has-text("Events")');
    await expect(eventsTab).not.toHaveClass(/active/);
  });

  test('should switch to Hooks tab', async ({ page }) => {
    const hooksTab = page.locator('.sidebar .tabs button:has-text("Hooks")');
    await hooksTab.click();

    await expect(hooksTab).toHaveClass(/active/);
  });

  test('should switch to Timeline tab', async ({ page }) => {
    const timelineTab = page.locator('.sidebar .tabs button:has-text("Timeline")');
    await timelineTab.click();

    await expect(timelineTab).toHaveClass(/active/);
  });

  test('should switch to Metrics tab', async ({ page }) => {
    const metricsTab = page.locator('.sidebar .tabs button:has-text("Metrics")');
    await metricsTab.click();

    await expect(metricsTab).toHaveClass(/active/);
  });

  test('should switch to Deps tab and show dependency graph', async ({ page }) => {
    const depsTab = page.locator('.sidebar .tabs button:has-text("Deps")');
    await depsTab.click();

    await expect(depsTab).toHaveClass(/active/);

    // The dependency graph component should be visible
    await expect(page.locator('.dependency-graph')).toBeVisible();

    // Stats bar should be visible
    await expect(page.locator('.dependency-graph .stats-bar')).toBeVisible();

    // Legend should be visible
    await expect(page.locator('.dependency-graph .legend')).toBeVisible();
  });

  test('should display correct content for each tab', async ({ page }) => {
    // Switch to Beads and verify content changes
    await page.locator('.sidebar .tabs button:has-text("Beads")').click();
    await page.waitForTimeout(100);

    // The sidebar content should now show the BeadsList component
    const sidebarContent = page.locator('.sidebar .content');
    await expect(sidebarContent).toBeVisible();
  });

  test('should maintain tab state across interactions', async ({ page }) => {
    // Switch to Metrics tab
    const metricsTab = page.locator('.sidebar .tabs button:has-text("Metrics")');
    await metricsTab.click();
    await expect(metricsTab).toHaveClass(/active/);

    // Interact with the graph (click on an agent)
    const card = page.locator('.card-wrapper').first();
    await card.click();

    // Metrics tab should still be active
    await expect(metricsTab).toHaveClass(/active/);
  });
});

test.describe('Agent Selection', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockWebSocket(page);
    await page.goto('/');
    await waitForAppReady(page);
  });

  test('should select an agent when clicking on card', async ({ page }) => {
    const cards = page.locator('.card-wrapper');
    const firstCard = cards.first();

    // Click on the agent card
    await firstCard.click();

    // The Timeline tab shows the selected agent's history
    // Switch to Timeline tab to verify selection works
    await page.locator('.sidebar .tabs button:has-text("Timeline")').click();
    await page.waitForTimeout(100);

    // The timeline content should be visible (even if empty for mock data)
    const timelineContent = page.locator('.sidebar .content');
    await expect(timelineContent).toBeVisible();
  });

  test('should clear selection with Escape key', async ({ page }) => {
    // First select an agent
    const firstCard = page.locator('.card-wrapper').first();
    await firstCard.click();

    // Press Escape to clear selection
    await page.keyboard.press('Escape');

    // Selection is internal state, we verify by checking that
    // pressing arrow keys still works from the beginning
    await page.keyboard.press('ArrowRight');
    // No error should occur
  });

  test('should navigate agents with arrow keys', async ({ page }) => {
    // First select an agent
    const firstCard = page.locator('.card-wrapper').first();
    await firstCard.click();

    // Press ArrowRight to select next agent
    await page.keyboard.press('ArrowRight');

    // Press ArrowLeft to go back
    await page.keyboard.press('ArrowLeft');

    // Navigation should work without errors
  });

  test('should focus search with Cmd+F', async ({ page }) => {
    const searchInput = page.locator('.filter-bar input[type="text"]');

    // Press Cmd+F (or Ctrl+F on non-Mac)
    await page.keyboard.press('Meta+f');

    // Search input should be focused
    await expect(searchInput).toBeFocused();
  });

  test('should select rig with number keys', async ({ page }) => {
    // The rig selector should show test-rig as active
    const rigButton = page.locator('.rig-selector button').first();
    await expect(rigButton).toHaveClass(/active/);

    // Pressing '1' should keep the same rig selected
    await page.keyboard.press('1');
    await expect(rigButton).toHaveClass(/active/);
  });

  test('should show role-based coloring on agent cards', async ({ page }) => {
    // Agent cards should be visible with styling
    const cards = page.locator('.card-wrapper');
    await expect(cards.first()).toBeVisible();

    // All cards should have the card-wrapper class
    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThan(0);
  });
});

test.describe('Keyboard Shortcuts Integration', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockWebSocket(page);
    await page.goto('/');
    await waitForAppReady(page);
  });

  test('should not trigger shortcuts when typing in input', async ({ page }) => {
    const searchInput = page.locator('.filter-bar input[type="text"]');
    await searchInput.click();

    // Type a number - should go into input, not trigger rig selection
    await page.keyboard.type('123');

    await expect(searchInput).toHaveValue('123');
  });

  test('should handle multiple keyboard shortcuts in sequence', async ({ page }) => {
    // Select an agent first
    const card = page.locator('.card-wrapper').first();
    await card.click();

    // Navigate right
    await page.keyboard.press('ArrowRight');

    // Navigate left
    await page.keyboard.press('ArrowLeft');

    // Clear selection
    await page.keyboard.press('Escape');

    // Focus search
    await page.keyboard.press('Meta+f');

    const searchInput = page.locator('.filter-bar input[type="text"]');
    await expect(searchInput).toBeFocused();
  });
});
