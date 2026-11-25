/**
 * The Home Assistant frontend types MediLog uses, vendored from
 * home-assistant/frontend (`src/types.ts` and the modules it names below) and
 * trimmed to the members MediLog reads. The websocket types come from
 * `home-assistant-js-websocket`, as they do in HA itself.
 */
import type { Connection, Context, HassEntities, HassServiceTarget } from "home-assistant-js-websocket";

/** `types.ts`. */
export interface ServiceCallResponse<T = any> {
  context: Context;
  response?: T;
}

export interface HomeAssistant {
  states: HassEntities;
  connection: Connection;
  language: string;
  locale: { language: string };
  callService<T = any>(
    domain: string,
    service: string,
    serviceData?: Record<string, any>,
    target?: HassServiceTarget,
    notifyOnError?: boolean,
    returnResponse?: boolean,
  ): Promise<ServiceCallResponse<T>>;
}

/** `data/lovelace/config/card.ts`. */
export interface LovelaceCardConfig {
  type: string;
  [key: string]: any;
}

/** `panels/lovelace/types.ts`. */
export interface LovelaceCard extends HTMLElement {
  hass?: HomeAssistant;
  getCardSize(): number | Promise<number>;
  setConfig(config: LovelaceCardConfig): void;
}
