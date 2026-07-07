import dayjs from "dayjs";


export interface PersonInfoRaw {
    entity: string;
    recent_record:MedilogRecordRaw | null;
}

export interface PersonInfo {
    entity: string;
    name: string;
    entity_picture?: string;
    recent_record: MedilogRecord | null;
}

export interface MedicationRaw {
    id: string;
    name: string;
    units?: string;
    is_antipyretic: boolean;
    active_ingredient?: string;
}

export interface Medication {
    id: string;
    name: string;
    units?: string;
    is_antipyretic: boolean;
    active_ingredient?: string;
}

export interface MedilogRecordRaw {
    id?: string,
    datetime: string;
    temperature?: number;
    medication_id?: string;
    medication_amount?: number;
    note?: string;
}

export interface MedilogRecord {
    id?: string,
    datetime: dayjs.Dayjs;
    temperature?: number;
    medication_id?: string;
    medication_amount?: number;
    note?: string;
}

export interface MedilogRecordsGroupByTime {
    from: dayjs.Dayjs | null,
    to: dayjs.Dayjs,
    records: (MedilogRecord | null)[]
};
