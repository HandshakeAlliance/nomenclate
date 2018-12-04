/*!
 * status.js - Status object for Nomenclate
 * Copyright (c) 2017-2018, Christopher Jeffrey (MIT License).
 * Copyright (c) 2018, Handshake Alliance Developers (MIT License).
 * https://github.com/handshakealliance/nomenclate
 */

//Handshake
const { Network, Address } = require("hsd");
const rules = require("hsd/lib/covenants/rules");

//External
const Logger = require("blgr");
const assert = require("bsert");
const bdb = require("bdb");

//Local
const layout = require("./layout");
const NameStatus = require("./namestatus.js");
const AddressStatus = require("./addressstatus.js");
const NullClient = require("./nullclient.js");

class Status {
  constructor(options) {
    this.options = new StatusOptions(options);

    this.network = this.options.network;
    this.logger = this.options.logger.context("nomenclate");
    this.client = this.options.client || new NullClient(this);
    this.db = this.options.db;
  }

  //Returns new Status object
  new(hash) {
    let address = new Address(hash);
    assert(address.isValid());

    return new AddressStatus(this.options, address);
  }

  newName(name) {
    assert(rules.verifyName(name));

    return new NameStatus(this.options, name);
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

module.exports = Status;
