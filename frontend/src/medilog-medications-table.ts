import { LitElement, css, html, nothing, PropertyValues } from "lit-element"
import { customElement, property, state } from "lit/decorators.js";
import { Medication } from "./models";
import type { HomeAssistant } from "../hass-frontend/src/types";
import { sharedStyles, sharedTableStyles } from "./shared-styles";
import { getLocalizeFunction, LocalizeFunction } from "./localize/localize";
import { DataStore } from "./data-store";
import { showMedicationDialog } from "./medilog-medications-manager";

@customElement("medilog-medications-table")
export class MedilogMedicationsTable extends LitElement {
    // Static styles
    static styles = [sharedStyles, sharedTableStyles, css`
        table th {
            text-align: left;
            padding: 8px;
            vertical-align: top;
        }

        table td {
            text-align: left;
        }

        .filter-field {
            width: 100%;
            --mdc-text-field-outlined-idle-border-color: var(--divider-color);
            --mdc-text-field-outlined-hover-border-color: var(--primary-color);
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

        .antipyretic-badge {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 4px 8px;
            border-radius: 12px;
            background-color: var(--info-color);
            color: white;
            font-size: 0.875rem;
        }

        .usage-cell {
            cursor: pointer;
            color: var(--primary-color);
            font-weight: 500;
            text-decoration: underline;
        }

        tr:hover .usage-cell {
            color: var(--primary-text-color);
        }

        .usage-cell:hover {
            color: var(--primary-text-color);
            background-color: var(--primary-color) !important;
            text-decoration: none;
        }
    `]

    // Private properties
    private _localize?: LocalizeFunction;

    // Public properties
    @property({ attribute: false }) public hass?: HomeAssistant;
    @property({ attribute: false }) public dataStore!: DataStore;
    @property({ attribute: false }) public onUsageClick?: (medicationId: string) => void;

    // State properties
    @state() private _filterName: string = '';
    @state() private _filterUnits: string = '';
    @state() private _filterAntipyretic: string = '';
    @state() private _filterIngredient: string = '';
    @state() private _usageCounts: Map<string, number> = new Map();

    // Lifecycle methods
    async connectedCallback() {
        super.connectedCallback();
        await this._calculateUsageCounts();
    }

    async updated(changedProperties: Map<string, any>) {
        super.updated(changedProperties);
        // Recalculate if dataStore changed
        if (changedProperties.has('dataStore')) {
            await this._calculateUsageCounts();
        }
    }

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

        const filteredMedications = this._getFilteredMedications();

        return html`
            ${filteredMedications.length === 0 && !this._filterName && !this._filterUnits && !this._filterAntipyretic && !this._filterIngredient ? html`
                <div class="empty-state">
                    <ha-icon icon="mdi:pill"></ha-icon>
                    <p>${this._localize('medications_manager.empty_state')}</p>
                </div>
            ` : html`
                <table>
                    <thead>
                        <tr>
                            <th>
                                <ha-input
                                    class="filter-field"
                                    .label=${this._localize('medications_manager.column_name')}
                                    .value=${this._filterName}
                                    @input=${(e: Event) => {
                                        this._filterName = (e.target as HTMLInputElement).value;
                                    }}
                                ></ha-input>
                            </th>
                            <th>
                                <ha-input
                                    class="filter-field"
                                    .label=${this._localize('medications_manager.column_units')}
                                    .value=${this._filterUnits}
                                    @input=${(e: Event) => {
                                        this._filterUnits = (e.target as HTMLInputElement).value;
                                    }}
                                ></ha-input>
                            </th>
                            <th>
                                <ha-input
                                    class="filter-field"
                                    .label=${this._localize('medications_manager.column_antipyretic')}
                                    .value=${this._filterAntipyretic}
                                    @input=${(e: Event) => {
                                        this._filterAntipyretic = (e.target as HTMLInputElement).value;
                                    }}
                                ></ha-input>
                            </th>
                            <th>
                                <ha-input
                                    class="filter-field"
                                    .label=${this._localize('medications_manager.column_ingredient')}
                                    .value=${this._filterIngredient}
                                    @input=${(e: Event) => {
                                        this._filterIngredient = (e.target as HTMLInputElement).value;
                                    }}
                                ></ha-input>
                            </th>
                            <th>${this._localize('medications_manager.column_usage')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filteredMedications.map(med => html`
                            <tr @click=${() => this._handleMedicationClick(med)}>
                                <td><strong>${med.name}</strong></td>
                                <td>${med.units || '-'}</td>
                                <td>
                                    ${med.is_antipyretic ? html`
                                        <span class="antipyretic-badge">
                                            <ha-icon icon="mdi:thermometer"></ha-icon>
                                            ${this._localize!('medications_manager.yes')}
                                        </span>
                                    ` : this._localize!('medications_manager.no')}
                                </td>
                                <td>${med.active_ingredient || '-'}</td>
                                <td 
                                    class="usage-cell" 
                                    @click=${(e: Event) => this._handleUsageClick(e, med.id)}
                                >
                                    ${this._usageCounts.get(med.id) ?? 0}
                                </td>
                            </tr>
                        `)}
                    </tbody>
                </table>
                ${filteredMedications.length === 0 ? html`
                    <div class="empty-state">
                        <ha-icon icon="mdi:filter-remove"></ha-icon>
                        <p>${this._localize('medications_manager.no_results')}</p>
                    </div>
                ` : nothing}
            `}
        `;
    }

    // Private helper methods
    private _getFilteredMedications(): Medication[] {
        if (!this._localize) return [];
        
        return this.dataStore?.medications?.all
            .filter(med => {
                const matchesName = !this._filterName.trim() || 
                    med.name.toLowerCase().includes(this._filterName.toLowerCase());
                
                const matchesUnits = !this._filterUnits.trim() || 
                    (med.units?.toLowerCase().includes(this._filterUnits.toLowerCase()) ?? false);
                
                const antipyreticText = med.is_antipyretic 
                    ? this._localize!('medications_manager.yes').toLowerCase()
                    : this._localize!('medications_manager.no').toLowerCase();
                const matchesAntipyretic = !this._filterAntipyretic.trim() || 
                    antipyreticText.includes(this._filterAntipyretic.toLowerCase());
                
                const matchesIngredient = !this._filterIngredient.trim() || 
                    (med.active_ingredient?.toLowerCase().includes(this._filterIngredient.toLowerCase()) ?? false);
                
                return matchesName && matchesUnits && matchesAntipyretic && matchesIngredient;
            })
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    private _handleMedicationClick(medication: Medication) {
        showMedicationDialog(this, {
            medication: medication,
            medications: this.dataStore.medications,
            onClose: (changed: boolean) => {
                
            }
        });
    }

    private _handleUsageClick(e: Event, medicationId: string) {
        e.stopPropagation(); // Prevent row click
        if (this.onUsageClick) {
            this.onUsageClick(medicationId);
        }
    }

    private async _calculateUsageCounts(): Promise<void> {
        if (!this.dataStore?.records || !this.dataStore?.medications?.all) {
            return;
        }

        const counts = new Map<string, number>();
        
        // Initialize counts for all medications
        for (const med of this.dataStore.medications.all) {
            counts.set(med.id, 0);
        }

        // Iterate through all persons and load their stores
        for (const person of this.dataStore.persons.all) {
            try {
                const personStore = await this.dataStore.records.getStoreForPerson(person);
                // Count records for each medication
                for (const record of personStore.all) {
                    if (record.medication_id) {
                        const currentCount = counts.get(record.medication_id) || 0;
                        counts.set(record.medication_id, currentCount + 1);
                    }
                }
            } catch (error) {
                console.error(`Error loading records for person ${person.entity}:`, error);
            }
        }

        this._usageCounts = counts;
    }
}
