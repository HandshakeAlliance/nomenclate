/*!
 * util.js - utils for nomenclate
 * Copyright (c) 2017-2018, Christopher Jeffrey (MIT License).
 * Copyright (c) 2018, Handshake Alliance Developers (MIT License).
 * https://github.com/handshakealliance/nomenclate
 */

/**
 * @exports util
 */

const util = exports;

util.now = function now() {
  return Math.floor(Date.now() / 1000);
};
