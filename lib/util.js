/*!
 * util.js - utils for nomenclate
 * Copyright (c) 2017-2018, Christopher Jeffrey (MIT License).
 * Copyright (c) 2018, Handshake Alliance Developers (MIT License).
 * https://github.com/handshakealliance/nomenclate
 */

"use strict";

const blake2b = require("bcrypto/lib/blake2b");

/**
 * @exports util
 */

const util = exports;

const INTERNAL = Buffer.from([0x01]);

util.now = function now() {
  return Math.floor(Date.now() / 1000);
};

util.fromU32 = function fromU32(num) {
  const data = Buffer.allocUnsafe(4);
  data.writeUInt32LE(num, 0, true);
  return data;
};

util.toU32 = function toU32(buf) {
  const num = buf.readUInt32LE(0, true);
  return num;
};


/**
 * Sorts transactions in ascending order.
 */
util.sortTXs = function sortTXs(txs) {
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

util.branchesAndRoot = function branchesAndRoot(hashes, index) {
  if (hashes.length % 2 != 0) {
    hashes.push(hashes[hashes.length - 1]);
  }

  let branches = [];

  let size = hashes.length;
  let i = 0;

  while (size > 1) {
    for (let j = 0; j < size; j += 2) {
      const l = j;
      const r = j + 1;
      const left = hashes[i + l];

      let right;

      if (r < size) right = hashes[i + r];
      else right = sentinel;

      const hash = blake2b.multi(INTERNAL, left, right);

      branches.push(hash);
      hashes.push(hash);
    }

    i += size;
    size = (size + 1) >>> 1;
  }

  return [branches, hashes[0]];
};
