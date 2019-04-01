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

const INTERNAL = Buffer.from([0x01]);
const EMPTY = Buffer.alloc(0);

util.branchesAndRoot = function branchesAndRoot(hashes, index) {
  let branches = [];
  let newHashes;

  let sentinel = blake2b.digest(EMPTY);

  while (hashes.length > 1) {
    newHashes = [];

    if (hashes.length % 2 != 0) {
      hashes.push(hashes[hashes.length - 1]);
    }

    if (index % 2 == 0) {
      index += 1;
    } else {
      index -= 1;
    }

    branches.push(hashes[index].toString("hex"));

    for (let i = 0; i < hashes.length; i += 2) {
      const left = hashes[i];

      let right;

      if (i + 1 < hashes.length) right = hashes[i + 1];
      else right = sentinel;

      const hash = blake2b.root(left, right);

      newHashes.push(hash);
    }

    index = Math.floor(index / 2);

    hashes = newHashes;
  }

  return [branches, hashes[hashes.length - 1]];
};
