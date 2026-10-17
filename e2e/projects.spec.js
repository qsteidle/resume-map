import { test, expect } from '@playwright/test';

// Switch to the Projects tab and wait for the bento grid to populate.
async function openProjects(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Projects' }).click();
  await expect(page.locator('.tile').first()).toBeVisible();
}

test.describe('Projects bento grid', () => {
  test('renders a tile per project with sizes and covers', async ({ page }) => {
    await openProjects(page);
    // Data-driven: one tile per project (author controls sizes/count in JSON).
    const data = await (await page.request.get('/projects.json')).json();
    await expect(page.locator('.tile')).toHaveCount(data.projects.length);
    await expect(page.locator('.tile--feature').first()).toBeVisible(); // at least one hero
    // At least one tile shows a real cover image (fallback from media).
    await expect(page.locator('.tile .cover__img').first()).toBeVisible();
  });

  test('no console errors on load', async ({ page }) => {
    const errors = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));
    await openProjects(page);
    expect(errors).toEqual([]);
  });

  test('the skill rail shows sliders and cross-highlights the grid', async ({ page }) => {
    await openProjects(page);
    const rows = page.locator('#savant .pctl');
    await expect(rows).toHaveCount(5);

    // Thin rail: first click expands to sliders; then click a skill to pin.
    const python = page.locator('#savant .pctl', { hasText: 'Python' });
    await python.click(); // expands
    await expect(page.locator('#skill-rail.is-expanded')).toBeVisible();
    await python.click(); // pins
    await expect(page.locator('.bento.is-filtering')).toBeVisible();
    // Some (but not all) tiles match — exact count is author-controlled in skills.json.
    const matched = await page.locator('.tile.is-match').count();
    const totalTiles = await page.locator('.tile').count();
    expect(matched).toBeGreaterThan(0);
    expect(matched).toBeLessThan(totalTiles);
    await expect(python).toHaveClass(/is-pinned/);

    // Clicking the pinned skill again unpins.
    await python.click();
    await expect(page.locator('.bento.is-filtering')).toHaveCount(0);
    await expect(page.locator('.tile.is-match')).toHaveCount(0);
  });

  test('hovering a tile lights up its skills in the rail', async ({ page }) => {
    await openProjects(page);
    await page.locator('.tile[data-proj="exit-velocity-model"]').hover();
    await expect(page.locator('#savant .pctl.is-hot').first()).toBeVisible();
  });

  test('clicking a tile expands a detail panel below the header', async ({ page }) => {
    await openProjects(page);
    await page.locator('.tile[data-proj="exit-velocity-model"]').click();

    const layer = page.locator('#proj-detail-layer');
    await expect(layer).toBeVisible();
    await expect(page.locator('#proj-detail-title')).toHaveText(/Exit Velocity/);

    // "Below the header": the header stays visible and the detail starts under it.
    const header = page.locator('.header');
    await expect(header).toBeVisible();
    const hb = await header.boundingBox();
    const db = await page.locator('.proj-detail').boundingBox();
    expect(db.y).toBeGreaterThanOrEqual(hb.y + hb.height - 2);

    // Bold keywords render.
    await expect(page.locator('.proj-detail .detail-list strong').first()).toBeVisible();
    // Bullet text stays one wrapping block (not fragmented into columns by the bold spans).
    const li = await page.locator('.proj-detail .detail-list li').first().boundingBox();
    const span = await page.locator('.proj-detail .detail-list li > span').first().boundingBox();
    expect(span.width).toBeGreaterThan(li.width * 0.7);

    // No page scroll — the app stays a fixed viewport.
    const scrolls = await page.evaluate(
      () => document.documentElement.scrollHeight > window.innerHeight + 1
    );
    expect(scrolls).toBe(false);
  });

  test('detail closes with the button and with Escape', async ({ page }) => {
    await openProjects(page);
    await page.locator('.tile[data-proj="hof-pitcher-model"]').click();
    await expect(page.locator('#proj-detail-layer')).toBeVisible();
    await page.locator('#proj-detail-close').click();
    await expect(page.locator('#proj-detail-layer')).toBeHidden();

    await page.locator('.tile[data-proj="hof-pitcher-model"]').click();
    await expect(page.locator('#proj-detail-layer')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#proj-detail-layer')).toBeHidden();
  });

  test('detail body content fits its box (fit-scaler) on a dense project', async ({ page }) => {
    await openProjects(page);
    // Capstone has 6 long bullets — a stress test for the fit scaler.
    await page.locator('.tile[data-proj="pitching-biomechanics-capstone"]').click();
    await expect(page.locator('#proj-detail-title')).toBeVisible();
    const fits = await page.evaluate(() => {
      const body = document.querySelector('.proj-detail__body');
      return body.scrollHeight <= body.clientHeight + 2 ||
        document.querySelector('.proj-detail').classList.contains('is-scrolling');
    });
    expect(fits).toBe(true);
  });

  test('respects reduced motion (detail still opens)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openProjects(page);
    await page.locator('.tile[data-proj="repasito-spanish-flashcards"]').click();
    await expect(page.locator('#proj-detail-layer')).toBeVisible();
    await expect(page.locator('#proj-detail-title')).toHaveText(/Repasito/);
  });

  test('search opens a project detail from any tab', async ({ page }) => {
    await page.goto('/');
    await page.locator('#search-input').fill('Fenway');
    await page.locator('.search-result').first().click();
    await expect(page.locator('#proj-detail-layer')).toBeVisible();
    await expect(page.locator('#proj-detail-title')).toHaveText(/Fenway/);
  });

  test('the skill rail sits to the right of the grid', async ({ page }) => {
    await openProjects(page);
    const bento = await page.locator('#bento').boundingBox();
    const rail = await page.locator('#skill-rail').boundingBox();
    expect(rail.x).toBeGreaterThan(bento.x + bento.width / 2);
  });

  test('video covers autoplay on a loop (muted)', async ({ page }) => {
    await openProjects(page);
    const vid = page.locator('.tile[data-proj="fenway-baseball-trajectory-sim"] video.cover__img');
    await expect(vid).toHaveJSProperty('loop', true);
    await expect(vid).toHaveJSProperty('autoplay', true);
    await expect(vid).toHaveJSProperty('muted', true);
  });

  test('the rail is a thin dot list with no toggle button or explainer', async ({ page }) => {
    await openProjects(page);
    await expect(page.locator('#skill-rail-toggle')).toHaveCount(0);
    await expect(page.locator('#skills-note')).toHaveCount(0);
    // Each skill shows a marker dot; the gradient track bar is collapsed away.
    await expect(page.locator('#savant .pctl__marker').first()).toBeVisible();
    const bg = await page.locator('#savant .pctl__track').first()
      .evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(bg).toBe('none');
    const rail = await page.locator('#skill-rail').boundingBox();
    expect(rail.width).toBeLessThan(140);
  });

  test('clicking the rail expands it to full sliders; Escape collapses', async ({ page }) => {
    await openProjects(page);
    const rail = page.locator('#skill-rail');
    await expect(rail).not.toHaveClass(/is-expanded/);
    await rail.click();
    await expect(rail).toHaveClass(/is-expanded/);
    // The gradient track bar is now shown.
    const bg = await page.locator('#savant .pctl__track').first()
      .evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(bg).toContain('gradient');
    await page.keyboard.press('Escape');
    await expect(rail).not.toHaveClass(/is-expanded/);
  });

  test('tiles have no index numbers', async ({ page }) => {
    await openProjects(page);
    await expect(page.locator('.tile__num')).toHaveCount(0);
  });

  test('resume-map: welcome text on the tile, arrow + snark in the detail', async ({ page }) => {
    await openProjects(page);
    const tile = page.locator('.tile[data-proj="interactive-resume-map"]');
    // Outside (tile): welcome text, no arrow.
    await expect(tile.locator('.cover--welcome')).toContainText(/welcome/i);
    await expect(tile.locator('.cover__arrow')).toHaveCount(0);

    // Inside (detail): arrow aimed at Resume + a snarky message.
    await tile.click();
    await expect(page.locator('.proj-detail__pointer')).toBeVisible();
    await expect(page.locator('.proj-detail__snark')).not.toBeEmpty();
    const transform = await page.locator('.proj-detail__pointer .cover__arrow')
      .evaluate((el) => getComputedStyle(el).transform);
    expect(transform).not.toBe('none'); // rotated to aim at the button
  });

  test('feature tiles are centered in the grid', async ({ page }) => {
    await openProjects(page);
    const fb = await page.locator('.tile--feature').first().boundingBox();
    const bb = await page.locator('#bento').boundingBox();
    const featureCenter = fb.x + fb.width / 2;
    const gridCenter = bb.x + bb.width / 2;
    expect(Math.abs(featureCenter - gridCenter)).toBeLessThan(fb.width * 0.6);
  });

  test('detail shows all media at once, with links in the media column', async ({ page }) => {
    await openProjects(page);
    // CFD study has 4 images — all should render simultaneously.
    await page.locator('.tile[data-proj="baseball-cfd-magnus-sim"]').click();
    await expect(page.locator('.proj-detail__gallery .gcell')).toHaveCount(4);
    await page.keyboard.press('Escape');

    // Capstone has links — they live in the media column, not under the copy.
    await page.locator('.tile[data-proj="pitching-biomechanics-capstone"]').click();
    await expect(page.locator('.proj-detail__media .proj-links a')).toHaveCount(2);
    await expect(page.locator('.proj-detail__body .proj-links')).toHaveCount(0);
  });
});
