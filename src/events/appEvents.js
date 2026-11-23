const { EventEmitter } = require('node:events');
const appEvents = new EventEmitter();
appEvents.setMaxListeners(25);
module.exports = appEvents;
