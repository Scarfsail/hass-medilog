import { test, expect, type Page } from "@playwright/test";
import { installFakeHass, mountCard } from "./support/fake-hass";

// Record times show in local time; pin it so the summaries read the same anywhere.
test.use({ timezoneId: "UTC" });

/** Mount the card with HA's form elements already registered, so dialogs open without a chunk walk. */
async function mountWithForms(page: Page): Promise<void> {
    await installFakeHass(page);
    await page.evaluate(() => ["ha-input", "ha-selector"].forEach((tag) => customElements.define(tag, class extends HTMLElement {})));
    await mountCard(page);
}

const card = (page: Page) => page.locator("medilog-card");
const recordRows = (page: Page) => card(page).locator("medilog-records-table tbody tr:not(.date-separator)");
const savedTemperatures = (page: Page) => page.evaluate(() => window.__serviceCalls
    .filter((call) => call.service === "add_or_update_record")
    .map((call) => call.data.temperature));

test("each view switch is a toggle group that changes the view", async ({ page }) => {
    await installFakeHass(page);
    await mountCard(page);

    const personDetail = card(page).locator("medilog-person-detail");
    const personViews = personDetail.locator("ha-button-toggle-group").first();
    await expect(personViews.locator("button[data-value]")).toHaveText(["Časová osa", "Léky"]);
    await personViews.locator('button[data-value="medications"]').click();
    await expect(personDetail.locator("medilog-records-medications")).toBeAttached();
    await expect(personDetail.locator("medilog-records")).toHaveCount(0);
    await personViews.locator('button[data-value="timeline"]').click();
    await expect(personDetail.locator("medilog-records")).toBeAttached();

    const records = personDetail.locator("medilog-records").first();
    await records.locator('ha-button-toggle-group button[data-value="chart"]').click();
    await expect(records.locator("medilog-records-chart")).toBeAttached();
    await expect(records.locator("medilog-records-table")).toHaveCount(0);
    await records.locator('ha-button-toggle-group button[data-value="table"]').click();
    await expect(records.locator("medilog-records-table")).toBeAttached();

    await card(page).locator(".tab").last().click();
    const manager = card(page).locator("medilog-medications-manager");
    await expect(manager.locator("medilog-medications-table")).toBeAttached();
    await manager.locator('ha-button-toggle-group button[data-value="usage"]').click();
    await expect(manager.locator("medilog-medications-usage")).toBeAttached();
    await expect(manager.locator("medilog-medications-table")).toHaveCount(0);
});

test("tapping 38 then .4 sets 38.4", async ({ page }) => {
    await mountWithForms(page);

    // The older record has no temperature yet: "+" starts one.
    await recordRows(page).last().click();
    const dialog = page.locator("medilog-record-detail-dialog ha-dialog");
    await dialog.locator(".temperature-value ha-button").dispatchEvent("click");

    const degrees = dialog.locator("ha-button-toggle-group").first();
    const tenths = dialog.locator("ha-button-toggle-group").last();
    await degrees.locator('button[data-value="38"]').click();
    await tenths.locator('button[data-value="4"]').click();

    await expect(dialog.locator(".temperature-value")).toContainText("38.4");
    await expect(degrees.locator('button[aria-pressed="true"]')).toHaveText("38");
    await expect(tenths.locator('button[aria-pressed="true"]')).toHaveText(".4");

    await dialog.locator('ha-button[slot="primaryAction"]').dispatchEvent("click");
    await expect.poll(() => savedTemperatures(page)).toEqual([38.4]);
});

test("Delete asks through the confirmation dialog, showing the record", async ({ page }) => {
    await mountWithForms(page);
    const deleteCalls = () => page.evaluate(() => window.__serviceCalls.filter((call) => call.service === "delete_record").map((call) => call.data.id));

    await expect(recordRows(page)).toHaveCount(2);
    await recordRows(page).first().click();
    const recordDialog = page.locator("medilog-record-detail-dialog ha-dialog");
    const confirmDialog = page.locator("medilog-confirm-dialog ha-dialog");

    // Cancel keeps the record and its dialog.
    await recordDialog.locator('ha-button[variant="danger"]').dispatchEvent("click");
    await expect(confirmDialog).toHaveJSProperty("headerTitle", "Smazat záznam?");
    await expect(confirmDialog.locator("li")).toHaveText(["24. 11. 2026 12:00", "Teplota: 38.2 °C"]);
    await confirmDialog.locator('ha-button[slot="secondaryAction"]').dispatchEvent("click");
    await expect(confirmDialog).toHaveCount(0);
    await expect(recordDialog).toBeAttached();
    expect(await deleteCalls()).toEqual([]);

    // Delete removes it.
    await recordDialog.locator('ha-button[variant="danger"]').dispatchEvent("click");
    await confirmDialog.locator('ha-button[variant="danger"]').dispatchEvent("click");
    await expect.poll(deleteCalls).toEqual(["r2"]);
    await expect(recordDialog).toHaveCount(0);
    await expect(recordRows(page)).toHaveCount(1);
});

test("HA's dialog manager closing the confirmation answers Cancel and reports dialog-closed", async ({ page }) => {
    await mountWithForms(page);
    await recordRows(page).first().click();
    const recordDialog = page.locator("medilog-record-detail-dialog ha-dialog");
    await recordDialog.locator('ha-button[variant="danger"]').dispatchEvent("click");
    const confirm = page.locator("medilog-confirm-dialog");
    await expect(confirm.locator("ha-dialog")).toBeAttached();

    const closed = await confirm.evaluate((element) => {
        const events: string[] = [];
        element.addEventListener("dialog-closed", (event) => events.push((event as CustomEvent<{ dialog: string }>).detail.dialog));
        const accepted = (element as HTMLElement & { closeDialog(): boolean }).closeDialog();
        (element as HTMLElement & { closeDialog(): boolean }).closeDialog();
        return { accepted, events };
    });
    expect(closed).toEqual({ accepted: true, events: ["medilog-confirm-dialog"] });
    await expect(confirm.locator("ha-dialog")).toHaveCount(0);
    await expect(recordDialog).toBeAttached();
    expect(await page.evaluate(() => window.__serviceCalls.filter((call) => call.service === "delete_record"))).toEqual([]);
});

test("the chart is an SVG with a point per temperature and a marker per antipyretic dose", async ({ page }) => {
    await installFakeHass(page);
    await mountCard(page);

    const records = card(page).locator("medilog-records").first();
    await records.locator('ha-button-toggle-group button[data-value="chart"]').click();
    const chart = records.locator("medilog-records-chart");

    // Alice: one temperature (38.2) and one Paralen dose.
    await expect(chart.locator("svg circle[data-point]")).toHaveCount(1);
    await expect(chart.locator("svg [data-dose]")).toHaveCount(1);
    await expect(chart.locator("svg [data-dose]")).toContainText("Paralen");
    await expect(chart.locator("svg")).toContainText("38.2°");
    expect(await page.evaluate(() => "ApexCharts" in window)).toBe(false);

    // Its checkbox label hides the doses.
    await chart.getByText("Zobrazit léky").click();
    await expect(chart.locator("ha-checkbox")).toHaveJSProperty("checked", false);
    await expect(chart.locator("svg [data-dose]")).toHaveCount(0);
});

test("clicking the antipyretic label toggles the medication's checkbox", async ({ page }) => {
    await mountWithForms(page);

    await card(page).locator(".tab").last().click();
    await card(page).locator("medilog-medications-table tbody tr").filter({ hasText: "Paralen" }).click();
    const dialog = page.locator("medilog-medication-dialog ha-dialog");
    // The form stretches the checkbox across the dialog: aim at its text, not the middle of the row.
    await dialog.getByText("Antipyretikum").click({ position: { x: 50, y: 10 } });
    await expect(dialog.locator("ha-checkbox")).toHaveJSProperty("checked", false);

    await dialog.locator('ha-button[slot="primaryAction"]').dispatchEvent("click");
    await expect.poll(() => page.evaluate(() => window.__serviceCalls
        .filter((call) => call.service === "add_or_update_medication")
        .map((call) => call.data.is_antipyretic))).toEqual([false]);
});
