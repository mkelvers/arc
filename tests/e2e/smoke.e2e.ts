import { expect, test } from "@playwright/test";

test("redirects protected pages to login", async ({ page }) => {
  const response = await page.goto("/");

  expect(response?.status()).toBeLessThan(400);
  await expect(page).toHaveURL(/\/login$/u);
});

test("renders the login page", async ({ page }) => {
  await page.goto("/login");

  await expect(page.getByRole("textbox", { name: /email address/iu })).toBeVisible();
  await expect(page.locator('input[name="password"]')).toBeVisible();
  await expect(page.getByRole("button", { name: /sign in/iu })).toBeVisible();
});

test("serves static assets without authentication", async ({ request }) => {
  const response = await request.get("/dist/tailwind.css");

  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/css");
});
