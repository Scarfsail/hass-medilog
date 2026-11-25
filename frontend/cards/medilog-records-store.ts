import type { HomeAssistant } from "../types/ha";
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
    private _firstFetchByPerson: Map<string, Promise<MedilogPersonRecordsStore>> = new Map();
    private _getHass: () => HomeAssistant;
    private _onRecordsChanged: () => void;

    constructor(getHass: () => HomeAssistant, onRecordsChanged: () => void) {
        super();
        this._storesByPerson = new Map();
        this._getHass = getHass;
        this._onRecordsChanged = onRecordsChanged;
    }

    /**
     * Get the person records store for a specific person.
     * Lazy loads if not already cached, otherwise returns cached store.
     * Automatically re-fetches data if last refresh was more than 1 minute ago.
     * Always returns a store (either freshly created or existing).
     */
    async getStoreForPerson(person: PersonInfo, forceRefresh: boolean = false): Promise<MedilogPersonRecordsStore> {
        const store = this._storesByPerson.get(person.entity);
        if (store) {
            if (CacheConfig.shouldRefresh(store.lastRefreshTime, forceRefresh)) {
                await store.fetch();
            }
            return store;
        }

        // Callers arriving while the first fetch is in flight share it, and with it one store
        let firstFetch = this._firstFetchByPerson.get(person.entity);
        if (!firstFetch) {
            // Create new store with callback that triggers both the main callback and event dispatch
            const onChanged = () => {
                this._onRecordsChanged();
                this.dispatchEvent(new CustomEvent('records-changed'));
            };
            const newStore = new MedilogPersonRecordsStore(person.entity, this._getHass, onChanged);
            firstFetch = newStore.fetch().then(() => {
                this._storesByPerson.set(person.entity, newStore);
                this._firstFetchByPerson.delete(person.entity);
                return newStore;
            });
            this._firstFetchByPerson.set(person.entity, firstFetch);
        }
        return firstFetch;
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
