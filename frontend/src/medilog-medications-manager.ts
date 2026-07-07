import { LitElement, css, html, nothing, PropertyValues } from "lit-element"
import { customElement, property, state } from "lit/decorators.js";
import { Medication } from "./models";
import type { HomeAssistant } from "../hass-frontend/src/types";
import { sharedStyles } from "./shared-styles";
import { getLocalizeFunction, LocalizeFunction } from "./localize/localize";
import "./medilog-medication-dialog";
import "./medilog-medications-table";
import "./medilog-medications-usage";
import { DataStore } from "./data-store";

@customElement("medilog-medications-manager")
export class MedilogMedicationsManager extends LitElement {
    // Static styles
    static styles = [sharedStyles, css`

    `]

    // Private properties
    private _localize?: LocalizeFunction;

    // Public properties
    @property({ attribute: false }) public hass?: HomeAssistant;
    @property({ attribute: false }) public dataStore!: DataStore;

    // State properties
    @state() private viewMode: 'list' | 'usage' = 'list';
    @state() private _selectedMedicationId?: string;

    // Lifecycle methods
    connectedCallback() {
        super.connectedCallback();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
    }

    willUpdate(changedProperties: PropertyValues) {
        if (!this._localize && changedProperties.has('hass') && this.hass) {
            this._localize = getLocalizeFunction(this.hass);
        }
    }


    // Render method
    render() {
        if (!this.hass || !this._localize) {
            return nothing;
        }

        return html`
            <div class="container">
                <div class="controls">
                    <div class="view-toggle">
                        <ha-button .appearance=${this.viewMode === 'list' ? 'accent' : 'plain'} @click=${() => this.viewMode = 'list'}>
                            <ha-icon icon="mdi:format-list-bulleted"></ha-icon>
                        </ha-button>
                        <ha-button .appearance=${this.viewMode === 'usage' ? 'accent' : 'plain'} @click=${() => this.viewMode = 'usage'}>
                            <ha-icon icon="mdi:chart-box"></ha-icon>
                        </ha-button>
                    </div>
                    <ha-button @click=${this._handleAdd} .appearance=${'plain'}>
                        <ha-icon icon="mdi:plus"></ha-icon>
                        ${this._localize('actions.add_record')}
                    </ha-button>
                </div>

                ${this.viewMode === 'list' ? html`
                    <medilog-medications-table
                        .hass=${this.hass}
                        .dataStore=${this.dataStore}
                        .onUsageClick=${this._handleUsageClick.bind(this)}
                    ></medilog-medications-table>
                ` : html`
                    <medilog-medications-usage
                        .hass=${this.hass}
                        .dataStore=${this.dataStore}
                        .selectedMedicationId=${this._selectedMedicationId}
                    ></medilog-medications-usage>
                `}
            </div>
        `;
    }

    // Private helper methods
    private _handleAdd() {
        showMedicationDialog(this, {
            medications: this.dataStore.medications,
            onClose: (changed: boolean) => {

            }
        });
    }

    private _handleUsageClick(medicationId: string) {
        this._selectedMedicationId = medicationId;
        this.viewMode = 'usage';
    }
}

export function showMedicationDialog(element: HTMLElement, params: import('./medilog-medication-dialog').MedicationDialogParams) {
    const event = new CustomEvent("show-dialog", {
        bubbles: true,
        composed: true,
        detail: {
            dialogTag: "medilog-medication-dialog",
            dialogImport: () => import("./medilog-medication-dialog"),
            dialogParams: params
        }
    });
    element.dispatchEvent(event);
}
