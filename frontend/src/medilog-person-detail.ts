import { LitElement, css, html, PropertyValues } from "lit-element"
import { customElement, property, state } from "lit/decorators.js";
import dayjs from "dayjs";
import duration from 'dayjs/plugin/duration'
import 'dayjs/locale/cs';
import { MedilogRecord, MedilogRecordRaw, MedilogRecordsGroupByTime, PersonInfo, PersonInfoRaw, Medication } from "./models";
import type { HomeAssistant } from "../hass-frontend/src/types";
import { MedilogRecordDetailDialogParams } from "./medilog-record-detail-dialog";
import { getLocalizeFunction, LocalizeFunction } from "./localize/localize";
import "./medilog-records"
import "./medilog-records-medications"
import { showMedilogRecordDetailDialog } from "./medilog-records-table";
import { Utils } from "./utils";
import { DataStore } from "./data-store";
import { MedilogPersonRecordsStore } from "./medilog-person-records-store";
import { sharedStyles } from "./shared-styles";
dayjs.extend(duration);

@customElement("medilog-person-detail")
export class MedilogPersonDetail extends LitElement {
    // Static styles
    static styles = [sharedStyles, css`

        ha-expansion-panel {
            margin: 4px;
            margin-bottom: 8px;
        }
    `]

    // Private properties
    private _person?: PersonInfo
    private _personStore?: MedilogPersonRecordsStore
    private _localize?: LocalizeFunction;

    // Public properties
    @property({ attribute: false }) public set person(value: PersonInfo) {
        const prevPerson = this._person;
        this._person = value;
        if (prevPerson !== value) {
            this.showAllGroups = false;
            this.loadPersonStore();
        }
    }
    @property({ attribute: false }) public hass?: HomeAssistant;
    @property({ attribute: false }) public dataStore!: DataStore;

    // State properties
    @state() private viewMode: 'timeline' | 'medications' = 'timeline';
    @state() private showAllGroups = false;

    // Lifecycle methods
    connectedCallback() {
        super.connectedCallback();
        this.loadPersonStore();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
    }

    willUpdate(changedProperties: PropertyValues) {
        if (!this._localize && changedProperties.has('hass') && this.hass) {
            this._localize = getLocalizeFunction(this.hass);
        }
    }

    // Render method
    render() {
        if (!this._person) {
            return "Person is not defined";
        }
        if (!this._localize) {
            return html`<ha-circular-progress active></ha-circular-progress>`;
        }

        // Show initial loading if no store yet
        if (!this._personStore) {
            return html`<ha-circular-progress active></ha-circular-progress>`;
        }

        const { visibleGroups, hasMoreGroups } = this._getVisibleGroups();

        return html`
            <div class="controls">
                <div class="view-toggle">
                    <ha-button .appearance=${this.viewMode === 'timeline' ? 'accent' : 'plain'} @click=${() => this.viewMode = 'timeline'}>
                        <ha-icon icon="mdi:timeline-clock"></ha-icon>
                    </ha-button>
                    <ha-button .appearance=${this.viewMode === 'medications' ? 'accent' : 'plain'} @click=${() => this.viewMode = 'medications'}>
                        <ha-icon icon="mdi:pill-multiple"></ha-icon>
                    </ha-button>
                </div>
                <ha-button @click=${this.addNewRecord} .appearance=${'plain'}>
                    <ha-icon icon="mdi:plus"></ha-icon> 
                    ${this._localize('actions.add_record')}
                </ha-button>
                ${this._personStore.isLoading ? html`
                    <ha-circular-progress active indeterminate style="--md-circular-progress-size: 24px; margin-left: 8px;"></ha-circular-progress>
                ` : ''}
            </div>
            
            ${this.viewMode === 'timeline' ? html`
                ${visibleGroups.map((group, idx) => html`
                    <ha-expansion-panel .outlined=${true} .expanded=${idx == 0} header=${group.from ? `${Utils.formatDate(group.from)} - ${Utils.formatDate(group.to)}` : Utils.formatDate(group.to)}>
                        <medilog-records .records=${group.records} .hass=${this.hass} .person=${this._person} .dataStore=${this.dataStore}></medilog-records>
                    </ha-expansion-panel>
                `)}
                ${hasMoreGroups ? html`
                    <div style="margin: 16px;">
                        <ha-button @click=${this._showMoreGroups}>
                            ${this._localize('actions.show_more')}
                        </ha-button>
                    </div>
                ` : ''}
            ` : html`
                <medilog-records-medications .records=${this._personStore.all} .hass=${this.hass} .person=${this._person} .dataStore=${this.dataStore}></medilog-records-medications>
            `}
        `
    }

    // Private helper methods
    private loadPersonStore(): void {
        if (!this.hass || !this._person || !this.dataStore) return;

        if (!this._person.entity) {
            console.warn("Cannot load records: person is missing entity_id");
            return;
        }

        // Get the store for this person (lazy loads if needed)
        // Don't await - let it run async and the store will notify us via callback when ready
        this.dataStore.records.getStoreForPerson(this._person, true)
            .then(store => {
                this._personStore = store;
                this.requestUpdate();
            })
            .catch(error => {
                console.error("Error loading person store:", error);
            });
    }

    private addNewRecord() {
        showMedilogRecordDetailDialog(this, {
            personStore: this._personStore!,
            medications: this.dataStore.medications,
            record: {
                datetime: dayjs(),
                temperature: undefined,
                medication_id: undefined,
                note: ''
            }
        })

    }

    private _getVisibleGroups(): { visibleGroups: MedilogRecordsGroupByTime[], hasMoreGroups: boolean } {
        if (!this._personStore || this.showAllGroups) {
            return { 
                visibleGroups: this._personStore?.grouped || [], 
                hasMoreGroups: false 
            };
        }

        const threeMonthsAgo = dayjs().subtract(3, 'months');
        const recentGroups = this._personStore.grouped.filter(group => 
            group.to.isAfter(threeMonthsAgo)
        );

        // If no groups have records in the last 3 months, show the last group (most recent)
        const visibleGroups = recentGroups.length > 0 
            ? recentGroups 
            : this._personStore.grouped.slice(0, 1);

        const hasMoreGroups = visibleGroups.length < this._personStore.grouped.length;

        return { visibleGroups, hasMoreGroups };
    }

    private _showMoreGroups() {
        this.showAllGroups = true;
    }
}