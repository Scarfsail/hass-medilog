import { LitElement, css, html, nothing, PropertyValues } from "lit-element"
import { customElement, property, state } from "lit/decorators.js";
import dayjs from "dayjs";
import { MedilogRecord, Medication } from "./models";
import type { HomeAssistant } from "../hass-frontend/src/types";
import { mdiClose, mdiPencil } from '@mdi/js';
import { sharedStyles, sharedTableStyles } from "./shared-styles";
import { getLocalizeFunction, LocalizeFunction } from "./localize/localize";
import { Utils } from "./utils";
import { MedicationsStore } from "./medications-store";
import { showMedicationDialog } from "./medilog-medications-manager";

export interface MedicationPickerParams {
    medications: MedicationsStore;
    personId: string;
    allRecords: MedilogRecord[];
    onSelect: (medication: Medication | null) => void;
}

@customElement("medilog-medication-picker")
export class MedilogMedicationPicker extends LitElement {
    // Static styles
    static styles = [sharedStyles, sharedTableStyles, css`
        .dialog-content {
            display: flex;
            flex-direction: column;
            gap: 16px;
            padding: 0;
            max-height: 60vh;
        }

        .filter-container {
            position: sticky;
            top: 0;
            background: var(--card-background-color);
            padding: 16px 24px 0 24px;
        }

        .filter-input {
            width: 100%;
        }

        .table-container {
            overflow-y: auto;
            flex: 1;
            padding: 0 24px 16px 24px;
        }

        table {
            width: 100%;
        }

        tbody tr {
            cursor: pointer;
            transition: background-color 0.2s;
        }

        tbody tr:hover {
            background-color: var(--secondary-background-color);
        }

        .add-new-row {
            background-color: var(--primary-color);
            color: var(--text-primary-color);
            font-weight: 500;
        }

        .add-new-row:hover {
            background-color: var(--primary-color);
            opacity: 0.9;
        }

        .add-new-row td {
            text-align: center;
            padding: 16px;
        }

        .last-taken {
            color: var(--secondary-text-color);
            font-size: 0.9em;
        }

        .never-taken {
            color: var(--disabled-text-color);
            font-style: italic;
        }

        .empty-state {
            text-align: center;
            padding: 48px 16px;
            color: var(--secondary-text-color);
        }

        .actions-column {
            width: 40px;
            text-align: center;
            padding: 4px;
        }

        .edit-icon {
            --mdc-icon-button-size: 32px;
            --mdc-icon-size: 18px;
            color: var(--primary-color);
            cursor: pointer;
        }

        .edit-icon:hover {
            color: var(--primary-color);
            opacity: 0.7;
        }

        tbody tr:hover .edit-icon {
            color: var(--primary-text-color);
        }
    `]

    // Private properties
    private _localize?: LocalizeFunction;

    // Public properties
    @property({ attribute: false }) public hass!: HomeAssistant;

    // State properties
    @state() private _params?: MedicationPickerParams;
    @state() private _filterText: string = '';
    @state() private _sortedMedications: Array<{ med: Medication, lastTaken?: dayjs.Dayjs }> = [];

    // Public methods
    public showDialog(params: MedicationPickerParams): void {
        this._params = params;
        this._filterText = '';
        this._calculateSortedMedications();
    }

    // Lifecycle methods
    willUpdate(changedProperties: PropertyValues) {
        if (!this._localize && this.hass) {
            this._localize = getLocalizeFunction(this.hass);
        }
    }

    // Render method
    render() {
        if (!this._params || !this._localize) {
            return nothing;
        }

        const filteredMedications = this._getFilteredMedications();
        const showAddNew = this._shouldShowAddNew();

        return html`
            <ha-dialog open .heading=${false} @closed=${this._handleClose} @close-dialog=${this._handleClose} @opened=${this._handleOpened}>
                <div class="dialog-content">
                    <div class="filter-container">
                        <ha-input
                            id="filter-input"
                            class="filter-input"
                            .label=${this._localize('medication_picker.filter_placeholder')}
                            .value=${this._filterText}
                            tabindex="0"
                            @input=${(e: Event) => {
                                this._filterText = (e.target as HTMLInputElement).value;
                            }}
                            @keydown=${this._handleKeyDown}
                        ></ha-input>
                    </div>

                    <div class="table-container">
                        ${filteredMedications.length === 0 && !showAddNew ? html`
                            <div class="empty-state">
                                ${this._localize('medications_manager.no_results')}
                            </div>
                        ` : html`
                            <table>
                                <thead>
                                    <tr>
                                        <th>${this._localize('medication_picker.medication_name')}</th>
                                        <th>${this._localize('medication_picker.last_taken')}</th>
                                        <th class="actions-column"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${filteredMedications.map(item => html`
                                        <tr @click=${() => this._handleSelect(item.med)}>
                                            <td>${this._renderMedicationName(item.med)}</td>
                                            <td class="last-taken ${!item.lastTaken ? 'never-taken' : ''}">
                                                ${item.lastTaken 
                                                    ? Utils.formatDurationFromTo(item.lastTaken)
                                                    : this._localize!('medication_picker.never')}
                                            </td>
                                            <td class="actions-column">
                                                <ha-icon-button
                                                    class="edit-icon"
                                                    .path=${mdiPencil}
                                                    .label=${this._localize!('common.edit')}
                                                    @click=${(e: Event) => this._handleEdit(e, item.med)}
                                                ></ha-icon-button>
                                            </td>
                                        </tr>
                                    `)}
                                    ${showAddNew ? html`
                                        <tr class="add-new-row" @click=${this._handleAddNew}>
                                            <td colspan="3">${this._localize('medication_picker.add_new_medication')}</td>
                                        </tr>
                                    ` : nothing}
                                </tbody>
                            </table>
                        `}
                    </div>
                </div>
            </ha-dialog>
        `;
    }

    // Private helper methods
    private _calculateSortedMedications() {
        if (!this._params?.medications) {
            this._sortedMedications = [];
            return;
        }

        // Build usage map from person's records
        const usageMap = new Map<string, dayjs.Dayjs>();
        this._params.allRecords?.forEach(record => {
            if (record.medication_id) {
                const existing = usageMap.get(record.medication_id);
                if (!existing || record.datetime.isAfter(existing)) {
                    usageMap.set(record.medication_id, record.datetime);
                }
            }
        });

        // Separate into used and unused groups
        const used: Array<{ med: Medication, lastTaken: dayjs.Dayjs }> = [];
        const unused: Array<{ med: Medication }> = [];

        this._params.medications.all.forEach(med => {
            const lastUsed = usageMap.get(med.id);
            if (lastUsed) {
                used.push({ med, lastTaken: lastUsed });
            } else {
                unused.push({ med });
            }
        });

        // Sort each group
        used.sort((a, b) => b.lastTaken.diff(a.lastTaken)); // Most recent first
        unused.sort((a, b) => a.med.name.localeCompare(b.med.name)); // Alphabetical

        // Combine
        this._sortedMedications = [...used, ...unused];
    }

    private _getFilteredMedications(): Array<{ med: Medication, lastTaken?: dayjs.Dayjs }> {
        if (!this._filterText.trim()) {
            return this._sortedMedications;
        }

        const filter = this._filterText.toLowerCase();
        return this._sortedMedications.filter(item =>
            item.med.name.toLowerCase().includes(filter) ||
            item.med.units?.toLowerCase().includes(filter) ||
            item.med.active_ingredient?.toLowerCase().includes(filter)
        );
    }

    private _shouldShowAddNew(): boolean {
        // Always show "Add new" button
        return true;
    }

    private _renderMedicationName(medication: Medication) {
        if (medication.is_antipyretic) {
            return html`
                <div class="medication-content">
                    <ha-icon class="antipyretic-icon" icon="mdi:thermometer-chevron-down"></ha-icon>
                    <span class="antipyretic-medication">${medication.name}</span>
                </div>
            `;
        }
        return medication.name;
    }

    private _handleKeyDown(e: KeyboardEvent) {
        if (e.key === 'Escape') {
            this._handleClose();
        } else if (e.key === 'Enter') {
            const filteredMedications = this._getFilteredMedications();
            if (filteredMedications.length === 1) {
                // If only one medication matches, select it
                this._handleSelect(filteredMedications[0].med);
            } else if (this._shouldShowAddNew()) {
                // If no exact match but filter has text, add new
                this._handleAddNew();
            }
        }
    }

    private _handleOpened() {
        // Focus the filter input when dialog opens
        const filterInput = this.shadowRoot?.querySelector('#filter-input') as any;
        if (filterInput) {
            // Try to focus the internal input element if it exists
            if (filterInput.focusElement) {
                filterInput.focusElement.focus();
            } else if (filterInput.focus) {
                filterInput.focus();
            }
        }
    }

    private _handleSelect(medication: Medication) {
        if (this._params) {
            this._params.onSelect(medication);
        }
        this._handleClose();
    }

    private _handleEdit(e: Event, medication: Medication) {
        e.stopPropagation(); // Prevent row click from selecting the medication
        
        if (!this._params) return;

        showMedicationDialog(this, {
            medications: this._params.medications,
            medication: medication,
            onClose: async (changed) => {
                if (changed) {
                    // Medications are automatically refreshed by the store
                    this._calculateSortedMedications();
                    this.requestUpdate();
                }
                // Refocus the filter input
                requestAnimationFrame(() => {
                    const filterInput = this.shadowRoot?.querySelector('#filter-input') as any;
                    if (filterInput) {
                        filterInput.focus();
                    }
                });
            }
        });
    }

    private _handleAddNew() {
        if (!this._params) return;

        const medicationName = this._filterText.trim();
        
        showMedicationDialog(this, {
            medications: this._params.medications,
            initialName: medicationName,
            onClose: async (changed) => {
                if (changed) {
                    // Medications are automatically refreshed by the store
                    this._calculateSortedMedications();
                    
                    // Find the newly created medication by name
                    const newMedication = this._params?.medications.all.find(
                        med => med.name.toLowerCase() === medicationName.toLowerCase()
                    );
                    
                    if (newMedication) {
                        // Auto-select the newly created medication and close picker
                        if (this._params) {
                            this._params.onSelect(newMedication);
                        }
                        this._handleClose();
                    } else {
                        // Clear filter and stay in picker
                        this._filterText = '';
                        this.requestUpdate();
                    }
                } else {
                    // User cancelled - refocus the filter input
                    requestAnimationFrame(() => {
                        const filterInput = this.shadowRoot?.querySelector('#filter-input') as any;
                        if (filterInput) {
                            filterInput.focus();
                        }
                    });
                }
            }
        });
    }

    private _handleClose() {
        this._params = undefined;
        this._filterText = '';
        this._sortedMedications = [];
    }
}

export function showMedicationPicker(element: HTMLElement, params: MedicationPickerParams) {
    const event = new CustomEvent("show-dialog", {
        bubbles: true,
        composed: true,
        detail: {
            dialogTag: "medilog-medication-picker",
            dialogImport: () => import("./medilog-medication-picker"),
            dialogParams: params
        }
    });
    element.dispatchEvent(event);
}
