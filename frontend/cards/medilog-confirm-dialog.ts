import { LitElement, css, html, nothing, PropertyValues } from "lit"
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant } from "../types/ha";
import { getLocalizeFunction, LocalizeFunction } from "./localize/localize";

export interface ConfirmDialogParams {
    title: string;
    /** What will be deleted, one line each. */
    details: string[];
}

interface ConfirmDialogState extends ConfirmDialogParams {
    resolve: (confirmed: boolean) => void;
}

@customElement("medilog-confirm-dialog")
export class MedilogConfirmDialog extends LitElement {
    static styles = css`
        ul {
            margin: 0;
            padding-left: 20px;
        }
    `

    private _localize?: LocalizeFunction;

    @property({ attribute: false }) public hass!: HomeAssistant;

    @state() private _params?: ConfirmDialogState;

    public showDialog(params: ConfirmDialogState): void {
        this._params = params;
    }

    willUpdate(changedProperties: PropertyValues) {
        if (!this._localize && this.hass) {
            this._localize = getLocalizeFunction(this.hass);
        }
    }

    render() {
        if (!this._params || !this._localize) {
            return nothing;
        }

        return html`
            <ha-dialog open type="alert" width="small" .hass=${this.hass} .headerTitle=${this._params.title} @closed=${() => this._close(false)}>
                <ul>
                    ${this._params.details.map((detail) => html`<li>${detail}</li>`)}
                </ul>
                <ha-dialog-footer slot="footer">
                    <ha-button slot="secondaryAction" appearance="plain" @click=${() => this._close(false)}>
                        ${this._localize('common.cancel')}
                    </ha-button>
                    <ha-button slot="primaryAction" variant="danger" @click=${() => this._close(true)}>
                        ${this._localize('common.delete')}
                    </ha-button>
                </ha-dialog-footer>
            </ha-dialog>
        `;
    }

    /** Called by HA's dialog manager on Back / closeAllDialogs. */
    public closeDialog(): boolean {
        this._close(false);
        return true;
    }

    /** Answer once: a button, the dialog's own `closed` and `closeDialog()` may all report. */
    private _close(confirmed: boolean) {
        const params = this._params;
        if (!params) {
            return;
        }
        this._params = undefined;
        params.resolve(confirmed);
        this.dispatchEvent(new CustomEvent("dialog-closed", {
            bubbles: true,
            composed: true,
            detail: { dialog: this.localName },
        }));
    }
}

/** Ask to confirm a delete; resolves `true` only when Delete is pressed. */
export function showConfirmDialog(element: HTMLElement, params: ConfirmDialogParams): Promise<boolean> {
    return new Promise((resolve) => {
        element.dispatchEvent(new CustomEvent("show-dialog", {
            bubbles: true,
            composed: true,
            detail: {
                dialogTag: "medilog-confirm-dialog",
                dialogImport: () => import("./medilog-confirm-dialog"),
                dialogParams: { ...params, resolve },
            },
        }));
    });
}
