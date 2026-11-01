import { test, expect } from "@playwright/test";
import { seedF035Fixture, SHOP, DRAFT_SHOP } from "../fixtures/F035-shop";

// #1139 (Don, 2026-11-01) — a Page lives at /<place>-<st>/<page-slug>. The F035 Shop is pinned downtown Sacramento,
// so its address is /sacramento-ca/oak-park-sourdough (with a suffix when another fixture's Page took the name first);
// its old /g/<id> link forwards there with a 301.

const ADDRESS = /^\/sacramento-ca\/oak-park-sourdough(-[a-z0-9-]+)?$/;

test.beforeAll(async () => {
  await seedF035Fixture();
});

test.describe("readable addresses", () => {
  test("the old /g/<id> link forwards permanently to the readable address, which opens the Page and names itself", async ({ page }) => {
    const res = await page.goto(SHOP.url);
    const address = new URL(page.url()).pathname;
    expect(address).toMatch(ADDRESS);
    expect(res?.status()).toBe(200);
    expect((await res?.request().redirectedFrom()?.response())?.status()).toBe(301);

    expect((await page.goto(address))?.status()).toBe(200);
    await expect(page.getByTestId("shop-name")).toHaveText(SHOP.brandName);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`${address}$`));
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", new RegExp(`${address}$`));
  });

  test("an unknown place or Page is not found, and a draft is never forwarded", async ({ page }) => {
    expect((await page.goto("/sacramento-ca/no-such-page-1139"))?.status()).toBe(404);
    expect((await page.goto("/nowhere-zz/oak-park-sourdough"))?.status()).toBe(404);
    await page.goto(DRAFT_SHOP.url);
    expect(new URL(page.url()).pathname).toBe(DRAFT_SHOP.url);
  });
});
