/**
 * Home Assistant's own form elements, borrowed from the frontend hosting us.
 *
 * HA registers `ha-input` as a side effect of loading the automation editor's
 * chunk (`ha-selector` is already defined on dashboards, but is awaited here
 * too), and nothing exports them, so the only way to reach `ha-input` from a
 * card is to ask a throwaway router to load that chunk and then wait for the
 * tags to appear. Ported from hass-helman's `cards/shared/load-ha-elements.ts`.
 */

const FORM_ELEMENTS = ["ha-input", "ha-selector"] as const;

/**
 * Wrap a chunk walk so it runs at most once and never twice at a time: skip it
 * when the tags are already registered, share one in-flight attempt between
 * concurrent callers, and forget a failed attempt so a later caller may retry.
 */
function loadOnce(tags: readonly string[], walk: () => Promise<void>): () => Promise<void> {
    let pending: Promise<void> | null = null;

    return async (): Promise<void> => {
        if (tags.every((tag) => customElements.get(tag))) {
            return;
        }

        if (pending === null) {
            pending = (async () => {
                await walk();
                // The walk only *starts* the chunk; registration is what we are after.
                await Promise.all(tags.map((tag) => customElements.whenDefined(tag)));
            })();
        }

        try {
            await pending;
        } catch (error) {
            pending = null;
            throw error;
        }
    };
}

/**
 * Walk to the automation panel, which is where the form elements come from.
 * `partial-panel-resolver` resolves a *panel* to its chunk, and `ha-panel-config`
 * is itself a router whose `automation` route loads the editor.
 */
async function loadAutomationPanel(): Promise<void> {
    await customElements.whenDefined("partial-panel-resolver");

    const partialPanelResolver = document.createElement("partial-panel-resolver") as unknown as {
        hass: unknown;
        _updateRoutes: () => void;
        routerOptions: { routes: { tmp: { load: () => Promise<void> } } };
    };
    partialPanelResolver.hass = {
        panels: [{ url_path: "tmp", component_name: "config" }],
    };
    partialPanelResolver._updateRoutes();
    await partialPanelResolver.routerOptions.routes.tmp.load();

    await customElements.whenDefined("ha-panel-config");

    const configPanelResolver = document.createElement("ha-panel-config") as unknown as {
        routerOptions: { routes: { automation: { load: () => Promise<void> } } };
    };
    await configPanelResolver.routerOptions.routes.automation.load();
}

export const loadHaForm = loadOnce(FORM_ELEMENTS, loadAutomationPanel);

/**
 * `ha-button-toggle-group` ships only with HA's button-toggle selector, not in
 * the dashboard's own bundle. `ha-selector` is, and it loads a selector's chunk
 * as soon as it is given one, so a hidden throwaway asks for that chunk.
 */
async function loadButtonToggleSelector(): Promise<void> {
    await customElements.whenDefined("ha-selector");

    const loader = Object.assign(document.createElement("ha-selector"), {
        selector: { button_toggle: { options: [] } },
        hidden: true,
    });
    document.body.append(loader);
    try {
        await customElements.whenDefined("ha-button-toggle-group");
    } finally {
        loader.remove();
    }
}

export const loadHaButtonToggleGroup = loadOnce(["ha-button-toggle-group"], loadButtonToggleSelector);
