import { EventsOn, EventsOff } from "../../../wailsjs/runtime";

export const ipcRuntime = {
  getEventsOn: () => {
    return window ? EventsOn : null;
  },
  getEventsOff: () => {
    return window ? EventsOff : null;
  },
};
