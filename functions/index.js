// functions/index.js
//
// package.json's "main" is functions.js, which holds every deployed function.
// It re-exports functions.js so there is a single source of truth whichever file
// "main" points at.
module.exports = require("./functions");
