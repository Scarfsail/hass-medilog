import { LitElement, html, css, nothing, svg, PropertyValues } from 'lit';
import dayjs from 'dayjs';
import { customElement, property, state } from "lit/decorators.js";
import { MedilogRecord } from './models';
import { MedicationsStore } from './medications-store';
import { getLocalizeFunction, LocalizeFunction } from './localize/localize';
import type { HomeAssistant } from '../types/ha';

const HEIGHT = 300;
const PAD = { top: 28, right: 16, bottom: 40, left: 40 };
/** Longest dose label that still fits the plot's height when rotated. */
const MAX_DOSE_LABEL = 30;

const truncate = (text: string, max: number) => text.length > max ? `${text.slice(0, max - 1)}…` : text;

/**
 * Temperatures over time as an SVG line, with a labelled vertical marker at
 * every antipyretic dose. Scales and theming follow hass-helman's
 * `day-line-chart`: the width follows the host, the colours HA's theme.
 */
@customElement("medilog-records-chart")
class MedilogRecordsChart extends LitElement {
    // Static styles
    static styles = css`
        :host {
            display: block;
        }
        svg {
            display: block;
            width: 100%;
            height: ${HEIGHT}px;
        }
        .grid {
            stroke: var(--divider-color, rgba(0, 0, 0, 0.12));
            stroke-width: 1;
        }
        .axis-label {
            fill: var(--secondary-text-color);
            font-size: 11px;
        }
        .line {
            fill: none;
            stroke: var(--primary-color);
            stroke-width: 2;
            stroke-linejoin: round;
        }
        .point {
            fill: var(--primary-color);
            stroke: var(--card-background-color, #fff);
            stroke-width: 2;
        }
        .value-label {
            fill: var(--primary-text-color);
            font-size: 11px;
        }
        .dose {
            stroke: var(--error-color);
            stroke-width: 1.5;
            stroke-dasharray: 4 3;
        }
        .dose-label {
            fill: var(--error-color);
            font-size: 11px;
        }
        ha-checkbox {
            padding: 8px;
        }
        .empty {
            padding: 16px;
            margin: 0;
            color: var(--secondary-text-color);
        }
    `;

    // Private properties
    private _localize?: LocalizeFunction;
    private _resizeObserver?: ResizeObserver;

    // Public properties
    @property({ attribute: false }) public hass!: HomeAssistant;
    @property({ attribute: false }) public records: (MedilogRecord | null)[] = [];
    @property({ attribute: false }) public medications!: MedicationsStore;

    // State properties
    @state() private _showMedications = true;
    @state() private _width = 0;

    // Lifecycle methods
    connectedCallback(): void {
        super.connectedCallback();
        this._resizeObserver = new ResizeObserver((entries) => {
            this._width = Math.round(entries[0]?.contentRect.width ?? 0);
        });
        this._resizeObserver.observe(this);
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();
        this._resizeObserver?.disconnect();
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

        return html`
            ${this._width > 0 ? this._renderSvg(this._localize('chart.temperature')) : nothing}
            <ha-checkbox .checked=${this._showMedications} @change=${this._toggleMedications}>
                ${this._localize('chart.show_medications')}
            </ha-checkbox>
        `;
    }

    // Private helper methods
    private _renderSvg(seriesName: string) {
        const records = this.records
            .filter((record): record is MedilogRecord => record !== null)
            .sort((a, b) => a.datetime.valueOf() - b.datetime.valueOf());
        if (!records.length) {
            return html`<p class="empty">${this._localize!('chart.no_records')}</p>`;
        }
        const temperatures = records
            .filter((record) => record.temperature !== undefined)
            .map((record) => ({ t: record.datetime.valueOf(), v: record.temperature! }));
        const doses = this._showMedications ? records
            .filter((record) => record.medication_id && this.medications.getMedication(record.medication_id)?.is_antipyretic)
            .map((record) => ({ t: record.datetime.valueOf(), label: this.medications.getMedicationName(record.medication_id) })) : [];

        // Time axis: the records' span, a little margin so edge labels fit; an hour either side of a lone moment.
        const times = records.map((record) => record.datetime.valueOf());
        let start = Math.min(...times);
        let end = Math.max(...times);
        const margin = end > start ? (end - start) * 0.04 : 3_600_000;
        start -= margin;
        end += margin;

        // Temperature axis: half a degree around the readings, a whole-degree grid line in between.
        const values = temperatures.map((point) => point.v);
        const low = (values.length ? Math.min(...values) : 37) - 0.5;
        const high = (values.length ? Math.max(...values) : 37) + 0.5;
        const degrees: number[] = [];
        for (let degree = Math.ceil(low); degree <= high; degree++) degrees.push(degree);

        const right = this._width - PAD.right;
        const bottom = HEIGHT - PAD.bottom;
        const x = (t: number) => PAD.left + ((t - start) / (end - start)) * (right - PAD.left);
        const y = (v: number) => PAD.top + (1 - (v - low) / (high - low)) * (bottom - PAD.top);

        // Evenly spaced time labels, each once; the date under the first label of each day.
        const tickCount = Math.max(2, Math.floor((right - PAD.left) / 90));
        const ticks = Array.from({ length: tickCount }, (_, index) => dayjs(start + (index * (end - start)) / (tickCount - 1)))
            .filter((tick, index, all) => index === 0 || tick.format("HH:mm") !== all[index - 1].format("HH:mm"));

        return html`
            <svg viewBox="0 0 ${this._width} ${HEIGHT}" role="img" aria-label=${seriesName}>
                <text class="axis-label" x="0" y=${PAD.top - 14}>${seriesName} (°C)</text>
                ${degrees.map((degree) => svg`
                    <line class="grid" x1=${PAD.left} x2=${right} y1=${y(degree)} y2=${y(degree)}></line>
                    <text class="axis-label" x=${PAD.left - 6} y=${y(degree) + 4} text-anchor="end">${degree}</text>
                `)}
                ${ticks.map((tick, index) => svg`
                    <text class="axis-label" x=${x(tick.valueOf())} y=${bottom + 16} text-anchor="middle">${tick.format("HH:mm")}</text>
                    ${index === 0 || !tick.isSame(ticks[index - 1], "day") ? svg`
                        <text class="axis-label" x=${x(tick.valueOf())} y=${bottom + 30} text-anchor="middle">${tick.format("D. M.")}</text>
                    ` : nothing}
                `)}
                ${doses.map((dose) => svg`
                    <g data-dose>
                        <line class="dose" x1=${x(dose.t)} x2=${x(dose.t)} y1=${PAD.top} y2=${bottom}></line>
                        <text class="dose-label" transform="rotate(-90 ${x(dose.t) - 4} ${PAD.top})" x=${x(dose.t) - 4} y=${PAD.top} text-anchor="end"><title>${dose.label}</title>${truncate(dose.label, MAX_DOSE_LABEL)}</text>
                    </g>
                `)}
                <path class="line" d=${temperatures.map((point, index) => `${index ? "L" : "M"}${x(point.t).toFixed(1)},${y(point.v).toFixed(1)}`).join("")}></path>
                ${temperatures.map((point) => svg`
                    <circle class="point" data-point cx=${x(point.t)} cy=${y(point.v)} r="5"></circle>
                    <text class="value-label" x=${x(point.t)} y=${y(point.v) - 10} text-anchor="middle">${point.v}°</text>
                `)}
            </svg>
        `;
    }

    private _toggleMedications() {
        this._showMedications = !this._showMedications;
    }
}
