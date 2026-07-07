import { LitElement, css, html, nothing, PropertyValues } from "lit-element"
import { customElement, property, state } from "lit/decorators.js";
import { Medication, MedilogRecord, PersonInfo } from "./models";
import type { HomeAssistant } from "../hass-frontend/src/types";
import { sharedStyles } from "./shared-styles";
import { getLocalizeFunction, LocalizeFunction } from "./localize/localize";
import { DataStore } from "./data-store";
import "./medilog-records-table";

@customElement("medilog-medications-usage")
export class MedilogMedicationsUsage extends LitElement {
    // Static styles
    static styles = [sharedStyles, css`
        .container {
            padding: 16px;
        }

        .medication-selector {
            margin-bottom: 24px;
        }

        .medication-selector ha-select {
            width: 100%;
            max-width: 400px;
        }

        .empty-state {
            text-align: center;
            padding: 48px 16px;
            color: var(--secondary-text-color);
        }

        .empty-state ha-icon {
            --mdc-icon-size: 64px;
            color: var(--disabled-text-color);
            margin-bottom: 16px;
        }

        ha-expansion-panel {
            margin-bottom: 8px;
        }

        .person-header {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .person-header ha-icon {
            --mdc-icon-size: 20px;
        }

        .usage-count {
            color: var(--secondary-text-color);
            font-size: 0.875rem;
            margin-left: auto;
        }
    `]

    // Private properties
    private _recordsChangeListener?: () => void;
    private _localize?: (key: string) => string;

    // Public properties
    @property({ attribute: false }) public hass?: HomeAssistant;
    @property({ attribute: false }) public dataStore!: DataStore;
    @property({ attribute: false }) public selectedMedicationId?: string;

    // State properties
    @state() private _selectedMedicationId?: string;
    @state() private _personUsageData: Map<string, MedilogRecord[]> = new Map();

    // Lifecycle methods
    async connectedCallback() {
        super.connectedCallback();
        // Listen for record changes
        this._recordsChangeListener = () => this._handleRecordsChanged();
        this.dataStore?.records?.addEventListener('records-changed', this._recordsChangeListener);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        // Clean up event listener
        if (this._recordsChangeListener) {
            this.dataStore?.records?.removeEventListener('records-changed', this._recordsChangeListener);
        }
    }

    async updated(changedProperties: Map<string, any>) {
        super.updated(changedProperties);
        // If selectedMedicationId was set externally, load its data
        if (changedProperties.has('selectedMedicationId') && this.selectedMedicationId) {
            this._selectedMedicationId = this.selectedMedicationId;
            await this._loadUsageData(this.selectedMedicationId);
        }
    }

    // Lifecycle methods
    willUpdate(changedProperties: PropertyValues) {
        if (!this._localize && this.hass) {
            this._localize = getLocalizeFunction(this.hass);
        }
    }

    // Render method
    render() {
        if (!this._localize) {
            return nothing;
        }

        const medications = (this.dataStore?.medications?.all || [])
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name));

        return html`
            <div class="container">
                <div class="medication-selector">
                    <ha-select
                        .label=${this._localize('medications_usage.select_medication')}
                        .value=${this._selectedMedicationId || ''}
                        @selected=${this._handleMedicationSelected}
                        @closed=${(e: Event) => e.stopPropagation()}
                    >
                        <ha-list-item value="">${''}</ha-list-item>
                        ${medications.map(med => html`
                            <ha-list-item .value=${med.id}>
                                ${med.name}${med.units ? ` (${med.units})` : ''}
                            </ha-list-item>
                        `)}
                    </ha-select>
                </div>

                ${this._renderUsageContent()}
            </div>
        `;
    }

    // Private helper methods
    private _renderUsageContent() {
        if (!this._selectedMedicationId) {
            return html`
                <div class="empty-state">
                    <ha-icon icon="mdi:pill-multiple"></ha-icon>
                    <p>${this._localize?.('medications_usage.select_medication_prompt')}</p>
                </div>
            `;
        }

        if (this._personUsageData.size === 0) {
            return html`
                <div class="empty-state">
                    <ha-icon icon="mdi:information-outline"></ha-icon>
                    <p>${this._localize?.('medications_usage.no_usage_data')}</p>
                </div>
            `;
        }

        const personsWithUsage = Array.from(this._personUsageData.entries())
            .sort(([entityA], [entityB]) => {
                const personA = this.dataStore.persons.getPerson(entityA);
                const personB = this.dataStore.persons.getPerson(entityB);
                return (personA?.name || '').localeCompare(personB?.name || '');
            });

        return html`
            ${personsWithUsage.map(([entity, records], idx) => {
                const person = this.dataStore.persons.getPerson(entity);
                if (!person) return nothing;

                return html`
                    <ha-expansion-panel
                        .outlined=${true}
                        .expanded=${true}
                        .header=${this._getPersonHeader(person, records.length)}
                    >
                        <medilog-records-table
                            .person=${person}
                            .hass=${this.hass}
                            .records=${records}
                            .dataStore=${this.dataStore}
                        ></medilog-records-table>
                    </ha-expansion-panel>
                `;
            })}
        `;
    }

    private _getPersonHeader(person: PersonInfo, count: number): string {
        if (!this._localize) return '';
        return `${person.name} (${count} ${count === 1 ? this._localize('medications_usage.record') : this._localize('medications_usage.records')})`;
    }

    private async _handleMedicationSelected(e: CustomEvent) {
        const select = e.target as any;
        const medicationId = select.value;

        if (!medicationId) {
            this._selectedMedicationId = undefined;
            this._personUsageData = new Map();
            return;
        }

        this._selectedMedicationId = medicationId;
        await this._loadUsageData(medicationId);
    }

    private async _loadUsageData(medicationId: string): Promise<void> {
        if (!this.dataStore?.records || !this.dataStore?.persons) {
            return;
        }

        const personUsageData = new Map<string, MedilogRecord[]>();

        // Iterate through all persons and collect records with the selected medication
        for (const person of this.dataStore.persons.all) {
            try {
                const personStore = await this.dataStore.records.getStoreForPerson(person);
                const medicationRecords = personStore.all
                    .filter(record => record.medication_id === medicationId)
                    .sort((a, b) => b.datetime.valueOf() - a.datetime.valueOf()); // Sort descending (newest first)

                if (medicationRecords.length > 0) {
                    personUsageData.set(person.entity, medicationRecords);
                }
            } catch (error) {
                console.error(`Error loading records for person ${person.entity}:`, error);
            }
        }

        this._personUsageData = personUsageData;
    }

    private async _handleRecordsChanged(): Promise<void> {
        // Reload data for the currently selected medication
        if (this._selectedMedicationId) {
            await this._loadUsageData(this._selectedMedicationId);
        }
    }
}
