export const ENDPOINT_HEALTH_ALARM = "endpoint-health";

interface AlarmAPI {
  get(name: string): Promise<unknown>;
  create(name: string, info: { periodInMinutes: number }): void | Promise<void>;
  onAlarm: {
    addListener(listener: (alarm: { name: string }) => void): void;
    removeListener(listener: (alarm: { name: string }) => void): void;
  };
}

// Register synchronously so a service worker can receive its wake-up alarm.
// Persisted nextDueAt and coordinator coalescing bound work after a long sleep.
export function installEndpointHealthChecks(
  alarms: AlarmAPI,
  initialize: () => Promise<void>,
  checkDue: () => Promise<void>,
  onError: (error: unknown) => void
): () => void {
  let disposed = false;
  let pending: Promise<void> | undefined;
  const check = () => {
    if (disposed || pending) return;
    pending = initialize()
      .then(() => (disposed ? undefined : checkDue()))
      .catch(onError)
      .finally(() => {
        pending = undefined;
      });
  };
  const listener = (alarm: { name: string }) => {
    if (alarm.name === ENDPOINT_HEALTH_ALARM) check();
  };
  alarms.onAlarm.addListener(listener);
  void alarms
    .get(ENDPOINT_HEALTH_ALARM)
    .then((alarm) => {
      if (!disposed && !alarm) {
        return alarms.create(ENDPOINT_HEALTH_ALARM, { periodInMinutes: 1 });
      }
    })
    .catch(onError);
  check();
  return () => {
    disposed = true;
    alarms.onAlarm.removeListener(listener);
  };
}
