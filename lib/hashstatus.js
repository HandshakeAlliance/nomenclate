/*!
 * hashstatus.js - Hash Status object for Nomenclate
 * Copyright (c) 2017-2018, Christopher Jeffrey (MIT License).
 * Copyright (c) 2018, Handshake Alliance Developers (MIT License).
 * https://github.com/handshakealliance/nomenclate
 */

const { Network, Address } = require("hsd");
const rules = require("hsd/lib/covenants/rules");
const Logger = require("blgr");
const assert = require("bsert");
const bdb = require("bdb");
const layout = require("./layout");

//XXX think about breaking this into 2 separate objects
//An AddressStatus class and a NameStatus.
//TODO
class Status {
  constructor(options, hash, isName = false) {
    this.options = new StatusOptions(options);

    this.network = this.options.network;
    this.logger = this.options.logger.context("nomenclate");
    this.client = this.options.client || new NullClient(this);
    this.db = this.options.db;
    this.address = null;
    this.nameHash = null;
    this.isName = isName;

    if (this.isName) {
      this.nameHash = hash;
    } else {
      this.address = hash;
    }

    this.cfundOutputs = [];
    this.cspendOutputs = [];
    this.ufOutputs = [];
    this.usOutputs = [];
    this.auctionList = [];
  }

  async status() {
    if (this.isName) {
      await this.auction();
      return;
    }

    await this.funding();
    await this.spending();
    return;
  }

  async funding() {
    let hash = Buffer.from(this.address.getHash(), "hex");

    const iter = this.db.iterator({
      gte: layout.o.min(hash),
      lte: layout.o.max(hash),
      values: true
    });

    await iter.each(async (key, raw) => {
      const [userHash, txid] = layout.o.decode(key);

      let tx = {
        userHash,
        tx_hash: txid.toString("hex"),
        height: toU32(raw)
      };

      let newtx = await this.client.getTX(txid);

      let outputIndex;
      let value;

      for (let i = 0; i < newtx.outputs.length; i++) {
        if (userHash.equals(newtx.outputs[i].address.getHash())) {
          outputIndex = i;
          value = newtx.outputs[i].value;
          break;
        }
      }

      let output = {
        tx_hash: txid.toString("hex"),
        height: toU32(raw),
        output_index: outputIndex,
        value
      };

      this.cfundOutputs.push(output);
    });
  }

  async spending() {
    let hash = this.address.getHash();

    for (let o of this.cfundOutputs) {
      let txPrefix = Buffer.from(o.tx_hash, "hex").slice(0, 8);

      const txHashX = await this.db.get(
        layout.i.encode(txPrefix, o.output_index)
      );

      if (txHashX) {
        let newtx = await this.client.getTX(txHashX);

        let found = false;

        for (let i = 0; i < newtx.inputs.length; i++) {
          let outpoint = newtx.inputs[i].prevout;
          if (
            outpoint.hash.toString("hex") === o.tx_hash &&
            outpoint.index === o.output_index
          ) {
            found = true;

            break;
          }
        }

        if (found) {
          let spent = {
            tx_hash: txHashX.toString("hex"),
            height: newtx.height,
            funding_output: [o.tx_hash, o.output_index],
            value: o.value
          };
          this.cspendOutputs.push(spent);
        }
      }
    }
  }

  history() {
    let txs = [];

    for (let o of this.cfundOutputs) {
      let newtx = {
        tx_hash: o.tx_hash,
        height: o.height
      };
      txs.push(newtx);
    }

    for (let i of this.cspendOutputs) {
      let newtx = {
        tx_hash: i.tx_hash,
        height: i.height
      };
      txs.push(newtx);
    }

    return txs;
  }

  nameHistory() {
    return this.auctionList;
  }

  //Return balance for the address
  //XXX should probably convert to bignum here.
  balance() {
    let totalFunded = 0;
    for (let o of this.cfundOutputs) {
      totalFunded += o.value;
    }

    let totalSpent = 0;
    for (let i of this.cspendOutputs) {
      totalSpent += i.value;
    }

    return totalFunded - totalSpent;
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

class StatusOptions {
  /**
   * Create nomenclate options.
   * @constructor
   * @param {Object} options
   */

  constructor(options) {
    this.network = Network.primary;
    this.logger = Logger.global;
    this.chain = null;
    this.client = null;
    this.db = null;

    if (options) this._fromOptions(options);
  }

  /**
   * Inject properties from object.
   * @private
   * @param {Object} options
   * @returns {HashStatusOptions}
   */

  _fromOptions(options) {
    if (options.network != null) this.network = Network.get(options.network);

    if (options.logger != null) {
      assert(typeof options.logger === "object");
      this.logger = options.logger;
    }

    if (options.client != null) {
      assert(typeof options.client === "object");
      this.client = options.client;
    }

    if (options.chain != null) {
      assert(typeof options.chain === "object");
      this.client = new ChainClient(options.chain);
    }

    assert(this.client);

    if (options.db != null) {
      assert(typeof options.db === "object");
      this.db = options.db;
    }

    return this;
  }

  /**
   * Instantiate chain options from object.
   * @param {Object} options
   * @returns {HashStatusOptions}
   */

  static fromOptions(options) {
    return new this()._fromOptions(options);
  }
}

class HashStatus {
  constructor(options) {
    this.options = new HashStatusOptions(options);

    this.network = this.options.network;
    this.logger = this.options.logger.context("nomenclate");
    this.client = this.options.client || new NullClient(this);
    this.db = this.options.db;
  }

  //Returns new Status object
  new(hash) {
    let address = new Address(hash);
    assert(address.isValid());

    return new Status(this.options, address);
  }

  newName(name) {
    assert(rules.verifyName(name));

    let nameHash = rules.hashName(name);

    return new Status(this.options, nameHash, true);
  }
}

class HashStatusOptions {
  /**
   * Create nomenclate options.
   * @constructor
   * @param {Object} options
   */

  constructor(options) {
    this.network = Network.primary;
    this.logger = Logger.global;
    this.chain = null;
    this.client = null;
    this.db = null;

    if (options) this._fromOptions(options);
  }

  /**
   * Inject properties from object.
   * @private
   * @param {Object} options
   * @returns {HashStatusOptions}
   */

  _fromOptions(options) {
    if (options.network != null) this.network = Network.get(options.network);

    if (options.logger != null) {
      assert(typeof options.logger === "object");
      this.logger = options.logger;
    }

    if (options.client != null) {
      assert(typeof options.client === "object");
      this.client = options.client;
    }

    if (options.chain != null) {
      assert(typeof options.chain === "object");
      this.client = new ChainClient(options.chain);
    }

    assert(this.client);

    if (options.db != null) {
      assert(typeof options.db === "object");
      this.db = options.db;
    }

    return this;
  }

  /**
   * Instantiate chain options from object.
   * @param {Object} options
   * @returns {HashStatusOptions}
   */

  static fromOptions(options) {
    return new this()._fromOptions(options);
  }
}

/*
 * Helpers
 */

function fromU32(num) {
  const data = Buffer.allocUnsafe(4);
  data.writeUInt32LE(num, 0, true);
  return data;
}

function toU32(buf) {
  const num = buf.readUInt32LE(0, true);
  return num;
}

module.exports = HashStatus;
