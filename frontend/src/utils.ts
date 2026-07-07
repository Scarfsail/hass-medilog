import dayjs from 'dayjs'
import duration from 'dayjs/plugin/duration'
import isoWeek from 'dayjs/plugin/isoWeek'
import { MedilogRecord, MedilogRecordRaw } from './models';

dayjs.extend(duration);
dayjs.extend(isoWeek);

export class Utils {

    public static getDurationMmSs(dateTimeFrom: dayjs.ConfigType, dateTimeTo: dayjs.ConfigType = new Date()): string {
        const duration = dayjs.duration(dayjs(dateTimeTo).diff(dateTimeFrom));
        const totalSeconds = duration.asSeconds();
        const minutes = Math.trunc(totalSeconds / 60);
        const seconds = Math.trunc(totalSeconds % 60);
        return minutes + ":" + (seconds > 9 ? seconds : "0" + seconds);
    }

    public static formatDurationFromTo(dateTimeFrom: dayjs.ConfigType, dateTimeTo: dayjs.ConfigType = new Date()): string {
        return this.formatDuration(dayjs.duration(dayjs(dateTimeTo).diff(dateTimeFrom)));
    }

    public static formatDuration(duration: duration.Duration): string {
        const hours = duration.hours();
        const minutes = duration.minutes();
        const seconds = duration.seconds();

        if (duration.asMonths() >= 1) {
            const weeks = duration.weeks();
            const months = Math.floor(duration.asMonths());
            return `${months}m ${weeks}t`;
        }

        if (duration.asWeeks() >= 1) {
            const weeks = duration.weeks();
            const days = duration.days() - (weeks * 7);
            return `${weeks}t ${days}d`;
        }

        if (duration.asDays() >= 1)
            return `${duration.days()}d ${hours}h`;

        if (duration.asHours() >= 1)
            return `${hours}h ${minutes}m`;

        if (duration.asMinutes() >= 5)
            return `${minutes}m`;

        return `${minutes}m ${seconds}s`;
    }

    public static formatDaysAgoAsName(dateTimeFrom: dayjs.ConfigType): string {
        const days = Math.floor(dayjs.duration(this.getDate(dayjs(dateTimeFrom)).diff(this.getDate(dayjs()))).asDays());
        if (days == 0)
            return "dnes";

        if (days == 1)
            return "zítra";

        if (days == 2)
            return "pozítří";

        if (days >= 3 && days <= 4)
            return `za ${days} dny`;

        return `za ${days} dní`;
    }

    public static getDurationFromTimeString(time: string): duration.Duration {
        const parts = time.split(":");
        return dayjs.duration({ hours: +parts[0], minutes: +parts[1], seconds: +parts[2] });
    }

    public static getTimeStringFromDuration(dur: duration.Duration): string {
        return `${dur.hours()}:${dur.minutes() ?? "0"}:${dur.seconds() ?? "0"}`
    }


    public static getDate(dateTime: dayjs.Dayjs): dayjs.Dayjs {
        return dateTime.hour(0).minute(0).second(0).millisecond(0);
    }

    public static formatDate(date: dayjs.Dayjs | Date, omitYearIfItsThisYear = true, addSpacesAfterDots = true): string {
        const dot = addSpacesAfterDots ? '. ' : '.';
        return dayjs(date).format(`D${dot}M${omitYearIfItsThisYear && dayjs(date).year() === dayjs().year() ? '' : `${dot}YYYY`}`)
    }

    /**
     * Convert a raw medilog record from API to a typed MedilogRecord with dayjs datetime.
     */
    public static convertMedilogRecordRawToMedilogRecord(record: MedilogRecordRaw | null): MedilogRecord | null {
        if (!record)
            return null;

        return {
            ...record,
            temperature: record.temperature === null ? undefined : record.temperature,
            medication_id: record.medication_id === null ? undefined : record.medication_id,
            medication_amount: record.medication_amount ?? 1,
            datetime: dayjs(record.datetime)
        } as MedilogRecord
    }
}