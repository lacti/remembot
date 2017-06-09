'use strict';

const db = require('./db.js');
const state = require('./state.js');
const dict = require('./dictionary.js');

let handle = (text, id) => {
  if (text.length == 1) {
    if (/^[a-z]$/.test(text)) {
      return dict.index(text);
    } else if ('.' === text) {
      return dict.index();
    } else if (',' === text || '?' === text) {
      return dict.chooseRandomWord();
    } else {
      return Promise.resolve('Command not found');
    }
  }
  if (/^[a-zA-Z ]+$/.test(text)) {
    return dict
      .explain(text)
      .then(w => {
        if (w.exists !== undefined && w.exists === false) {
          return `Cannot find a word: ${text}`;
        }
        return w;
      })
      .catch(console.log);
  }
  return Promise.resolve(null);
};

module.exports = {
  handle
};
