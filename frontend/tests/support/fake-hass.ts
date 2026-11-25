import { expect, type Page } from "@playwright/test";
import { resolve } from "node:path";
import { HA_SELECT_STUB } from "./ha-select-stub";

/** The card bundle `global-setup.ts` rebuilds before the suite runs. */
export const CARD_BUNDLE = resolve(__dirname, "../../../custom_components/medilog/frontend_compiled/medilog-card.js");

export type ServiceCall = { domain: string; service: string; data: Record<string, unknown> };

declare global {
    interface Window {
        /** The `hass` object handed to the card. */
        __fakeHass: Record<string, unknown>;
        /** Every `callService` the card made, in order. */
        __serviceCalls: ServiceCall[];
        /** Let the held `medilog.get_records` calls return. */
        __releaseRecords: () => void;
    }
}

/** Fixture persons, each with a `person.*` state that names it. */
export const PERSONS = [
    { entity: "person.alice", name: "Alice" },
    { entity: "person.bob", name: "Bob" },
];

/** Fixture medications, as `medilog.get_medications` returns them. */
export const MEDICATIONS = [
    { id: "med-paralen", name: "Paralen", units: "mg", is_antipyretic: true },
    { id: "med-ibalgin", name: "Ibalgin", is_antipyretic: false },
];

/** Fixture records per person, as `medilog.get_records` returns them. */
const RECORDS: Record<string, Array<Record<string, unknown>>> = {
    "person.alice": [
        { id: "r1", datetime: "2026-11-24T08:00:00Z", medication_id: "med-paralen", medication_amount: 1 },
        { id: "r2", datetime: "2026-11-24T12:00:00Z", temperature: 38.2 },
    ],
    "person.bob": [
        { id: "r3", datetime: "2026-11-23T20:00:00Z", medication_id: "med-ibalgin", medication_amount: 1 },
    ],
};

/**
 * Install a fake Home Assistant in a bare page as `window.__fakeHass`, with the
 * `ha-select` stub defined. Its `callService` serves the fixtures above and
 * records every call; with `holdRecords` the `get_records` calls stay pending
 * until `window.__releaseRecords()`.
 */
export async function installFakeHass(page: Page, { holdRecords = false } = {}): Promise<void> {
    await page.setContent("<!doctype html><html><body></body></html>");
    await page.addScriptTag({ content: HA_SELECT_STUB });
    await page.evaluate(({ persons, medications, records, holdRecords }) => {
        window.__serviceCalls = [];
        const held: Array<() => void> = [];
        window.__releaseRecords = () => held.splice(0).forEach((release) => release());
        const responses: Record<string, (data: Record<string, unknown>) => unknown> = {
            get_person_list: () => ({
                persons: persons.map((person) => ({ entity: person.entity, recent_record: records[person.entity]?.[0] ?? null })),
            }),
            get_medications: () => ({ medications }),
            get_records: (data) => ({ records: records[data.person_id as string] ?? [] }),
        };
        window.__fakeHass = {
            language: "cs",
            locale: { language: "cs" },
            states: Object.fromEntries(persons.map((person) => [
                person.entity,
                { entity_id: person.entity, state: "home", attributes: { friendly_name: person.name } },
            ])),
            callService: async (domain: string, service: string, data: Record<string, unknown> = {}) => {
                window.__serviceCalls.push({ domain, service, data });
                if (holdRecords && service === "get_records") await new Promise<void>((release) => held.push(release));
                return { context: { id: "ctx", parent_id: null, user_id: null }, response: responses[service]?.(data) };
            },
        };
    }, { persons: PERSONS, medications: MEDICATIONS, records: RECORDS, holdRecords });
}

/**
 * Load the card bundle and mount a `medilog-card` with the fake `hass`, handed
 * over before the card connects or, with `hassAfterConnect`, after.
 */
export async function mountCard(page: Page, { hassAfterConnect = false } = {}): Promise<void> {
    await page.addScriptTag({ path: CARD_BUNDLE, type: "module" });
    await expect.poll(() => page.evaluate(() => !!customElements.get("medilog-card"))).toBe(true);
    await page.evaluate((hassAfterConnect) => {
        const card = document.createElement("medilog-card") as HTMLElement & {
            setConfig(config: object): void;
            hass: unknown;
        };
        card.setConfig({ type: "custom:medilog-card" });
        if (hassAfterConnect) {
            document.body.appendChild(card);
            card.hass = window.__fakeHass;
        } else {
            card.hass = window.__fakeHass;
            document.body.appendChild(card);
        }
    }, hassAfterConnect);
}
