/**
 * A stand-in for Home Assistant's `ha-select` inside the Playwright harness.
 *
 * HA defines `ha-select` at startup, so a card can use it as is; the harness
 * has no HA, so the tag would be an empty undefined element. The stub keeps
 * the real element's contract: `options` as `{ value, label }` and `value`
 * properties; it ignores children; a pick fires `selected` with `{ value }`
 * only when it differs, and never changes `value` itself.
 *
 * Each item is a `button[data-item]` a spec clicks to pick.
 */
export const HA_SELECT_STUB = `
class MedilogTestHaSelect extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: "open" });
        this._props = { options: [], value: undefined };
    }
    connectedCallback() { this._render(); }
    _render() {
        const root = this.shadowRoot;
        root.innerHTML = "";
        for (const option of this._props.options) {
            const item = document.createElement("button");
            item.dataset.item = option.value;
            item.textContent = option.label;
            item.addEventListener("click", () => {
                if (option.value !== this._props.value) this.dispatchEvent(new CustomEvent("selected", { detail: { value: option.value } }));
            });
            root.append(item);
        }
    }
}
for (const key of ["options", "value"]) {
    Object.defineProperty(MedilogTestHaSelect.prototype, key, {
        get() { return this._props[key]; },
        set(next) { this._props[key] = next; this._render(); },
    });
}
if (!customElements.get("ha-select")) {
    customElements.define("ha-select", MedilogTestHaSelect);
}
`;
