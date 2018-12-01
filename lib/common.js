/*!
 * common.js - commonly required functions for nomenclate.
 * Copyright (c) 2017-2018, Christopher Jeffrey (MIT License).
 * Copyright (c) 2018, Handshake Alliance Developers (MIT License).
 * https://github.com/handshakealliance/nomenclate
 */

"use strict";

/**
 * @exports nomenclate/common
 **/

const common = exports;

/**
 * Sorts transactions in ascending order.
 */
common.sortTXs = function sortTXs(txs) {
  //Not sure how we can do this exactly to ensure that things are sorted especially if they
  // are the same block - XXX
  // For now will sort just in block order.
  //Also let's pass in some parameters here as right now
  // We are going to default to descending.

  txs.sort(function(a, b) {
    return b.height - a.height;
  });

  return txs;
};
