import type { HomeAssistant } from "../hass-frontend/src/types";
import { PersonInfo } from "./models";
import { MedilogPersonRecordsStore } from "./medilog-person-records-store";
import { CacheConfig } from "./cache-config";

/**
 * Container class for medilog records with lazy loading per person.
 * Returns MedilogPersonRecordsStore instances that handle their own CRUD operations.
 * This object is passed by reference, so when records are updated,
 * all components automatically see the fresh data.
 * Extends EventTarget to dispatch 'records-changed' events when data changes.
 */
export class MedilogRecords extends EventTarget {
    private _storesByPerson: Map<string, MedilogPersonRecordsStore> = new Map();
    private _hass: HomeAssistant;
    private _onRecordsChanged: () => void;

    constructor(hass: HomeAssistant, onRecordsChanged: () => void) {
        super();
        this._storesByPerson = new Map();
        this._hass = hass;
        this._onRecordsChanged = onRecordsChanged;
    }

    /**
     * Get the person records store for a specific person.
     * Lazy loads if not already cached, otherwise returns cached store.
     * Automatically re-fetches data if last refresh was more than 1 minute ago.
     * Always returns a store (either freshly created or existing).
     */
    async getStoreForPerson(person: PersonInfo, forceRefresh: boolean = false): Promise<MedilogPersonRecordsStore> {
        // If store exists, check if it has data
        let store = this._storesByPerson.get(person.entity);
        
        if (!store) {
            // Create new store with callback that triggers both the main callback and event dispatch
            const onChanged = () => {
                this._onRecordsChanged();
                this.dispatchEvent(new CustomEvent('records-changed'));
            };
            store = new MedilogPersonRecordsStore(person.entity, this._hass, onChanged);
            await store.fetch();
            this._storesByPerson.set(person.entity, store);
        } else {
            // Check if data should be refreshed
            if (CacheConfig.shouldRefresh(store.lastRefreshTime, forceRefresh)) {
                await store.fetch();
            }
        }
                
        return store;
    }

    /**
     * Get a store if already loaded, undefined otherwise.
     * Does not trigger a fetch.
     */
    getCachedStore(personEntity: string): MedilogPersonRecordsStore | undefined {
        return this._storesByPerson.get(personEntity);
    }

    /**
     * Refresh all cached person stores
     */
    async refreshAllCachedStores(): Promise<void> {
        const refreshPromises = Array.from(this._storesByPerson.values()).map(store => store.fetch());
        await Promise.all(refreshPromises);
    }
}
