import type { Page } from "@playwright/test";

import { expect, test } from "@playwright/test";

const username = process.env.E2E_USERNAME ?? "e2e@example.com";
const password = process.env.E2E_PASSWORD ?? "e2e-password";

const signIn = async (page: Page) => {
  const response = await page.request.post("/login", { form: { username, password } });

  expect(response.status()).toBeLessThan(400);
};

const signInThroughUI = async (page: Page) => {
  await page.goto("/login");
  await page.getByRole("textbox", { name: /email address/iu }).fill(username);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: /sign in/iu }).click();
  await expect(page).toHaveURL(/\/$/u);
};

test("redirects protected pages to login", async ({ page }) => {
  const response = await page.goto("/");

  expect(response?.status()).toBeLessThan(400);
  await expect(page).toHaveURL(/\/login$/u);
});

test("renders the login page", async ({ page }) => {
  await page.goto("/login");

  await expect(page).toHaveTitle(/MyAnimeList: Login/u);
  await expect(page.getByRole("textbox", { name: /email address/iu })).toBeVisible();
  await expect(page.locator('input[name="password"]')).toBeVisible();
  await expect(page.getByRole("button", { name: /sign in/iu })).toBeVisible();
});

test("shows an error for invalid credentials", async ({ page }) => {
  await page.goto("/login");

  await page.getByRole("textbox", { name: /email address/iu }).fill(username);
  await page.locator('input[name="password"]').fill("wrong-password");
  await page.getByRole("button", { name: /sign in/iu }).click();

  await expect(page).toHaveURL(/\/login$/u);
  await expect(page.getByRole("alert")).toContainText(/invalid username or password/iu);
});

test("toggles password visibility on the login page", async ({ page }) => {
  await page.goto("/login");

  const passwordInput = page.locator('input[name="password"]');
  await expect(passwordInput).toHaveAttribute("type", "password");

  await page.getByRole("button", { name: /show password/iu }).click();
  await expect(passwordInput).toHaveAttribute("type", "text");
  await expect(page.getByRole("button", { name: /hide password/iu })).toBeVisible();

  await page.getByRole("button", { name: /hide password/iu }).click();
  await expect(passwordInput).toHaveAttribute("type", "password");
});

test("signs in and renders authenticated home navigation", async ({ page }) => {
  const airingResponse = (async () => {
    try {
      return await page.waitForResponse(
        (response) => response.url().includes("/api/catalog/airing"),
        { timeout: 10_000 },
      );
    } catch {
      return undefined;
    }
  })();

  await signInThroughUI(page);

  const primaryNavigation = page.getByRole("navigation", { name: /primary navigation/iu });
  await expect(page).toHaveTitle(/MyAnimeList: Home/u);
  await expect(primaryNavigation).toBeVisible();
  await expect(primaryNavigation.getByRole("link", { name: "Browse", exact: true })).toBeVisible();
  await expect(
    primaryNavigation.getByRole("link", { name: "Top Picks", exact: true }),
  ).toBeVisible();
  await expect(
    primaryNavigation.getByRole("link", { name: "Watchlist", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: /airing & popular/iu })).toBeVisible();
  await airingResponse;
});

test("renders login page even with an existing session", async ({ page }) => {
  await signIn(page);

  const response = await page.goto("/login");

  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL(/\/login$/u);
  await expect(page.getByRole("button", { name: /sign in/iu })).toBeVisible();
});

test("renders the empty watchlist state", async ({ page }) => {
  await signIn(page);

  await page.goto("/watchlist");

  await expect(page).toHaveURL(/\/watchlist$/u);
  await expect(page.getByRole("heading", { name: /^watchlist$/iu })).toBeVisible();
  await expect(page.getByText(/your watchlist is empty/iu)).toBeVisible();
  await expect(page.getByRole("button", { name: /^all$/iu })).toBeVisible();
  await expect(page.getByRole("button", { name: /watching/iu })).toBeVisible();
  await expect(page.getByRole("link", { name: /go home/iu })).toBeVisible();
});

test("renders the authenticated search page", async ({ page }) => {
  await signIn(page);

  await page.goto("/search");

  await expect(page).toHaveURL(/\/search$/u);
  await expect(page).toHaveTitle(/MyAnimeList: Search/u);
  await expect(page.getByRole("searchbox", { name: /search anime/iu })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: /search anime/iu })).toHaveAttribute(
    "placeholder",
    "Search anime...",
  );
});

test("logs out and protects pages again", async ({ page }) => {
  await signIn(page);

  await page.goto("/logout");
  await expect(page).toHaveURL(/\/login$/u);

  await page.goto("/watchlist");
  await expect(page).toHaveURL(/\/login$/u);
});

test("returns an API token for valid credentials", async ({ request }) => {
  const response = await request.post("/api/auth/login", {
    data: { username, password, name: "playwright" },
  });

  expect(response.status()).toBe(200);
  const body = (await response.json()) as { token?: string; user?: { username?: string } };
  expect(body.token).toEqual(expect.any(String));
  expect(body.user?.username).toBe(username);
});

test("rejects invalid API login payloads and credentials", async ({ request }) => {
  const missingPassword = await request.post("/api/auth/login", { data: { username } });
  expect(missingPassword.status()).toBe(400);

  const wrongPassword = await request.post("/api/auth/login", {
    data: { username, password: "wrong-password" },
  });
  expect(wrongPassword.status()).toBe(401);
});

test("protects API routes without a valid session", async ({ request }) => {
  const response = await request.get("/api/search-quick?q=");

  expect(response.status()).toBe(401);
  await expect(response.json()).resolves.toMatchObject({ error: "Unauthorized" });
});

test("allows authenticated API requests with a bearer token", async ({ request }) => {
  const login = await request.post("/api/auth/login", {
    data: { username, password, name: "playwright-api" },
  });
  const body = (await login.json()) as { token: string };

  const response = await request.get("/api/search-quick?q=", {
    headers: { Authorization: `Bearer ${body.token}` },
  });

  expect(response.status()).toBe(200);
  await expect(response.json()).resolves.toEqual([]);
});

test("serves static assets without authentication", async ({ request }) => {
  const response = await request.get("/dist/tailwind.css");

  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/css");
});

test("serves app assets and the manifest without authentication", async ({ request }) => {
  const [appScript, manifest] = await Promise.all([
    request.get("/dist/static/app.js"),
    request.get("/static/assets/manifest.json"),
  ]);

  expect(appScript.status()).toBe(200);
  expect(appScript.headers()["content-type"]).toContain("javascript");
  expect(manifest.status()).toBe(200);
  expect(manifest.headers()["content-type"]).toContain("application/json");
});
