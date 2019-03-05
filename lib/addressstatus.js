/*!
 * addressstatus.js - Address Status object for Nomenclate
 * Copyright (c) 2017-2018, Christopher Jeffrey (MIT License).
 * Copyright (c) 2018, Handshake Alliance Developers (MIT License).
 * https://github.com/handshakealliance/nomenclate
 */

//External
const Logger = require("blgr");
const assert = require("bsert");
const bdb = require("bdb");

//Local
const layout = require("./layout");
const NullClient = require("./nullclient.js");

class AddressStatus {
  constructor(options, hash) {
    this.options = new AddressStatusOptions(options);

    this.logger = this.options.logger.context("nomenclate");
    this.client = this.options.client || new NullClient(this);
    this.db = this.options.db;
    this.mempool = this.options.node.mempool;
    this.address = hash;

    this.cfundOutputs = [];
    this.cspendOutputs = [];

    //Todo
    this.ufOutputs = [];
    this.usOutputs = [];
  }

  async status() {
    await this.funding();
    await this.spending();
    // await this.fundingUnconfirmed();
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

  // async fundingUnconfirmed() {
  //   let txs = this.mempool.getHistory();
  //   console.log(txs);
  // }

  async spending() {
    let hash = this.address.getHash();

    for (let o of this.cfundOutputs) {
      let txPrefix = Buffer.from(o.tx_hash, "hex").slice(0, 8);

      const txHashX = await this.db.get(
        layout.i.encode(txPrefix, o.output_index)
      );

      if (txHashX) {
        // let newtx = await this.client.getTX(txHashX);
        let height = await this.db.get(layout.t.encode(txHashX));
        height = toU32(height);

        // let found = false;

        // for (let i = 0; i < newtx.inputs.length; i++) {
        //   let outpoint = newtx.inputs[i].prevout;
        //   if (
        //     outpoint.hash.toString("hex") === o.tx_hash &&
        //     outpoint.index === o.output_index
        //   ) {
        //     found = true;

        //     break;
        //   }
        // }

        // if (found) {
        let spent = {
          tx_hash: txHashX.toString("hex"),
          height: height,
          funding_output: [o.tx_hash, o.output_index],
          value: o.value
        };
        this.cspendOutputs.push(spent);
        // }
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

  //Return balance for the address
  balance() {
    let totalFunded = 0;
    for (let o of this.cfundOutputs) {
      totalFunded += o.value;
    }

    let totalSpent = 0;
    for (let i of this.cspendOutputs) {
      totalSpent += i.value;
    }

    let balance = {
      confirmed: totalFunded - totalSpent,
      //Needs mempool integration XXX
      unconfirmed: totalFunded - totalSpent,
      received: totalFunded,
      spent: totalSpent
    };

    return balance;
  }
}

class AddressStatusOptions {
  /**
   * Create address status options.
   * @constructor
   * @param {Object} options
   */

  constructor(options) {
    this.logger = Logger.global;
    this.client = null;
    this.db = null;

    if (options) this._fromOptions(options);
  }

  /**
   * Inject properties from object.
   * @private
   * @param {Object} options
   * @returns {AddressStatusOptions}
   */

  _fromOptions(options) {
    if (options.logger != null) {
      assert(typeof options.logger === "object");
      this.logger = options.logger;
    }

    if (options.client != null) {
      assert(typeof options.client === "object");
      this.client = options.client;
    }

    assert(this.client);

    if (options.db != null) {
      assert(typeof options.db === "object");
      this.db = options.db;
    }

    if (options.node != null) {
      assert(typeof options.node === "object");
      this.node = options.node;
    }

    return this;
  }

  /**
   * Instantiate chain options from object.
   * @param {Object} options
   * @returns {AddressStatusOptions}
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

module.exports = AddressStatus;
