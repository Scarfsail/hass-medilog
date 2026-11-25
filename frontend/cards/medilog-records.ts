import { LitElement, css, html, PropertyValues } from "lit"
import { customElement, property, state } from "lit/decorators.js";
import 'dayjs/locale/cs';
import { Medication, MedilogRecord, PersonInfo } from "./models";
import type { HomeAssistant } from "../types/ha";
import "./medilog-records-chart"
import "./medilog-records-table"
import "./medilog-records-medications"
import { getLocalizeFunction, LocalizeFunction } from "./localize/localize";
import { DataStore } from "./data-store";
import { mdiChartLine, mdiTable } from "@mdi/js";

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
    @property({ attribute: false }) public now?: number;

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

        if (!this.records || !this._localize) {
            return html`<ha-spinner></ha-spinner>`;
        }

        return html`
            <ha-button-toggle-group
                .buttons=${[
                    { label: this._localize('common.table'), iconPath: mdiTable, value: 'table' },
                    { label: this._localize('common.chart'), iconPath: mdiChartLine, value: 'chart' },
                ]}
                .active=${this.visualization}
                @value-changed=${(e: CustomEvent<{ value: 'chart' | 'table' }>) => this.visualization = e.detail.value}
            ></ha-button-toggle-group>
            
            ${this.visualization === 'table'
                ? html`<medilog-records-table .records=${this.records} .hass=${this.hass} .person=${this.person} .dataStore=${this.dataStore} .now=${this.now}></medilog-records-table>`
                : this.visualization === 'chart'
                    ? html`<medilog-records-chart .records=${this.records} .medications=${this.dataStore.medications} .hass=${this.hass}></medilog-records-chart>`
                    : html`<div>Unknown visualization: ${this.visualization}</div>`
            }
        `;
    }
}
