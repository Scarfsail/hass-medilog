import type { HomeAssistant } from "../hass-frontend/src/types";
import { Medication } from "./models";

/**
 * Container class for medications with fast lookup capabilities.
 * Handles CRUD operations and automatically refreshes data.
 * This object is passed by reference, so when medications are updated,
 * all components automatically see the fresh data.
 */
export class MedicationsStore {
    private _medications: Medication[] = [];
    private _medicationsMap: Map<string, Medication> = new Map();
    private _hass: HomeAssistant;
    private _onMedicationsChanged: () => void;
    private _lastRefreshTime?: Date;

    constructor(hass: HomeAssistant, onMedicationsChanged: () => void) {
        this._medications = [];
        this._medicationsMap = new Map();
        this._hass = hass;
        this._onMedicationsChanged = onMedicationsChanged;
    }

    /**
     * Fetch medications from the backend and update the store
     */
    async fetch() {
        if (!this._hass) return;

        try {
            const response = await this._hass.callService('medilog', 'get_medications', {}, {}, true, true);
            if (response && response.response.medications) {
                // Update the medications - this preserves the reference
                this._update(response.response.medications as Medication[]);
                this._lastRefreshTime = new Date();
                // Trigger re-render
                this._onMedicationsChanged();
            }
        } catch (error) {
            console.error("Error fetching medications:", error);
        }
    }

    /**
     * Add a new medication or update an existing one
     */
    async saveMedication(medication: Partial<Medication>): Promise<void> {
        try {
            const medicationData: any = {
                name: medication.name?.trim(),
                units: medication.units?.trim() || undefined,
                is_antipyretic: medication.is_antipyretic ?? false,
                active_ingredient: medication.active_ingredient?.trim() || undefined
            };

            // Add ID if updating
            if (medication.id) {
                medicationData.id = medication.id;
            }

            await this._hass.callService(
                'medilog',
                'add_or_update_medication',
                medicationData,
                {},
                true,
                false
            );

            // Refresh data after successful save
            await this.fetch();
        } catch (error) {
            console.error('Error saving medication:', error);
            throw error;
        }
    }

    /**
     * Delete a medication by ID
     */
    async deleteMedication(medicationId: string): Promise<void> {
        try {
            await this._hass.callService(
                'medilog',
                'delete_medication',
                { id: medicationId },
                {},
                true,
                false
            );

            // Refresh data after successful delete
            await this.fetch();
        } catch (error) {
            console.error('Error deleting medication:', error);
            throw error;
        }
    }
    /**
     * Get all medications as an array
     */
    get all(): Medication[] {
        return this._medications;
    }

    /**
     * Get the last time medications were refreshed from the backend
     */
    get lastRefreshTime(): Date | undefined {
        return this._lastRefreshTime;
    }

    /**
     * Get a medication by ID with O(1) lookup
     */
    getMedication(id: string | undefined): Medication | undefined {
        if (!id) return undefined;
        return this._medicationsMap.get(id);
    }


    /**
     * Get medication name by ID (convenience method)
     */
    getMedicationName(id: string | undefined): string {
        if (!id) return '';
        return this._medicationsMap.get(id)?.name || '';
    }

    /**
     * Update the medications list and rebuild the Map
     * This preserves the object reference while updating the data
     */
    private _update(medications: Medication[]): void {
        this._medications = medications;
        this._medicationsMap = new Map(medications.map(m => [m.id, m]));
    }
}
