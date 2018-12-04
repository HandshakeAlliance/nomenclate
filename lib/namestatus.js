/*!
 * namestatus.js - Name Status object for Nomenclate
 * Copyright (c) 2017-2018, Christopher Jeffrey (MIT License).
 * Copyright (c) 2018, Handshake Alliance Developers (MIT License).
 * https://github.com/handshakealliance/nomenclate
 */

const rules = require("hsd/lib/covenants/rules");
const Logger = require("blgr");
const assert = require("bsert");
const bdb = require("bdb");
const layout = require("./layout");

class NameStatus {
  constructor(options, name) {
    this.options = new NameStatusOptions(options);

    this.logger = this.options.logger.context("nomenclate");
    this.db = this.options.db;

    this.name = name;
    this.nameHash = rules.hashName(name);
    this.auctionList = [];
  }

  async status() {
    await this.auction();
    return;
  }

  history() {
    return this.auctionList;
  }

  async auction() {
    let nameHash = this.nameHash;

    const iter = this.db.iterator({
      gte: layout.n.min(nameHash),
      lte: layout.n.max(nameHash),
      values: true
    });

    await iter.each(async (key, raw) => {
      const [, txid] = layout.n.decode(key);

      let tx = {
        tx_hash: txid.toString("hex"),
        height: toU32(raw)
      };

      this.auctionList.push(tx);
    });
  }
}

class NameStatusOptions {
  /**
   * Create name status options.
   * @constructor
   * @param {Object} options
   */

  constructor(options) {
    this.logger = Logger.global;
    this.db = null;

    if (options) this._fromOptions(options);
  }

  /**
   * Inject properties from object.
   * @private
   * @param {Object} options
   * @returns {NameStatusOptions}
   */

  _fromOptions(options) {
    if (options.logger != null) {
      assert(typeof options.logger === "object");
      this.logger = options.logger;
    }

    if (options.db != null) {
      assert(typeof options.db === "object");
      this.db = options.db;
    }

    return this;
  }

  /**
   * Instantiate chain options from object.
   * @param {Object} options
   * @returns {NameStatusOptions}
   */

  static fromOptions(options) {
    return new this()._fromOptions(options);
  }
}

/*
 * Helpers
 */
//XXX possibly move these to common.

function fromU32(num) {
  const data = Buffer.allocUnsafe(4);
  data.writeUInt32LE(num, 0, true);
  return data;
}

function toU32(buf) {
  const num = buf.readUInt32LE(0, true);
  return num;
}

module.exports = NameStatus;
