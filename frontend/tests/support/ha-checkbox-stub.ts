/**
 * A stand-in for Home Assistant's `ha-checkbox` inside the Playwright harness.
 * Like the real (Web Awesome) element, its default slot is the label, wrapped
 * with the box in one `<label>`, so clicking the text toggles it; a toggle
 * updates `checked` and fires a bubbling, composed `change`.
 */
export const HA_CHECKBOX_STUB = `
class MedilogTestHaCheckbox extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: "open" }).innerHTML = '<label><input type="checkbox"><slot></slot></label>';
        this._input = this.shadowRoot.querySelector("input");
        this._input.addEventListener("change", () => {
            this.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
        });
    }
    get checked() { return this._input.checked; }
    set checked(next) { this._input.checked = next; }
}
if (!customElements.get("ha-checkbox")) {
    customElements.define("ha-checkbox", MedilogTestHaCheckbox);
}
`;
