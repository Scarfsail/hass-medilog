import { LitElement, css, html, PropertyValues } from "lit-element"
import { customElement, property, state } from "lit/decorators.js";
import dayjs from "dayjs";
import duration from 'dayjs/plugin/duration'
import 'dayjs/locale/cs';
import { Medication, MedilogRecord, MedilogRecordRaw, MedilogRecordsGroupByTime, PersonInfo } from "./models";
import type { HomeAssistant } from "../hass-frontend/src/types";
import { MedilogRecordDetailDialogParams } from "./medilog-record-detail-dialog";
import { Utils } from "./utils";
import { getLocalizeFunction, LocalizeFunction } from "./localize/localize";
import { sharedStyles, sharedTableStyles } from "./shared-styles";
import { DataStore } from "./data-store";

@customElement("medilog-records-table")
export class MedilogRecordsTable extends LitElement {
    // Static styles
    static styles = [sharedStyles, sharedTableStyles, css`
        .date-separator {
            cursor: default;
            background-color: var(--secondary-background-color);
        }
        
        .date-separator:hover {
            background-color: var(--secondary-background-color) !important;
        }
        
        .date-separator td {
            padding: 8px 16px;
            cursor: default;
            font-weight: 600;
            color: var(--primary-text-color);
            border-bottom: 2px solid var(--divider-color);
            font-size: 0.9em;
            letter-spacing: 0.5px;
        }
        
        .record-table tbody tr:first-child.date-separator td {
            padding-top: 4px;
        }
        
        .day-separator {
            height: 8px;
        }
        
        .day-separator td {
            padding: 0;
            border-bottom: none;
            background: transparent;
        }
        
        .day-separator:hover {
            background: transparent !important;
        }

        .temperature-cell {
            position: relative;
            padding: 0 !important;
        }

        .temperature-content {
            position: relative;
            padding: 12px 16px;
            font-weight: 500;
        }

        .temperature-bar {
            position: absolute;
            left: 0;
            top: 0;
            bottom: 0;
            border-radius: 2px;
            opacity: 0.3;
            transition: width 0.3s ease;
        }

        .temp-green { background-color: #4caf5060; }
        .temp-orange { background-color: #ff980060; }
        .temp-light-red { background-color: #ff572260; }
        .temp-dark-red { background-color: #d32f2f60; }
    `]

    // Private properties
    private _localize?: LocalizeFunction;

    // Public properties
    @property({ attribute: false }) public person?: PersonInfo
    @property({ attribute: false }) public hass?: HomeAssistant;
    @property({ attribute: false }) public records?: (MedilogRecord | null)[];
    @property({ attribute: false }) public dataStore!: DataStore;

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

        if (!this.dataStore || !this._localize) {
            return "Data store is not defined";
        }
        const columnCount = 4; // Number of columns in the table

        return html`
            <table class="record-table"> 
               <thead>
                <tr>
                    <th><ha-icon icon="mdi:clock"></ha-icon></th>
                    <th><ha-icon icon="mdi:timer-sand"></ha-icon></th>
                    <th><ha-icon icon="mdi:pill"></ha-icon></th>
                    <th><ha-icon icon="mdi:thermometer"></ha-icon></th>
                </tr>
            </thead>
                <tbody>
                    ${this.records.map((record, index) => {
                        if (record === null) {
                            return html`
                                <tr class="day-separator">
                                    <td colspan="${columnCount}"></td>
                                </tr>
                            `;
                        }
                        
                        // Check if this is the first record of the day
                        const isFirstOfDay = index === 0 || 
                            this.records![index - 1] === null || 
                            !record.datetime.isSame(this.records![index - 1]?.datetime, 'day');
                        
                        // Render date separator row if it's the first record of the day
                        const dateSeparator = isFirstOfDay ? html`
                            <tr class="date-separator">
                                <td colspan="${columnCount}">
                                    ${this._formatDateSeparator(record.datetime)}
                                </td>
                            </tr>
                        ` : '';
                        
                        return html`
                            ${dateSeparator}
                            <tr @click=${() => this.showRecordDetailsDialog(record)}>
                                <td>${record.datetime.format('HH:mm')}</td>
                                <td>${Utils.formatDurationFromTo(record.datetime)}</td>
                                <td>${this._renderMedication(record)}</td>
                                <td class="temperature-cell">
                                    ${record.temperature ? html`
                                        <div class="temperature-bar ${this._getTemperatureColorClass(record.temperature)}" 
                                             style="width: ${this._getTemperatureBarWidth(record.temperature)}%"></div>
                                        <div class="temperature-content">
                                            ${record.temperature} °C
                                        </div>
                                    ` : html`<div class="temperature-content">-</div>`}
                                </td>
                            </tr>
                        `;
                    })}
                </tbody>
            </table>
        `
    }

    // Private helper methods
    private getMedicationName(record: MedilogRecord): string {
        return this.dataStore.medications.getMedicationName(record.medication_id);
    }

    private _formatDateSeparator(datetime: dayjs.Dayjs) {
        if (!this._localize) return '';
        const formattedDate = Utils.formatDate(datetime, true, false);
        const daysAgo = dayjs().startOf('day').diff(datetime.startOf('day'), 'day');
        
        let relativeText: string;
        if (daysAgo === 0) {
            relativeText = this._localize('relative_date.today');
        } else if (daysAgo === 1) {
            relativeText = this._localize('relative_date.days_ago_one').replace('{count}', '1');
        } else if (daysAgo >= 2 && daysAgo <= 4) {
            relativeText = this._localize('relative_date.days_ago_few').replace('{count}', daysAgo.toString());
        } else {
            relativeText = this._localize('relative_date.days_ago_many').replace('{count}', daysAgo.toString());
        }
        
        return html`${formattedDate} <ha-icon icon="mdi:calendar" style="--mdc-icon-size: 16px; vertical-align: middle; margin: 0 4px;"></ha-icon> ${relativeText}`;
    }

    private _renderMedication(record: MedilogRecord) {
        const medicationName = this.getMedicationName(record);
        if (!medicationName) {
            return '-';
        }

        const medication = record.medication_id 
            ? this.dataStore.medications.getMedication(record.medication_id)
            : null;
        const isAntipyretic = medication?.is_antipyretic ?? false;
        const amount = record.medication_amount && record.medication_amount > 1 
            ? ` (${record.medication_amount})` 
            : '';

        if (isAntipyretic) {
            return html`
                <div class="medication-content">
                    <ha-icon class="antipyretic-icon" icon="mdi:thermometer-chevron-down"></ha-icon>
                    <span class="antipyretic-medication">${medicationName}${amount}</span>
                </div>
            `;
        }

        return `${medicationName}${amount}`;
    }

    private showRecordDetailsDialog(record: MedilogRecord) {
        const personStore = this.dataStore.records.getCachedStore(this.person!.entity);
        if (!personStore) {
            console.error("Person store not found for", this.person?.entity);
            return;
        }
        
        showMedilogRecordDetailDialog(this, {
            record: record,
            personStore: personStore,
            medications: this.dataStore.medications
        });
    }

    private _getTemperatureColorClass(temperature: number): string {
        if (temperature < 37) return 'temp-green';
        if (temperature < 38) return 'temp-orange';
        if (temperature < 39) return 'temp-light-red';
        return 'temp-dark-red';
    }

    private _getTemperatureBarWidth(temperature: number): number {
        const minTemp = 36.5;
        const maxTemp = 40;
        const clampedTemp = Math.max(minTemp, Math.min(maxTemp, temperature));
        const width = ((clampedTemp - minTemp) / (maxTemp - minTemp)) * 100;
        return Math.max(3, width); // Always show at least 3% bar width
    }
}

export function showMedilogRecordDetailDialog(element: HTMLElement, params: MedilogRecordDetailDialogParams) {
    const event = new CustomEvent("show-dialog", {
        bubbles: true,
        composed: true,
        detail: {
            dialogTag: "medilog-record-detail-dialog",
            dialogImport: () => import("./medilog-record-detail-dialog"),
            dialogParams: params
        }
    });
    element.dispatchEvent(event);
}
