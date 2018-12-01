/*!
 * layout.js - key layouts for leveldb database.
 * Copyright (c) 2017-2018, Christopher Jeffrey (MIT License).
 * Copyright (c) 2018, Handshake Alliance Developers (MIT License).
 * https://github.com/handshakealliance/nomenclate
 */

"use strict";

const bdb = require("bdb");

/*
 * Wallet Database Layout:
 *  V -> db version
 *  O -> flags
 *  H -> Last Sync Height
 *
 *  Transactions Output's Index
 *  o[SHA256(hash)(:8)] -> [txid(:8)]
 *  Code: o, Address Hash Prefix: hash(:8) -> Funding TxID Prefix: txid[:8]
 *
 *  Transactions Input Index
 *  i[txid(:8)][uint16][txid(:8)] -> Transaction inputs row.
 *  Code: i, Funding TxID Prefix: txid(8), Funding Output Index: uint, Spending TxID Prefix: txid(8)
 *
 *  Full Transaction IDs
 *  t[txid][uint32]
 *
 */

const layout = {
  V: bdb.key("V"),
  O: bdb.key("O"),
  H: bdb.key("H"),
  o: bdb.key("o", ["hash", "hash"]),
  i: bdb.key("i", ["hash", "uint32"]),
  t: bdb.key("t", ["hash"])
};

module.exports = layout;
