import { test, expect } from "@playwright/test";
import { installFakeHass, mountCard, MEDICATIONS, PERSONS } from "./support/fake-hass";

for (const hassAfterConnect of [false, true]) {
    test(`renders the person tabs and a spinner while records load (hass ${hassAfterConnect ? "after" : "before"} connect)`, async ({ page }) => {
        await installFakeHass(page, { holdRecords: true });
        await mountCard(page, { hassAfterConnect });

        const card = page.locator("medilog-card");
        await expect(card.locator(".tab-person")).toHaveText(PERSONS.map((person) => person.name));
        await expect(card.locator("medilog-person-detail ha-spinner")).toBeAttached();
        await expect(card.locator("ha-circular-progress")).toHaveCount(0);

        await page.evaluate(() => window.__releaseRecords());
        await expect(card.locator("medilog-person-detail ha-spinner")).toHaveCount(0);
    });
}

test("the Usage view's select lists the medications and loads the picked one's usage", async ({ page }) => {
    await installFakeHass(page);
    await mountCard(page);

    const card = page.locator("medilog-card");
    await card.locator(".tab").last().click();
    await card.locator("medilog-medications-manager .view-toggle ha-button").nth(1).dispatchEvent("click");

    const select = card.locator("medilog-medications-usage ha-select");
    const labels = [...MEDICATIONS]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((med) => `${med.name}${med.units ? ` (${med.units})` : ""}`);
    await expect(select.locator("button[data-item]")).toHaveText(["", ...labels]);

    await select.locator('button[data-item="med-paralen"]').click();
    await expect(card.locator("medilog-medications-usage ha-expansion-panel")).toHaveCount(1);
    await expect(card.locator("medilog-medications-usage ha-expansion-panel")).toHaveJSProperty("header", "Alice (1 záznam)");
});
