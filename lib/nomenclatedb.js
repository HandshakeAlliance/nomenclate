/*!
 * nomenclatedb.js - Nomenclate Server for hsd
 * Copyright (c) 2017-2018, Christopher Jeffrey (MIT License).
 * Copyright (c) 2018, Handshake Alliance Developers (MIT License).
 * https://github.com/handshakealliance/nomenclate
 */

"use strict";

const EventEmitter = require("events");
const path = require("path");
const { Network, Address, Script, Coin } = require("hsd");
const Logger = require("blgr");
const assert = require("bsert");
const bdb = require("bdb");
const records = require("./records");
const layout = require("./layout");
const { Lock } = require("bmutex");
const HashStatus = require("./hashstatus.js");

const { BlockMeta, ChainState } = records;

/**
 * NomenclateDB
 * @alias module:nomenclate.nomenclateDB
 * @extends EventEmitter
 */

class NomenclateDB extends EventEmitter {
  /**
   * Create an nomenclate db.
   * @constructor
   * @param {Object} options
   */

  constructor(options) {
    super();

    this.options = new NomenclateOptions(options);

    this.network = this.options.network;
    this.logger = this.options.logger.context("nomenclate");
    this.client = this.options.client || new NullClient(this);
    this.db = bdb.create(this.options);
    this.options.db = this.db;
    this.hashStatus = new HashStatus(this.options);

    this.state = new ChainState();
    this.height = 0;

    this.tip = new BlockMeta();
    this.lock = new Lock();

    this.init();
  }

  /**
   * Initialize nomenclatedb.
   * @private
   */

  init() {
    this._bind();
  }

  /**
   * Bind to node events.
   * @private
   */

  /**
   * Bind to node events.
   * @private
   */

  _bind() {
    /**
     * Bind to node events.
     * @private
     */

    this.client.on("error", err => {
      this.emit("error", err);
    });

    this.client.on("connect", async () => {
      try {
        await this.syncNode();
      } catch (e) {
        this.emit("error", e);
      }
    });

    this.client.bind("block connect", async (entry, txs) => {
      try {
        await this.addBlock(entry, txs);
      } catch (e) {
        this.emit("error", e);
      }
    });

    this.client.bind("block disconnect", async (entry, block, view) => {
      try {
        await this.unindexBlock(entry, block, view);
      } catch (e) {
        this.emit("error", e);
      }
    });

    this.client.bind("chain reset", async tip => {
      try {
        await this.rollback(tip.height);
      } catch (e) {
        this.emit("error", e);
      }
    });
  }

  /**
   * Open the nomenclatedb, wait for the database to load.
   * @returns {Promise}
   */

  async open() {
    await this.db.open();

    await this.db.verify(layout.V.encode(), "nomenclate", 0);

    await this.verifyNetwork();

    //Get tip of chain when starting
    let tip = await this.client.getTip();

    //Get the last sync height
    let height = await this.db.get(layout.H.encode());

    if (height == null) {
      height = 0;
    } else {
      this.height = toU32(height);
    }

    this.logger.info(
      "Nomenclate initialized at height: %d, and chain tip: %d",
      this.height,
      tip.height
    );

    //Open the connect to daemon
    await this.connect();
  }

  /**
   * Verify network.
   * @returns {Promise}
   */

  async verifyNetwork() {
    const raw = await this.db.get(layout.O.encode());

    if (!raw) {
      const b = this.db.batch();
      b.put(layout.O.encode(), fromU32(this.network.magic));
      return b.write();
    }

    const magic = raw.readUInt32LE(0, true);

    if (magic !== this.network.magic)
      throw new Error("Network mismatch for NomenclateDB.");

    return undefined;
  }

  /**
   * Close the nomenclatedb, wait for the database to close.
   * @returns {Promise}
   */

  async close() {
    return this.db.close();
  }

  /**
   * Connect to the node server (client required).
   * @returns {Promise}
   */

  async connect() {
    return this.client.open();
  }

  /**
   * Sync state with server on every connect.
   * @returns {Promise}
   */

  async syncNode() {
    const unlock = await this.lock.lock();
    //time this operation XXX
    try {
      this.logger.info("Resyncing from server...");
      await this.syncChain();
    } finally {
      // Add time here
      this.logger.info("Nomenclate fully synced with server");
      unlock();
    }
  }

  /**
   * Connect and sync with the chain server.
   * @private
   * @returns {Promise}
   */

  async syncChain() {
    return this.scan();
  }

  /**
   * Get a wallet block meta.
   * @param {Hash} hash
   * @returns {Promise}
   */

  async getBlock(height) {
    const hash = await this.db.get(layout.h.encode(height));

    if (!hash) return null;

    const block = new BlockMeta();
    block.hash = hash;
    block.height = height;

    return block;
  }

  /**
   * Rescan blockchain from a given height.
   * @private
   * @param {Number?} height
   * @returns {Promise}
   */

  async scan(height) {
    if (height == null) height = this.height;

    assert(height >>> 0 === height, "Nomenclate: Must pass in a height.");

    const tip = await this.client.getTip();

    if (tip.height < height) {
      height = tip.height;
    }

    //This needs to be under a condition I think.
    //XXX
    // await this.rollback(height);

    this.logger.info(
      "Nomenclate is scanning %d blocks.",
      tip.height - height + 1
    );

    try {
      this.rescanning = true;

      for (let i = height; i < tip.height; i++) {
        const entry = await this.client.getEntry(i);
        assert(entry);

        const block = await this.client.getBlock(entry.hash);
        assert(block);

        await this._addBlock(entry, block.txs);
      }
    } finally {
      this.rescanning = false;
    }
  }

  /**
   * Sync with chain height.
   * @param {Number} height
   * @returns {Promise}
   */

  async rollback(height) {
    //This might cause issues of mismatched tips when rollback starts.
    //Let's write a testcase for this, and then check both scenarios.
    //1. using getTip() 2. using this.tip
    const tip = this.client.getTip();

    if (height > tip.height)
      throw new Error("Nomenclate: Cannot rollback to the future.");

    if (height === tip.height) {
      this.logger.info("Rolled back to same height (%d).", height);
      return;
    }

    this.logger.info(
      "Rolling back %d NomenclateDB blocks to height %d.",
      this.state.height - height,
      height
    );

    const entry = await this.client.getEntry(height);

    assert(tip);

    // await this.revert(tip.height);
    await this.setTip(tip);
  }

  //Need to edit this function - add more error checking
  async setHeight(height) {
    this.height = height;

    //Insert into DB.
    await this.db.put(layout.H.encode(), fromU32(height));

    return;
  }

  /**
   * Sync the current chain state to tip.
   * @param {BlockMeta} tip
   * @returns {Promise}
   */

  async setTip(tip) {
    const b = this.db.batch();
    const state = this.state.clone();

    if (tip.height < state.height) {
      // Hashes ahead of our new tip
      // that we need to delete.
      while (state.height !== tip.height) {
        b.del(layout.h.encode(state.height));
        state.height -= 1;
      }
    } else if (tip.height > state.height) {
      assert(tip.height === state.height + 1, "Bad chain sync.");
      state.height += 1;
    }

    if (tip.height < state.startHeight) {
      state.startHeight = tip.height;
      state.startHash = tip.hash;
      state.marked = false;
    }

    // Save tip and state.
    b.put(layout.h.encode(tip.height), tip.toHash());
    b.put(layout.R.encode(), state.encode());

    await b.write();

    this.state = state;
    this.height = state.height;
  }

  // /**
  // * Revert a block.
  // * @param {Number} height
  // * @returns {Promise}
  // */

  // async revert(height) {
  // const block = await this.getBlock(height);

  // if (!block)
  //   return 0;

  // const hashes = block.toArray();

  // for (let i = hashes.length - 1; i >= 0; i--) {
  //   const hash = hashes[i];
  //   await this.unconfirm(hash);
  // }

  // return hashes.length;
  // }

  /**
   * Add a block's transactions and write the new best hash.
   * @param {ChainEntry} entry
   * @returns {Promise}
   */

  async addBlock(entry, txs) {
    const unlock = await this.lock.lock();
    try {
      return await this._addBlock(entry, txs);
    } finally {
      unlock();
    }
  }

  async _addBlock(entry, txs) {
    const block = BlockMeta.fromEntry(entry);

    if (block.height < this.height) {
      this.logger.warning(
        "Nomenclate is connecting low blocks (%d).",
        block.height
      );
      return 0;
    }

    if (block.height >= this.network.block.slowHeight)
      this.logger.debug("Adding block: %d.", block.height);

    //We may want to adjust this.
    //Right now it's running on every height, but I'm wondering if we want height to be +1
    if (block.height === this.height) {
      // We let blocks of the same height
      // through specifically for rescans:
      // we always want to rescan the last
      // block since the state may have
      // updated before the block was fully
      // processed (in the case of a crash).
      this.logger.warning("Already saw Nomenclate block (%d).", block.height);
    } else if (block.height !== this.height + 1) {
      await this.scan(this.height);
      return 0;
    }

    // Sync the state to the new tip.
    await this.setHeight(block.height);

    //If there are checkpoints do we scan before them still?
    if (this.options.checkpoints && !this.state.marked) {
      if (block.height <= this.network.lastCheckpoint) return 0;
    }

    let total = 0;

    for (const tx of txs) {
      if (await this._addTX(tx, block)) total += 1;
    }

    if (total > 0) {
      this.logger.info(
        "Connected NomenclateDB block %x (tx=%d).",
        block.hash,
        total
      );
    }

    return total;
  }

  async _addTX(tx, block) {
    assert(!tx.mutable, "HDB: Cannot add mutable TX.");

    // if (block && !this.state.marked) await this.markState(block);

    let result = false;

    const b = this.db.batch();

    let txid = Buffer.from(tx.txid(), "hex");

    //Do inputs first
    for (let input of tx.inputs) {
      if (input.isCoinbase()) {
        continue;
      }

      let previousHashPrefix = Buffer.from(input.prevout.txid(), "hex").slice(
        0,
        8
      );
      let previousIndex = input.prevout.index;

      b.put(layout.i.encode(previousHashPrefix, previousIndex), txid);
    }

    //Outputs
    for (let output of tx.outputs) {
      let address = Buffer.from(output.address.getHash(), "hex");

      b.put(layout.o.encode(address, txid), fromU32(block.height));
    }

    b.put(layout.t.encode(txid), fromU32(block.height));

    await b.write();

    //Parse the outputs and connect insert them.

    //The goal here is to just start with UTXOs

    // Insert the transaction
    // into every matching wallet.
    // for (const wid of wids) {
    //   const wallet = await this.get(wid);

    //   assert(wallet);

    // if (await wallet.add(tx, block)) {
    //   this.logger.info(
    //     "Added transaction to wallet in WalletDB: %s (%d).",
    //     wallet.id,
    //     wid
    //   );
    //   result = true;
    // }
    // }

    if (!result) return null;

    return wids;
  }

  /**
   * Return the full TX history for a hash
   * @param hash
   * @returns {Promise}
   */
  //XXX be consistent on naming here...
  //Either pick "get" to start or none at all.
  async getAddressHashHistory(hash) {
    let status = this.hashStatus.new(hash);

    await status.status();

    return status.history();
  }

  //Calculate Balance for an address
  async addressBalance(hash) {
    let status = this.hashStatus.new(hash);

    await status.status();

    return status.balance();
  }

  // /**
  //  * Mark current state.
  //  * @param {BlockMeta} block
  //  * @returns {Promise}
  //  */

  // async markState(block) {
  //   const state = this.state.clone();
  //   state.startHeight = block.height;
  //   state.startHash = block.hash;
  //   state.marked = true;

  //   const b = this.db.batch();
  //   b.put(layout.R.encode(), state.encode());
  //   await b.write();

  //   this.state = state;
  //   this.height = state.height;
  // }
}

class NomenclateOptions {
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
    this.prefix = null;
    this.location = null;
    this.memory = true;
    this.maxFiles = 64;
    this.cacheSize = 16 << 20;
    this.compression = true;

    if (options) this._fromOptions(options);
  }

  /**
   * Inject properties from object.
   * @private
   * @param {Object} options
   * @returns {NomenclateDBOptions}
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

    if (options.prefix != null) {
      assert(typeof options.prefix === "string");
      this.prefix = options.prefix;
      this.location = path.join(this.prefix, "nomenclate");
    }

    if (options.location != null) {
      assert(typeof options.location === "string");
      this.location = options.location;
    }

    if (options.memory != null) {
      assert(typeof options.memory === "boolean");
      this.memory = options.memory;
    }

    if (options.maxFiles != null) {
      assert(options.maxFiles >>> 0 === options.maxFiles);
      this.maxFiles = options.maxFiles;
    }

    if (options.cacheSize != null) {
      assert(Number.isSafeInteger(options.cacheSize) && options.cacheSize >= 0);
      this.cacheSize = options.cacheSize;
    }

    if (options.compression != null) {
      assert(typeof options.compression === "boolean");
      this.compression = options.compression;
    }

    return this;
  }

  /**
   * Instantiate chain options from object.
   * @param {Object} options
   * @returns {NomenclateDBOptions}
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

module.exports = NomenclateDB;
