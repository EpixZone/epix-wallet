// scrypt and other browser dependencies yield between batches of work.
// A message runs one callback per task without the delay of nested timers.
if (typeof globalThis.setImmediate !== "function") {
  const channel = new MessageChannel();
  const tasks = new Map();
  let nextId = 1;

  channel.port1.onmessage = ({ data: id }) => {
    const task = tasks.get(id);
    if (task) {
      tasks.delete(id);
      task();
    }
  };

  globalThis.setImmediate = (callback, ...args) => {
    if (typeof callback !== "function") {
      throw new TypeError("setImmediate requires a callback function");
    }
    const id = nextId++;
    tasks.set(id, () => callback(...args));
    channel.port2.postMessage(id);
    return id;
  };

  globalThis.clearImmediate = (id) => {
    tasks.delete(id);
  };
}
