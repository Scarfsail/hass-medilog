/**
 * A stand-in for Home Assistant's `ha-button-toggle-group` inside the
 * Playwright harness, where no HA chunk can load it. It keeps the real
 * element's contract: `buttons` as `{ label, iconPath?, value }` and `active`
 * properties; a click makes that button active and fires `value-changed` with
 * `{ value }`.
 *
 * Each button is a `button[data-value]` showing its label, `aria-pressed` when
 * active, that a spec clicks.
 */
export const HA_BUTTON_TOGGLE_GROUP_STUB = `
class MedilogTestHaButtonToggleGroup extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: "open" });
        this._props = { buttons: [], active: undefined };
    }
    connectedCallback() { this._render(); }
    _render() {
        const root = this.shadowRoot;
        root.innerHTML = "";
        for (const button of this._props.buttons) {
            const item = document.createElement("button");
            item.dataset.value = button.value;
            item.textContent = button.label;
            item.setAttribute("aria-pressed", String(button.value === this._props.active));
            item.addEventListener("click", () => {
                this.active = button.value;
                this.dispatchEvent(new CustomEvent("value-changed", { detail: { value: button.value }, bubbles: true, composed: true }));
            });
            root.append(item);
        }
    }
}
for (const key of ["buttons", "active"]) {
    Object.defineProperty(MedilogTestHaButtonToggleGroup.prototype, key, {
        get() { return this._props[key]; },
        set(next) { this._props[key] = next; this._render(); },
    });
}
if (!customElements.get("ha-button-toggle-group")) {
    customElements.define("ha-button-toggle-group", MedilogTestHaButtonToggleGroup);
}
`;
