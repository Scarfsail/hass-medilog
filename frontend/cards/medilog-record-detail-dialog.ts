import { LitElement, css, html, nothing, PropertyValues } from "lit-element"
import { customElement, property, state } from "lit/decorators.js";
import dayjs from "dayjs";
import { MedilogRecord, MedilogRecordRaw, Medication } from "./models";
import type { HomeAssistant } from "../hass-frontend/src/types";
import { mdiCloseCircle } from '@mdi/js';
import { sharedStyles } from "./shared-styles";
import { loadHaForm, loadHaYamlEditor } from "./load-ha-elements";
import { getLocalizeFunction, LocalizeFunction } from "./localize/localize";
import { Utils } from "./utils";
import "./medilog-medication-dialog";
import { MedicationsStore } from "./medications-store";
import { showMedicationDialog } from "./medilog-medications-manager";
import { showMedicationPicker } from "./medilog-medication-picker";
import { MedilogPersonRecordsStore } from "./medilog-person-records-store";

export interface MedilogRecordDetailDialogParams {
    record: MedilogRecord;
    personStore: MedilogPersonRecordsStore;
    medications: MedicationsStore;
}

loadHaForm();

@customElement("medilog-record-detail-dialog")
export class MedilogRecordDetailDialog extends LitElement {
    // Static styles
    static styles = [sharedStyles, css`
        .fill {
            width: 100%;
        }
        .datetime-field {
            display: flex;
            align-items: flex-start;
            gap: 8px;
        }
        /* ha-selector-datetime centers its date/time inputs in its own
           shadow DOM, so we compose ha-date-input/ha-time-input directly to
           control alignment. The hidden ha-selector below only exists to
           trigger HA's lazy registration of those two elements. */
        .dt-loader {
            display: none;
        }
        .field {
            margin-bottom: 5px;
        }
        .medication-row {
            display: flex;
            gap: 10px;
            align-items: flex-end;
        }
        .medication-row .medication-field-wrapper {
            flex: 1;
            position: relative;
        }
        .medication-row .medication-field {
            width: 100%;
        }
        .medication-row .medication-clear-btn {
            position: absolute;
            right: 8px;
            bottom: 8px;
            --mdc-icon-button-size: 24px;
            --mdc-icon-size: 18px;
        }
        .medication-row .amount-field {
            width: 120px;
        }
        .temperature-buttons{
            display: flex;
            justify-content: space-between;
            gap:5px;
            width: 280px;
            flex-wrap: wrap;
        }
        .wrapper{
            display: flex;   
            flex-flow: column;
            gap: 10px;
        }
        .temperature-value{
            margin: 0px;
        }
        .last-taken-info {
            color: var(--secondary-text-color);
            font-size: 0.9em;
            margin-top: 4px;
            font-style: italic;
        }
    `]

    // Private properties
    private _localize?: (key: string) => string;

    // Public properties
    @property({ attribute: false }) public hass!: HomeAssistant;

    // State properties
    @state() private _params?: MedilogRecordDetailDialogParams;
    @state() private _editedRecord?: MedilogRecord;

    // Public methods
    public showDialog(dialogParams: MedilogRecordDetailDialogParams): void {
        this._params = dialogParams;
        this._editedRecord = dialogParams.record;
    }

    // Lifecycle methods
    willUpdate(changedProperties: PropertyValues) {
        if (!this._localize && this.hass) {
            this._localize = getLocalizeFunction(this.hass);
        }
    }

    // Render method
    render() {
        if (!this._params || !this._editedRecord || !this._localize) {
            return nothing;
        }

        const dialogTitle = this._editedRecord.id
            ? this._localize('dialog.edit_record')
            : this._localize('dialog.new_record');

        return html`
            <ha-dialog open .hass=${this.hass} .headerTitle=${dialogTitle} @closed=${() => this.closeDialog()}>
                <div class="wrapper">
                    <div class="datetime-field">
                        <ha-date-input
                            .locale=${this.hass.locale}
                            .value=${this._editedRecord.datetime.format("YYYY-MM-DD")}
                            @value-changed=${(e: CustomEvent) => this._applyDateTime(e.detail.value, undefined)}
                        ></ha-date-input>
                        <ha-time-input
                            enable-second
                            .locale=${this.hass.locale}
                            .value=${this._editedRecord.datetime.format("HH:mm:ss")}
                            @value-changed=${(e: CustomEvent) => this._applyDateTime(undefined, e.detail.value)}
                        ></ha-time-input>
                        <ha-selector
                            class="dt-loader"
                            .hass=${this.hass}
                            .selector=${{ datetime: {} }}
                        ></ha-selector>
                    </div>

                    <div>
                        <div class="medication-row">
                            <div class="medication-field-wrapper">
                                <ha-input
                                    class="medication-field"
                                    .label=${this._localize('dialog.medication')}
                                    .value=${this._getMedicationName()}
                                    readonly
                                    @click=${this._openMedicationPicker}
                                >
                                </ha-input>
                                ${this._editedRecord.medication_id ? html`
                                    <ha-icon-button
                                        class="medication-clear-btn"
                                        .path=${mdiCloseCircle}
                                        @click=${this._clearMedication}
                                    ></ha-icon-button>
                                ` : nothing}
                            </div>
                            <ha-input
                                class="amount-field"
                                .label=${this._localize('dialog.medication_amount')}
                                .value=${this._editedRecord.medication_amount ?? ""}
                                type="number"
                                step="0.5"
                                min="0"
                                .disabled=${!this._editedRecord.medication_id}
                                @change=${(e: Event) => {
                const value = (e.target as HTMLInputElement).value;
                this._editedRecord = { ...this._editedRecord!, medication_amount: value ? parseFloat(value) : undefined };
            }}
                            ></ha-input>
                        </div>
                        ${this._renderLastTaken()}
                    </div>
                    <ha-input .label=${this._localize('dialog.notes')} .value=${this._editedRecord.note ?? ""} class="fill field" @change=${(e: Event) => { this._editedRecord = { ...this._editedRecord!, note: (e.target as HTMLTextAreaElement).value }; }}></ha-input>
                    ${this._editedRecord.temperature !== undefined ? html`
                        <p >
                            <strong>${this._localize('dialog.temperature')}:</strong> ${this._editedRecord.temperature}
                            <ha-button .variant=${"danger"} @click=${() => this._editedRecord = { ...this._editedRecord!, temperature: undefined }}>X</ha-button>
                        </p>
                        <div>
                            <div class="temperature-buttons">
                                ${[36, 37, 38, 39, 40].map((t) => html`
                                <ha-button .appearance=${this.doesTemperatureMatch(t, false) ? 'accent' : 'plain'} @click=${() => this.setTemperature(t, false)}>${t}</ha-button>`)}
                            </div>
                            <div class="temperature-buttons">
                                ${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((t) => html`
                                <ha-button .appearance=${this.doesTemperatureMatch(t, true) ? 'accent' : 'plain'}  @click=${() => this.setTemperature(t, true)}>${"." + t}</ha-button>`)}
                            </div>
                        </div>
                    ` : html`
                        <p class="temperature-value">
                            <strong>${this._localize('dialog.temperature')}:</strong>
                            <ha-button @click=${() => this._editedRecord = { ...this._editedRecord!, temperature: 36.7 }}>+</ha-button>
                        </p>
                    `}

                </div>

                <div slot="footer" class="dialog-footer">
                    ${this._editedRecord.id ? html`
                        <div class="dialog-footer__secondary">
                            <ha-button variant="danger" @click=${this.deleteClick}>
                                ${this._localize('common.delete')}
                            </ha-button>

                            <ha-button appearance="plain" @click=${this.duplicateClick}>
                                ${this._localize('common.duplicate')}
                            </ha-button>
                        </div>
                    ` : nothing}

                    <div class="dialog-footer__primary">
                        <ha-button appearance="accent" @click=${this.saveClick}>
                            ${this._localize('common.save')}
                        </ha-button>
                    </div>
                </div>
            </ha-dialog>
        `;

    }

    // Private helper methods
    private _getMedicationName(): string {
        if (!this._editedRecord?.medication_id) {
            return '';
        }

        const medication = this._params?.medications.getMedication(this._editedRecord.medication_id);
        return medication?.name ?? (this._localize?.('medication_dialog.medication_not_found') || '');
    }

    private _openMedicationPicker() {
        if (!this._params) return;

        showMedicationPicker(this, {
            medications: this._params.medications,
            personId: this._params.personStore.personEntity,
            allRecords: this._params.personStore.all ?? [],
            onSelect: (medication) => {
                if (medication) {
                    this._editedRecord = {
                        ...this._editedRecord!,
                        medication_id: medication.id,
                        medication_amount: this._editedRecord!.medication_amount ?? 1
                    };
                }
            }
        });
    }

    private _clearMedication() {
        this._editedRecord = {
            ...this._editedRecord!,
            medication_id: undefined,
            medication_amount: undefined
        };
    }

    private _clearMedicationAndStopPropagation(e: Event) {
        e.stopPropagation();
        this._clearMedication();
    }

    private _renderLastTaken() {
        const lastRecord = this._getLastMedicationRecord();
        if (!lastRecord || !this._editedRecord || !this._localize) return nothing;

        const duration = Utils.formatDurationFromTo(lastRecord.datetime);
        const amount = lastRecord.medication_amount && lastRecord.medication_amount > 1
            ? ` (${lastRecord.medication_amount}x)`
            : '';

        return html`
            <div class="last-taken-info">
                ${this._localize('dialog.last_taken').replace('{duration}', duration)}${amount}
            </div>
        `;
    }

    private _getLastMedicationRecord(): MedilogRecord | undefined {
        if (!this._editedRecord?.medication_id || !this._params?.personStore) return undefined;

        const medicationId = this._editedRecord.medication_id;
        if (!medicationId) return undefined;

        return this._params.personStore.all
            .filter(record => record.medication_id === medicationId)
            .sort((a, b) => b.datetime.diff(a.datetime))[0];
    }



    private _applyDateTime(date?: string, time?: string) {
        if (!this._editedRecord) return;

        const current = this._editedRecord.datetime;
        const d = date ?? current.format("YYYY-MM-DD");
        const t = time ?? current.format("HH:mm:ss");
        this._editedRecord = { ...this._editedRecord, datetime: dayjs(`${d} ${t}`) };
    }

    private setTemperature(t: number, decimals: boolean) {
        let temperature = this._editedRecord?.temperature;
        if (temperature === undefined) {
            temperature = decimals ? 36 + (t / 10) : t + 0.7;
        } else {
            temperature = decimals ? Math.trunc(temperature) + (t / 10) : t + +((temperature - Math.trunc(temperature))).toPrecision(1)
        }

        this._editedRecord = { ...this._editedRecord, temperature: temperature } as MedilogRecord
    }

    private doesTemperatureMatch(t: number, decimals: boolean) {
        let temperature = this._editedRecord?.temperature;

        if (temperature === undefined)
            return false;

        return decimals ? +(temperature - Math.trunc(temperature)).toPrecision(1) == t / 10 : Math.trunc(temperature) == t;
    }

    private duplicateClick() {
        if (!this._editedRecord)
            return;

        this._editedRecord = { ...this._editedRecord, id: undefined, datetime: dayjs() };
    }
    private async saveClick() {
        if (!this._editedRecord || !this._params)
            return;

        try {
            // Save record (handles both add and update)
            await this._params.personStore.saveRecord(this._editedRecord);
            this.closeDialog();
        } catch (error) {
            console.error("Error saving record:", error);
        }
    }

    private async deleteClick() {
        if (!this._editedRecord || !this._params || !this._editedRecord.id || !this._localize)
            return;

        if (!confirm(this._localize('dialog.delete_confirm'))) {
            return;
        }
        
        try {
            await this._params.personStore.deleteRecord(this._editedRecord.id);
            this.closeDialog();
        } catch (error) {
            console.error("Error deleting record:", error);
        }
    }

    private closeDialog() {
        this._params = undefined;
        this._editedRecord = undefined;
    }
}
