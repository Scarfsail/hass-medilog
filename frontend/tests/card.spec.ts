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
    await card.locator('medilog-medications-manager ha-button-toggle-group button[data-value="usage"]').click();

    const select = card.locator("medilog-medications-usage ha-select");
    const labels = [...MEDICATIONS]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((med) => `${med.name}${med.units ? ` (${med.units})` : ""}`);
    await expect(select.locator("button[data-item]")).toHaveText(["", ...labels]);

    await select.locator('button[data-item="med-paralen"]').click();
    await expect(card.locator("medilog-medications-usage ha-expansion-panel")).toHaveCount(1);
    await expect(card.locator("medilog-medications-usage ha-expansion-panel")).toHaveJSProperty("header", "Alice (1 záznam)");
});

test("with get_records failing, picking a medication in Usage fetches once per person, not in a loop", async ({ page }) => {
    const reason = "Integrace medilog není načtena";
    await installFakeHass(page, { reject: { get_records: reason } });
    await mountCard(page);

    const card = page.locator("medilog-card");
    await card.locator(".tab").last().click();
    await card.locator('medilog-medications-manager ha-button-toggle-group button[data-value="usage"]').click();
    const usage = card.locator("medilog-medications-usage");
    await expect(usage.locator("ha-select")).toBeAttached();

    const recordCalls = () => page.evaluate(() => window.__serviceCalls.filter((call) => call.service === "get_records").length);
    const toasts = () => page.evaluate(() => window.__notifications.length);
    const callsBefore = await recordCalls();
    const toastsBefore = await toasts();

    await usage.locator('ha-select button[data-item="med-paralen"]').click();
    await expect(usage.getByText("Žádné záznamy pro vybraný lék")).toBeVisible();
    // A loop would keep calling; give it time to show.
    await page.waitForTimeout(500);
    expect(await recordCalls() - callsBefore).toBeLessThanOrEqual(PERSONS.length);
    expect(await toasts() - toastsBefore).toBeLessThanOrEqual(PERSONS.length);
});

test("opening Medications loads every person's records at once", async ({ page }) => {
    await installFakeHass(page, { holdRecords: true });
    await mountCard(page);

    const card = page.locator("medilog-card");
    await expect(card.locator(".tab-person")).toHaveCount(PERSONS.length);
    await card.locator(".tab").last().click();

    // All calls are out while none has returned, each person asked for once.
    const recordCalls = () => page.evaluate(() => window.__serviceCalls
        .filter((call) => call.service === "get_records")
        .map((call) => call.data.person_id as string)
        .sort());
    await expect.poll(recordCalls).toEqual(PERSONS.map((person) => person.entity));

    await page.evaluate(() => window.__releaseRecords());
    await expect(card.locator("medilog-medications-table .usage-cell")).toHaveText(["1", "1"]);
    expect(await recordCalls()).toHaveLength(PERSONS.length);
});

test("HA's form elements load only once a dialog opens", async ({ page }) => {
    await installFakeHass(page);
    await mountCard(page);

    const rows = page.locator("medilog-card medilog-records-table tbody tr:not(.date-separator)");
    await expect(rows).toHaveCount(2);
    expect(await page.evaluate(() => window.__panelResolversCreated)).toBe(0);

    await rows.first().click();
    await expect.poll(() => page.evaluate(() => window.__panelResolversCreated)).toBe(1);
});

test("elapsed times tick with the clock", async ({ page }) => {
    await page.clock.install({ time: new Date("2026-11-24T12:30:00Z") });
    await installFakeHass(page);
    await mountCard(page);

    const elapsed = page.locator("medilog-card medilog-records-table tbody tr:not(.date-separator) td:nth-child(2)").first();
    await expect(elapsed).toHaveText("30m");

    await page.clock.runFor(2 * 60_000);
    await expect(elapsed).toHaveText("32m");
});

test("a rejected save shows HA's toast and leaves the dialog open", async ({ page }) => {
    const reason = "Záznam nelze uložit";
    await installFakeHass(page, { reject: { add_or_update_record: reason } });
    // HA's form elements already registered, so the dialog opens without a chunk walk.
    await page.evaluate(() => ["ha-input", "ha-selector"].forEach((tag) => customElements.define(tag, class extends HTMLElement {})));
    await mountCard(page);

    await page.locator("medilog-card medilog-records-table tbody tr:not(.date-separator)").first().click();
    const dialog = page.locator("medilog-record-detail-dialog ha-dialog");
    await expect(dialog).toBeAttached();

    const note = dialog.locator("ha-input").last();
    await note.evaluate((input: HTMLElement & { value: string }) => {
        input.value = "edited note";
        input.dispatchEvent(new Event("change"));
    });

    await dialog.locator('ha-button[appearance="accent"]').dispatchEvent("click");
    await expect.poll(() => page.evaluate(() => window.__notifications)).toEqual([reason]);
    await expect(dialog).toBeAttached();
    await expect(note).toHaveJSProperty("value", "edited note");
});

test("a rejected medication save shows HA's toast once and leaves the dialog open", async ({ page }) => {
    const reason = "Lék nelze uložit";
    const alerts: string[] = [];
    page.on("dialog", (dialog) => {
        alerts.push(dialog.message());
        void dialog.dismiss();
    });
    await installFakeHass(page, { reject: { add_or_update_medication: reason } });
    await page.evaluate(() => ["ha-input", "ha-selector"].forEach((tag) => customElements.define(tag, class extends HTMLElement {})));
    await mountCard(page);

    await page.locator("medilog-card .tab").last().click();
    await page.locator("medilog-card medilog-medications-table tbody tr").first().click();
    const dialog = page.locator("medilog-medication-dialog ha-dialog");
    await expect(dialog).toBeAttached();

    await dialog.locator('ha-button[appearance="accent"]').dispatchEvent("click");
    await expect.poll(() => page.evaluate(() => window.__notifications)).toEqual([reason]);
    await expect(dialog).toBeAttached();
    await expect(dialog.locator(".error")).toHaveCount(0);
    await expect(dialog).not.toContainText(reason);
    expect(alerts).toEqual([]);
});

test("a record added between ticks never shows a negative elapsed time", async ({ page }) => {
    await page.clock.install({ time: new Date("2026-11-24T12:30:00Z") });
    await installFakeHass(page);
    await page.evaluate(() => ["ha-input", "ha-selector"].forEach((tag) => customElements.define(tag, class extends HTMLElement {})));
    await mountCard(page);

    const rows = page.locator("medilog-card medilog-records-table tbody tr:not(.date-separator)");
    await expect(rows).toHaveCount(2);

    // 30 s after mount, before the first 60 s tick: the saved record is dated "now".
    await page.clock.runFor(30_000);
    await rows.first().click();
    const dialog = page.locator("medilog-record-detail-dialog ha-dialog");
    await expect(dialog).toBeAttached();
    await dialog.locator('ha-button[appearance="accent"]').dispatchEvent("click");

    await expect(rows).toHaveCount(3);
    const elapsed = await rows.locator("td:nth-child(2)").allTextContents();
    expect(elapsed.filter((text) => text.includes("-"))).toEqual([]);
});
