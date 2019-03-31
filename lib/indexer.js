/*!
 * indexer.js - Indexer for Nomenclate
 * Copyright (c) 2018-2019, Handshake Alliance Developers (MIT License).
 * https://github.com/handshakealliance/nomenclate
 */

"use strict";

const EventEmitter = require("events");
const { Network } = require("hsd");
const Logger = require("blgr");
const assert = require("bsert");
const { Lock } = require("bmutex");
const layout = require("./layout.js");
const util = require("./util.js");

/**
 * Indexer
 * @alias module:nomenclate.indexer
 * @extends EventEmitter
 */

class Indexer extends EventEmitter {
  /**
   * Create an indexer.
   * @constructor
   * @param {Object} options
   */

  constructor(options) {
    super();

    this.options = new IndexerOptions(options);

    this.network = this.options.network;
    this.logger = this.options.logger.context("nomenclate");
    this.client = this.options.client;
    //TODO see if necessary
    // this.client = this.options.client || new NullClient(this);
    this.ndb = this.options.ndb;
    this.height = 0;
    this.lock = new Lock();

    this.init();
  }

  /**
   * Initialize the indexer.
   * @private
   */

  init() {
    this._bind();
  }

  /**
   * Bind to node events.
   * @private
   */

  _bind() {
    this.client.on("error", e => {
      this.emit("error", e);
    });

    this.client.on("connect", async () => {
      try {
        await this.syncNode();
      } catch (e) {
        this.emit("error", e);
      }
    });

    this.client.bind("block connect", async (entry, block, view) => {
      try {
        await this.indexBlock(entry, block, view);
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
   * Open the indexer.
   * @returns {Promise}
   */
  async open() {
    await this.ndb.verifyNetwork();

    //Get tip of chain when starting
    let tip = await this.client.getTip();

    //Height of internal database.
    this.height = await this.ndb.getHeight();

    this.logger.info(
      "Nomenclate initialized at height: %d, and chain tip: %d",
      this.height,
      tip.height
    );

    //Connect to the daemon.
    await this.connect();
  }

  /**
   * Placeholder
   * @returns {Promise}
   */
  async close() {
    await this.disconnect();
    return;
  }

  /**
   * Connect to the node server (client required).
   * @returns {Promise}
   */

  async connect() {
    return this.client.open();
  }

  /**
   * Disconnect from chain server (client required).
   * @returns {Promise}
   */

  async disconnect() {
    return this.client.close();
  }

  /**
   * Sync state with server on every connect.
   * @returns {Promise}
   */

  async syncNode() {
    const unlock = await this.lock.lock();
    let start = process.hrtime();
    try {
      this.logger.info("Resyncing from server...");
      await this.syncChain();
    } finally {
      // Add time here
      let end = process.hrtime(start);
      this.logger.info("Nomenclate fully synced in %d seconds", end[0]);
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

    await this.rollback(height);

    this.logger.info(
      "Nomenclate is scanning %d blocks.",
      tip.height - height + 1
    );

    for (let i = height; i <= tip.height; i++) {
      const entry = await this.client.getEntry(i);
      assert(entry);

      const block = await this.client.getBlock(entry.hash);
      assert(block);

      const view = await this.client.getBlockView(block);
      assert(view);

      await this._indexBlock(entry, block, view);
    }
  }

  /**
   * Sync with chain height.
   * @param {Number} height
   * @returns {Promise}
   */
  //TODO Untested.
  async rollback(height) {
    const tip = this.client.getTip();

    if (height > tip.height)
      throw new Error("Nomenclate: Cannot rollback to the future.");

    if (height === tip.height) {
      this.logger.info("Rolled back to same height (%d).", height);
      return;
    }

    this.logger.info(
      "Rolling back %d NomenclateDB blocks to height %d.",
      this.height - height,
      height
    );

    const entry = await this.client.getEntry(height);

    assert(entry);

    //TODO
    // await this.revert(entry.height);
    await this.setHeight(entry.height);
  }

  // /**
  // * Revert a block.
  // * @param {Number} height
  // * @returns {Promise}
  // */

  //TODO implement this function
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
   * Set internal indexer height.
   * @param {Number} height
   * @returns {Promise}
   */
  async setHeight(height) {
    this.height = height;

    //Insert into DB.
    await this.ndb.setHeight(height);

    return;
  }

  /**
   * Index a block with a lock
   * @param (ChainEntry) entry
   * @param (Block) block
   * @param (CoinView) view
   * @returns {Promise}
   */

  async indexBlock(entry, block, view) {
    const unlock = await this.lock.lock();
    try {
      this.logger.info("Adding block: %d.", entry.height);
      return await this._indexBlock(entry, block, view);
    } finally {
      unlock();
    }
  }

  /**
   * Index a block
   * @param (ChainEntry) entry
   * @param (Block) block
   * @param (CoinView) view
   * @returns {Promise}
   */

  async _indexBlock(entry, block, view) {
    if (entry.height < this.height) {
      this.logger.warning(
        "Nomenclate is connecting low blocks (%d).",
        entry.height
      );
      return;
    }

    if (entry.height >= this.network.block.slowHeight)
      // this.logger.debug("Adding block: %d.", entry.height);

    //TODO review this code from wallet.
    ////We may want to adjust this.
    ////Right now it's running on every height, but I'm wondering if we want height to be +1
    //if (block.height === this.height) {
    //  // We let blocks of the same height
    //  // through specifically for rescans:
    //  // we always want to rescan the last
    //  // block since the state may have
    //  // updated before the block was fully
    //  // processed (in the case of a crash).
    //  this.logger.warning("Already saw Nomenclate block (%d).", block.height);
    //} else if (block.height !== this.height + 1) {
    //  await this.scan(this.height);
    //  return 0;
    //}

    //TODO implement, and check if necessary
    // if (this.options.checkpoints && !this.state.marked) {
    //   if (block.height <= this.network.lastCheckpoint) return 0;
    // }
    //
    await this.ndb.addHeaders(entry.toHeaders(), entry.height);

    //if (this.standalone) {
    //  //if we are standalone we want to save the block headers
    //}

    await this.indexTX(entry, block, view);

    // Sync the new tip.
    await this.setHeight(entry.height);
  }

  /**
   * Index a transaction by txid.
   * @private
   * @param (ChainEntry) entry
   * @param (Block) block
   * @param (CoinView) view
   */
  async indexTX(entry, block, view) {
    const b = this.ndb.batch();

    for (let tx of block.txs) {
      let txid = Buffer.from(tx.txid(), "hex");

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

      //TODO see if parallizing the address indexing, and the name indexing will speed things up.
      for (let output of tx.outputs) {
        let address = Buffer.from(output.address.getHash(), "hex");

        if (output.covenant.isName()) {
          b.put(
            layout.n.encode(output.covenant.getHash(0), txid),
            util.fromU32(entry.height)
          );
        }

        b.put(layout.o.encode(address, txid), util.fromU32(entry.height));
      }

      b.put(layout.t.encode(txid), util.fromU32(entry.height));
    }

    await b.write();

    return;
  }
}

class IndexerOptions {
  /**
   * Create indexer options.
   * @constructor
   * @param {Object} options
   */

  constructor(options) {
    //TODO review these to see if they are all needed.
    this.network = Network.primary;
    this.logger = Logger.global;
    this.client = null;
    this.chain = null;
    this.prefix = null;
    this.location = null;
    this.memory = true;
    this.maxFiles = 64;
    this.cacheSize = 16 << 20;
    this.compression = true;

    if (options) this._fromOptions(options);
  }

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

    if (options.ndb != null) {
      assert(typeof options.ndb === "object");
      this.ndb = options.ndb;
    }

    assert(this.ndb);

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
   * @returns {IndexerOptions}
   */

  static fromOptions(options) {
    return new this()._fromOptions(options);
  }
}

module.exports = Indexer;
