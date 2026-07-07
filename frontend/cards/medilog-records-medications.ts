import { LitElement, css, html, PropertyValues } from "lit-element"
import { customElement, property, state } from "lit/decorators.js";
import dayjs from "dayjs";
import { Medication, MedilogRecord, PersonInfo } from "./models";
import type { HomeAssistant } from "../hass-frontend/src/types";
import { getLocalizeFunction, LocalizeFunction } from "./localize/localize";
import "./medilog-records-table";
import { DataStore } from "./data-store";

type DrillDownLevel = 'year' | 'month' | 'day' | 'hour';

interface MedicationStats {
    medication: string;
    counts: Map<string, number>; // key: time period, value: count
}

interface DrillDownState {
    level: DrillDownLevel;
    year?: number;
    month?: number;
    day?: number;
}

@customElement("medilog-records-medications")
export class MedilogRecordsMedications extends LitElement {
    // Static styles
    static styles = css`
        .medications-container {
            padding: 16px 0;
        }

        .controls {
            margin-bottom: 16px;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .breadcrumb {
            color: var(--secondary-text-color);
            font-size: 14px;
            display: flex;
            align-items: center;
            gap: 4px;
            flex: 1;
        }

        .breadcrumb-item {
            cursor: pointer;
            padding: 4px 8px;
            border-radius: 4px;
            transition: background-color 0.2s ease;
        }

        .breadcrumb-item:hover {
            background-color: var(--secondary-background-color);
            color: var(--primary-color);
        }

        .breadcrumb-item.current {
            cursor: default;
            font-weight: 500;
            color: var(--primary-text-color);
        }

        .breadcrumb-item.current:hover {
            background-color: transparent;
            color: var(--primary-text-color);
        }

        .breadcrumb-separator {
            color: var(--disabled-text-color);
            margin: 0 4px;
        }

        .matrix-table {
            width: 100%;
            border-collapse: collapse;
            overflow-x: auto;
            display: block;
        }

        .matrix-table table {
            width: 100%;
            min-width: 600px;
        }

        .matrix-table th,
        .matrix-table td {
            padding: 8px 4px;
            text-align: center;
            border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
            white-space: nowrap;
        }

        .matrix-table th {
            background-color: var(--secondary-background-color);
            color: var(--secondary-text-color);
            font-weight: 500;
            position: sticky;
            top: 0;
        }

        .matrix-table th.period-header {
            cursor: pointer;
            transition: background-color 0.2s ease;
        }

        .matrix-table th.period-header:hover {
            background-color: var(--divider-color);
        }

        .matrix-table th.medication-header {
            text-align: left;
            width: 1%;
            white-space: nowrap;
            left: 0;
            padding: 8px;
        }

        .matrix-table td.medication-name {
            text-align: left;
            font-weight: 500;
            background-color: var(--card-background-color);
            position: sticky;
            left: 0;
            width: 1%;
            white-space: nowrap;
            padding: 8px;
            cursor: pointer;
            transition: background-color 0.2s ease;
        }

        .matrix-table td.medication-name:hover {
            background-color: var(--secondary-background-color);
        }

        .matrix-table td.count-cell {
            cursor: pointer;
            transition: all 0.2s ease;
            padding: 12px 8px;
        }

        .matrix-table td.count-cell:hover {
            transform: scale(1.05);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        }

        .matrix-table td.count-cell.empty {
            background-color: var(--disabled-color, rgba(0, 0, 0, 0.05));
            color: var(--disabled-text-color, rgba(0, 0, 0, 0.3));
            cursor: default;
        }

        .matrix-table td.count-cell.empty:hover {
            transform: none;
            box-shadow: none;
        }

        .matrix-table tr.highlighted {
            opacity: 0.8;
        }

        .matrix-table tr.highlighted td.medication-name {
            background-color: var(--primary-color);
            color: var(--text-primary-color);
            opacity: 0.9;
        }

        .count-cell-content {
            display: inline-block;
            min-width: 1.5em;
        }

        .no-data {
            text-align: center;
            padding: 32px;
            color: var(--secondary-text-color);
        }

        .filtered-records {
            margin-top: 32px;
            padding-top: 16px;
            border-top: 2px solid var(--divider-color);
        }

        .filtered-records-title {
            font-size: 18px;
            font-weight: 500;
            margin-bottom: 16px;
            color: var(--primary-text-color);
        }
    `

    // Private properties
    private longPressTimer?: number;
    private readonly longPressDuration = 500; // ms
    private _localize?: (key: string) => string;

    // Public properties
    @property({ attribute: false }) public person?: PersonInfo
    @property({ attribute: false }) public hass?: HomeAssistant;
    @property({ attribute: false }) public records?: (MedilogRecord | null)[];
    @property({ attribute: false }) public dataStore!: DataStore;

    // State properties
    @state() private drillDownState: DrillDownState = { level: 'year' };
    @state() private selectedMedications: Set<string> = new Set();

    // Lifecycle methods
    connectedCallback() {
        super.connectedCallback();
        window.addEventListener('popstate', this.handlePopState);
        this.restoreStateFromUrl();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        window.removeEventListener('popstate', this.handlePopState);
        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
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
            return html`<div class="no-data"></div>`;
        }
        
        if (!this.person) {
            return html`<div class="no-data">${this._localize('medications.person_not_defined')}</div>`;
        }

        if (!this.records) {
            return html`<ha-circular-progress active></ha-circular-progress>`;
        }

        const filteredRecords = this.records.filter(r => r !== null) as MedilogRecord[];
        
        if (filteredRecords.length === 0) {
            return html`<div class="no-data">${this._localize('medications.no_data')}</div>`;
        }

        const stats = this.calculateStats(filteredRecords);
        const columns = this.getColumns(filteredRecords);
        const maxCount = this.getMaxCount(stats);

        return html`
            <div class="medications-container">
                <div class="controls">
                    <div class="breadcrumb">
                        ${this.renderBreadcrumb()}
                    </div>
                </div>
                
                <div class="matrix-table">
                    <table>
                        <thead>
                            <tr>
                                <th class="medication-header">${this._localize('medications.medication_column')}</th>
                                ${columns.map(col => html`<th class="${this.drillDownState.level !== 'hour' ? 'period-header' : ''}" @click=${() => this.drillDownState.level !== 'hour' && this.drillDownAll(col.key)}>${col.label}</th>`)}
                            </tr>
                        </thead>
                        <tbody>
                            ${stats.map(stat => html`
                                <tr class="${this.selectedMedications.has(stat.medication) ? 'highlighted' : ''}">
                                    <td class="medication-name" 
                                        @click=${(e: MouseEvent) => this.handleMedicationClick(e, stat.medication)}
                                        @touchstart=${(e: TouchEvent) => this.handleTouchStart(e, stat.medication)}
                                        @touchend=${() => this.handleTouchEnd()}
                                        @touchcancel=${() => this.handleTouchEnd()}
                                    >${stat.medication}</td>
                                    ${columns.map(col => {
                                        const count = stat.counts.get(col.key) || 0;
                                        const isEmpty = count === 0;
                                        return html`
                                            <td 
                                                class="count-cell ${isEmpty ? 'empty' : ''}"
                                                style="${!isEmpty ? this.getHeatMapStyle(count, maxCount) : ''}"
                                                @click=${() => this.handleCellClick(col.key, stat.medication)}
                                            >
                                                <div class="count-cell-content">
                                                    ${isEmpty ? '' : count}
                                                </div>
                                            </td>
                                        `;
                                    })}
                                </tr>
                            `)}
                        </tbody>
                    </table>
                </div>

                ${this.selectedMedications.size > 0 ? html`
                    <div class="filtered-records">
                        <div class="filtered-records-title">
                            ${Array.from(this.selectedMedications).join(', ')} - ${this.renderFilteredRecordsTitle()}
                        </div>
                        <medilog-records-table 
                            .records=${this.getFilteredRecords()} 
                            .hass=${this.hass} 
                            .person=${this.person}
                            .dataStore=${this.dataStore}
                        ></medilog-records-table>
                    </div>
                ` : ''}
            </div>
        `;
    }

    // Private helper methods
    private handlePopState = (event: PopStateEvent) => {
        if (event.state?.medicationsDrillDown) {
            this.drillDownState = event.state.medicationsDrillDown;
            this.requestUpdate();
        } else {
            this.drillDownState = { level: 'year' };
            this.requestUpdate();
        }
    }

    private restoreStateFromUrl() {
        const state = history.state;
        if (state?.medicationsDrillDown) {
            this.drillDownState = state.medicationsDrillDown;
        }
    }

    private pushState(newState: DrillDownState) {
        history.pushState(
            { medicationsDrillDown: newState },
            '',
            window.location.pathname + window.location.search
        );
    }

    private renderBreadcrumb() {
        if (!this._localize) return '';
        const { level, year, month, day } = this.drillDownState;
        const items: Array<{ label: string; level: DrillDownLevel; state: Partial<DrillDownState> }> = [];
        
        // Build breadcrumb items based on current level
        items.push({ label: this._localize('medications.all_years'), level: 'year', state: { level: 'year' } });
        
        if (year !== undefined) {
            items.push({ label: `${this._localize('medications.year')} ${year}`, level: 'month', state: { level: 'month', year } });
        }
        
        if (month !== undefined) {
            items.push({ label: `${this._localize('medications.month')} ${month}`, level: 'day', state: { level: 'day', year, month } });
        }
        
        if (day !== undefined) {
            items.push({ label: `${this._localize('medications.day')} ${day}`, level: 'hour', state: { level: 'hour', year, month, day } });
        }

        return html`
            ${items.map((item, index) => {
                const isLast = index === items.length - 1;
                const isCurrent = item.level === level;
                
                return html`
                    <span 
                        class="breadcrumb-item ${isCurrent ? 'current' : ''}"
                        @click=${() => !isCurrent && this.navigateToLevel(item.state)}
                    >
                        ${item.label}
                    </span>
                    ${!isLast ? html`<span class="breadcrumb-separator">›</span>` : ''}
                `;
            })}
        `;
    }

    private calculateStats(records: MedilogRecord[]): MedicationStats[] {
        const medicationMap = new Map<string, Map<string, number>>();

        // Filter records based on current drill-down state
        const filteredRecords = records.filter(record => {
            if (!record.medication_id) return false;

            const { level, year, month, day } = this.drillDownState;

            if (level === 'month' && year !== undefined) {
                return record.datetime.year() === year;
            }
            if (level === 'day' && year !== undefined && month !== undefined) {
                return record.datetime.year() === year && record.datetime.month() + 1 === month;
            }
            if (level === 'hour' && year !== undefined && month !== undefined && day !== undefined) {
                return record.datetime.year() === year && 
                       record.datetime.month() + 1 === month && 
                       record.datetime.date() === day;
            }

            return true;
        });

        // Group by medication and time period
        filteredRecords.forEach(record => {
            if (!record.medication_id) return;

            const medicationName = this.dataStore.medications.getMedicationName(record.medication_id);
            if (!medicationMap.has(medicationName)) {
                medicationMap.set(medicationName, new Map());
            }

            const counts = medicationMap.get(medicationName)!;
            const key = this.getTimeKey(record.datetime);
            counts.set(key, (counts.get(key) || 0) + 1);
        });

        // Convert to array and sort by medication name
        const stats: MedicationStats[] = Array.from(medicationMap.entries())
            .map(([medication, counts]) => ({ medication, counts }))
            .sort((a, b) => a.medication.localeCompare(b.medication));

        return stats;
    }

    private getTimeKey(datetime: dayjs.Dayjs): string {
        const { level } = this.drillDownState;

        switch (level) {
            case 'year':
                return datetime.year().toString();
            case 'month':
                return (datetime.month() + 1).toString();
            case 'day':
                return datetime.date().toString();
            case 'hour':
                return datetime.hour().toString();
            default:
                return '';
        }
    }

    private getColumns(records: MedilogRecord[]): Array<{ key: string; label: string }> {
        const { level, year, month, day } = this.drillDownState;

        switch (level) {
            case 'year': {
                const years = new Set<number>();
                records.forEach(r => years.add(r.datetime.year()));
                const yearArray = Array.from(years).sort();
                return yearArray.map(y => ({
                    key: y.toString(),
                    label: y.toString().slice(-2) // Show last 2 digits: 23, 24, 25
                }));
            }
            case 'month': {
                return Array.from({ length: 12 }, (_, i) => ({
                    key: (i + 1).toString(),
                    label: (i + 1).toString()
                }));
            }
            case 'day': {
                if (year === undefined || month === undefined) return [];
                const daysInMonth = dayjs(`${year}-${month}-01`).daysInMonth();
                return Array.from({ length: daysInMonth }, (_, i) => ({
                    key: (i + 1).toString(),
                    label: (i + 1).toString()
                }));
            }
            case 'hour': {
                return Array.from({ length: 24 }, (_, i) => ({
                    key: i.toString(),
                    label: i.toString()
                }));
            }
            default:
                return [];
        }
    }

    private getMaxCount(stats: MedicationStats[]): number {
        let max = 0;
        stats.forEach(stat => {
            stat.counts.forEach(count => {
                if (count > max) max = count;
            });
        });
        return max;
    }

    private getHeatMapStyle(count: number, maxCount: number): string {
        if (maxCount === 0) return '';
        
        const intensity = count / maxCount;
        
        // Use CSS custom properties with fallback
        // Darker, more saturated colors for better visibility
        const hue = 210; // Blue hue
        const saturation = 60 + (intensity * 40); // 60% to 100%
        const lightness = 65 - (intensity * 45); // 65% to 20%
        
        return `background-color: hsl(${hue}, ${saturation}%, ${lightness}%); color: ${intensity > 0.3 ? 'white' : 'var(--primary-text-color)'};`;
    }

    private drillDown(key: string) {
        const { level, year, month } = this.drillDownState;

        switch (level) {
            case 'year':
                this.drillDownState = { level: 'month', year: parseInt(key) };
                break;
            case 'month':
                this.drillDownState = { level: 'day', year, month: parseInt(key) };
                break;
            case 'day':
                this.drillDownState = { level: 'hour', year, month, day: parseInt(key) };
                break;
            case 'hour':
                // Already at the deepest level
                return;
        }

        this.pushState(this.drillDownState);
        this.requestUpdate();
    }

    private goBack() {
        const { level, year, month } = this.drillDownState;

        switch (level) {
            case 'month':
                this.drillDownState = { level: 'year' };
                break;
            case 'day':
                this.drillDownState = { level: 'month', year };
                break;
            case 'hour':
                this.drillDownState = { level: 'day', year, month };
                break;
        }

        this.pushState(this.drillDownState);
        this.requestUpdate();
    }

    private navigateToLevel(state: Partial<DrillDownState>) {
        this.drillDownState = state as DrillDownState;
        this.pushState(this.drillDownState);
        this.requestUpdate();
    }

    private handleMedicationClick(event: MouseEvent, medication: string) {
        if (event.ctrlKey || event.metaKey) {
            // Multi-select with Ctrl/Cmd key
            if (this.selectedMedications.has(medication)) {
                this.selectedMedications.delete(medication);
            } else {
                this.selectedMedications.add(medication);
            }
        } else {
            // Single select - toggle if already selected, otherwise clear others
            if (this.selectedMedications.size === 1 && this.selectedMedications.has(medication)) {
                this.selectedMedications.clear();
            } else {
                this.selectedMedications.clear();
                this.selectedMedications.add(medication);
            }
        }
        this.requestUpdate();
    }

    private handleTouchStart(event: TouchEvent, medication: string) {
        this.longPressTimer = window.setTimeout(() => {
            // Long press enables multi-select mode
            if (this.selectedMedications.has(medication)) {
                this.selectedMedications.delete(medication);
            } else {
                this.selectedMedications.add(medication);
            }
            this.requestUpdate();
            // Provide haptic feedback if available
            if (navigator.vibrate) {
                navigator.vibrate(50);
            }
        }, this.longPressDuration);
    }

    private handleTouchEnd() {
        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = undefined;
        }
    }

    private handleCellClick(key: string, medication: string) {
        this.selectedMedications.clear();
        this.selectedMedications.add(medication);
        this.drillDown(key);
    }

    private drillDownAll(key: string) {
        // Don't clear selection when drilling down via header - check if medications exist in new view
        const currentMedications = new Set(this.selectedMedications);
        this.drillDown(key);
        
        // After drill down, check if the selected medications still have records in the new view
        if (currentMedications.size > 0) {
            const medicationsToKeep = new Set<string>();
            currentMedications.forEach(medication => {
                const filteredRecords = this.getFilteredRecordsForMedication(medication);
                if (filteredRecords.length > 0) {
                    medicationsToKeep.add(medication);
                }
            });
            this.selectedMedications = medicationsToKeep;
        }
    }

    private getFilteredRecordsForMedication(medication: string): MedilogRecord[] {
        if (!this.records) return [];

        const filteredRecords = this.records.filter(r => r !== null) as MedilogRecord[];
        const { level, year, month, day } = this.drillDownState;

        return filteredRecords.filter(record => {
            // Filter by medication name
            const medName = this.dataStore.medications.getMedicationName(record.medication_id);
            if (medName !== medication) return false;

            // Filter by time period based on drill-down level
            if (level === 'month' && year !== undefined) {
                return record.datetime.year() === year;
            }
            if (level === 'day' && year !== undefined && month !== undefined) {
                return record.datetime.year() === year && record.datetime.month() + 1 === month;
            }
            if (level === 'hour' && year !== undefined && month !== undefined && day !== undefined) {
                return record.datetime.year() === year && 
                       record.datetime.month() + 1 === month && 
                       record.datetime.date() === day;
            }

            return true;
        });
    }

    private getFilteredRecords(): MedilogRecord[] {
        if (!this.records || this.selectedMedications.size === 0) return [];
        
        const allRecords: MedilogRecord[] = [];
        this.selectedMedications.forEach(medication => {
            allRecords.push(...this.getFilteredRecordsForMedication(medication));
        });
        
        // Sort by datetime descending
        return allRecords.sort((a, b) => b.datetime.diff(a.datetime));
    }

    private renderFilteredRecordsTitle(): string {
        if (!this._localize) return '';
        const { level, year, month, day } = this.drillDownState;

        switch (level) {
            case 'year':
                return this._localize('medications.all_years');
            case 'month':
                return `${this._localize('medications.year')} ${year}`;
            case 'day':
                return `${this._localize('medications.year')} ${year}, ${this._localize('medications.month')} ${month}`;
            case 'hour':
                return `${this._localize('medications.year')} ${year}, ${this._localize('medications.month')} ${month}, ${this._localize('medications.day')} ${day}`;
            default:
                return '';
        }
    }
}
