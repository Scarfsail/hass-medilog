import type { HomeAssistant } from "../hass-frontend/src/types";
import { PersonInfo, PersonInfoRaw } from "./models";
import { Utils } from "./utils";

/**
 * Container class for persons info with fast lookup capabilities.
 * This object is passed by reference, so when persons are updated,
 * all components automatically see the fresh data.
 */
export class PersonsInfo {
    private _persons: PersonInfo[] = [];
    private _personsMap: Map<string, PersonInfo> = new Map();
    private _hass: HomeAssistant;
    private _onPersonsFetched: () => void;

    constructor(hass: HomeAssistant, onPersonsFetched: () => void) {
        this._persons = [];
        this._personsMap = new Map();
        this._hass = hass;
        this._onPersonsFetched = onPersonsFetched;
    }

    async fetchPersons() {
        if (!this._hass) return;

        try {
            const response = await this._hass.callService('medilog', 'get_person_list', {}, {}, true, true);
            if (response && response.response.persons) {
                const persons = (response.response.persons as PersonInfoRaw[]).map((person) => ({
                    entity: person.entity,
                    name: this._hass?.states[person.entity]?.attributes?.friendly_name ?? person.entity,
                    entity_picture: this._hass?.states[person.entity]?.attributes?.entity_picture,
                    recent_record: Utils.convertMedilogRecordRawToMedilogRecord(person.recent_record)
                } as PersonInfo)).sort((a, b) => a.name.localeCompare(b.name));
                
                // Update the PersonsInfo object - this preserves the reference
                this.update(persons);
                // Trigger re-render
                this._onPersonsFetched();
            }
        } catch (error) {
            console.error("Error fetching persons:", error);
        }
    }

    /**
     * Get all persons as an array
     */
    get all(): PersonInfo[] {
        return this._persons;
    }

    /**
     * Get a person by entity ID with O(1) lookup
     */
    getPerson(entity: string | undefined): PersonInfo | undefined {
        if (!entity) return undefined;
        return this._personsMap.get(entity);
    }

    /**
     * Get person name by entity ID (convenience method)
     */
    getPersonName(entity: string | undefined): string {
        if (!entity) return '';
        return this._personsMap.get(entity)?.name || '';
    }

    /**
     * Get the person with the most recent record
     */
    getPersonWithMostRecentRecord(): PersonInfo | undefined {
        if (this._persons.length === 0) return undefined;
        
        return [...this._persons].sort((a, b) => 
            (a.recent_record?.datetime ?? 0) > (b.recent_record?.datetime ?? 0) ? -1 : 1
        )[0];
    }

    /**
     * Update the persons list and rebuild the Map
     * This preserves the object reference while updating the data
     */
    private update(persons: PersonInfo[]): void {
        this._persons = persons;
        this._personsMap = new Map(persons.map(p => [p.entity, p]));
    }
}
