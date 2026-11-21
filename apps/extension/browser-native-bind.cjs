// function-bind exports this same native method on every supported browser.
// Keep its obsolete dynamic-code fallback out of the extension bundle.
module.exports = Function.prototype.bind;
