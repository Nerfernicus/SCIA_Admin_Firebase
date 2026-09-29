// functions/index.js
//
// package.json's "main" is functions.js, which holds every deployed function.
// This file used to be a second, diverging copy of createAssistedSeniorAccount
// (the one that recorded NCSC progress) that Firebase never loaded, which is
// why NCSC records from assisted sign-ups never appeared. It now just
// re-exports functions.js so there is a single source of truth whichever file
// "main" points at.
module.exports = require("./functions");
