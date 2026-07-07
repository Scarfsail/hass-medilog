import type { HomeAssistant } from "../hass-frontend/src/types";
import { MedicationsStore } from "./medications-store";
import { PersonsInfo } from "./persons-info";
import { MedilogRecords } from "./medilog-records-store";
import { CacheConfig } from "./cache-config";

/**
 * Centralized data storage for the MediLog card.
 * Contains all medications, persons info, and medilog records.
 * This provides a single source of truth for all data with:
 * - Medications: Always loaded
 * - PersonsInfo: Always loaded
 * - MedilogRecords: Lazy loaded per person
 */
export class DataStore {
    public medications: MedicationsStore;
    public persons: PersonsInfo;
    public records: MedilogRecords;

    private _hass: HomeAssistant;
    private _onDataChanged: () => void;

    constructor(hass: HomeAssistant, onDataChanged: () => void) {
        this._hass = hass;
        this._onDataChanged = onDataChanged;

        // Initialize all storage classes
        this.medications = new MedicationsStore(hass, this._onDataChanged);
        this.persons = new PersonsInfo(hass, this._onDataChanged);
        this.records = new MedilogRecords(hass, this._onDataChanged);
    }

    /**
     * Initialize the data store by loading medications and persons.
     * Records are lazy-loaded per person when needed.
     */
    async initialize(): Promise<void> {
        // Fetch medications first (needed for data conversion)
        await this.medications.fetch();
        // Then fetch persons (may need medications for conversion)
        await this.persons.fetchPersons();
        // Records are not loaded here - they're lazy loaded per person
    }

    /**
     * Get medications and automatically refresh if data is stale (>1 minute old)
     */
    async getMedications(): Promise<void> {
        if (CacheConfig.isStale(this.medications.lastRefreshTime)) {
            await this.medications.fetch();
        }
    }

}
