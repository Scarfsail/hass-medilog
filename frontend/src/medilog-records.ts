import { LitElement, css, html, PropertyValues } from "lit-element"
import { customElement, property, state } from "lit/decorators.js";
import 'dayjs/locale/cs';
import { Medication, MedilogRecord, PersonInfo } from "./models";
import type { HomeAssistant } from "../hass-frontend/src/types";
import "./medilog-records-chart"
import "./medilog-records-table"
import "./medilog-records-medications"
import { getLocalizeFunction, LocalizeFunction } from "./localize/localize";
import { DataStore } from "./data-store";

@customElement("medilog-records")
export class MedilogRecords extends LitElement {
    // Static styles
    static styles = css`
    
    `

    // Private properties
    private _localize?: LocalizeFunction;

    // Public properties
    @property({ attribute: false }) public person?: PersonInfo
    @property({ attribute: false }) public hass?: HomeAssistant;
    @property({ attribute: false }) public records?: (MedilogRecord | null)[];
    @property({ attribute: false }) public dataStore!: DataStore;

    // State properties
    @state() private visualization: 'chart' | 'table' = 'table';

    // Lifecycle methods
    willUpdate(changedProperties: PropertyValues) {
        if (!this._localize && this.hass) {
            this._localize = getLocalizeFunction(this.hass);
        }
    }

    // Render method
    render() {
        if (!this.person) {
            return "Person is not defined";
        }

        if (!this.records) {
            return html`<ha-circular-progress active></ha-circular-progress>`;
        }

        return html`
            <div>
                <ha-button .appearance=${this.visualization == 'table' ? 'accent' : 'plain'} @click=${() => this.visualization = 'table'}><ha-icon icon="mdi:table"></ha-icon></ha-button>            
                <ha-button .appearance=${this.visualization == 'chart' ? 'accent' : 'plain'} @click=${() => this.visualization = 'chart'}><ha-icon icon="mdi:chart-line"></ha-icon></ha-button>
            </div>
            
            ${this.visualization === 'table'
                ? html`<medilog-records-table .records=${this.records} .hass=${this.hass} .person=${this.person} .dataStore=${this.dataStore}></medilog-records-table>`
                : this.visualization === 'chart'
                    ? html`<medilog-records-chart .records=${this.records} .medications=${this.dataStore.medications}></medilog-records-chart>`
                    : html`<div>Unknown visualization: ${this.visualization}</div>`
            }
        `;
    }
}
