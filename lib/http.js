/*!
 * server.js - http server for nomenclate
 * Copyright (c) 2017-2018, Christopher Jeffrey (MIT License).
 * Copyright (c) 2018, Handshake Alliance Developers (MIT License).
 * https://github.com/handshakealliance/nomenclate
 */

"use strict";

const { Server } = require("bweb");
const Network = require("hsd").protocol.Network;
const Validator = require("bval");
const { base58 } = require("bstring");
const random = require("bcrypto/lib/random");
const sha256 = require("bcrypto/lib/sha256");
const assert = require("bsert");
const version = require("../package.json").version;
const protocol = require("../package.json").protocol;
const bio = require("bufio");
const util = require("./util.js");
const rules = require("hsd/lib/covenants/rules");
const Amount = require("hsd/lib/ui/amount");

const { Address, TX } = require("hsd");

/**
 * HTTP
 * @alias module:nomenclate.HTTP
 */

class HTTP extends Server {
  /**
   * Create an http server.
   * @constructor
   * @param {Object} options
   */

  constructor(options) {
    super(new HTTPOptions(options));

    this.network = this.options.network;
    this.logger = this.options.logger.context("http-nomenclate");
    this.ndb = this.options.ndb;
    this.client = this.options.client;
    this.host = this.options.host;
    this.port = this.options.port;
    this.ssl = this.options.ssl;
    this.node = this.options.node;
    // this.chain = this.node.chain;
    //
    this.fees = this.node.fees;
    this.mempool = this.node.mempool;

    this.init();
  }

  /**
   * Initialize http server.
   * @private
   */

  init() {
    this.on("request", (req, res) => {
      if (req.method === "POST" && req.pathname === "/") return;

      this.logger.debug(
        "Request for method=%s path=%s (%s).",
        req.method,
        req.pathname,
        req.socket.remoteAddress
      );
    });

    this.on("listening", address => {
      this.logger.info(
        "Nomenclate HTTP server listening on %s (port=%d).",
        address.address,
        address.port
      );
    });

    this.initRouter();
  }

  /**
   * Initialize routes.
   * @private
   */

  initRouter() {
    if (this.options.cors) this.use(this.cors());

    if (!this.options.noAuth) {
      this.use(
        this.basicAuth({
          hash: sha256.digest,
          password: this.options.apiKey,
          realm: "nomenclate"
        })
      );
    }

    this.use(
      this.bodyParser({
        type: "json"
      })
    );

    this.use(this.jsonRPC());
    this.use(this.router());

    this.error((err, req, res) => {
      const code = err.statusCode || 500;
      res.json(code, {
        error: {
          type: err.type,
          code: err.code,
          message: err.message
        }
      });
    });

    /*
     *
     * Blockchain HTTP Functions
     *
     */

    //Get Block Header
    this.get("/nomenclate/block/:height/header", async (req, res) => {
      const valid = Validator.fromRequest(req);

      const height = valid.u32("height");
      const cp_height = valid.u32("cp_height", 0);

      enforce(height, "Height is required");

      let header = await this.ndb.getHeaders(height);

      if (cp_height == 0) {
        res.json(200, { header: header.toString("hex") });
      }

      enforce(
        height <= cp_height,
        "Checkpoint can't be before requested block"
      );

      let bestheight = await this.ndb.getHeight();

      enforce(
        cp_height <= bestheight,
        "Checkpoint can't be greater than current chain height"
      );

      let hashes = [];

      for (let i = 0; i <= cp_height; i++) {
        let hash = await this.ndb.getHashByHeight(i);
        hashes.push(hash);
      }

      let [branches, root] = util.branchesAndRoot(hashes, height);

      res.json(200, {
        branch: branches,
        header: header.toString("hex"),
        root: root.toString("hex")
      });
    });

    this.get("/nomenclate/block/:height/headers", async (req, res) => {
      const valid = Validator.fromRequest(req);

      const startHeight = valid.u32("height");
      const count = valid.u32("count", 0);
      const cp_height = valid.u32("cp_height", 0);

      //TODO move this somewhere so it's not magic.
      const MAX = 2016;

      enforce(startHeight, "Starting Height is required");

      enforce(
        count <= MAX,
        "2016 is our current block max, please don't go above that"
      );

      let headers = [];

      //If count is 0, add 1 to the array, if it's not, then use count.
      let addOn = count == 0 ? 1 : count;

      for (let i = startHeight; i < startHeight + addOn; i++) {
        let header = await this.ndb.getHeaders(i);

        headers.push(header.toString("hex"));
      }

      if (cp_height == 0 || count == 0) {
        res.json(200, {
          count: headers.length,
          hex: headers.join(""),
          max: MAX
        });
        return;
      }

      enforce(
        startHeight + (count - 1) <= cp_height,
        "Checkpoint can't be before requested block"
      );

      let bestheight = await this.ndb.getHeight();

      enforce(
        cp_height <= bestheight,
        "Checkpoint can't be greater than current chain height"
      );

      let hashes = [];

      for (let i = 0; i <= cp_height; i++) {
        let hash = await this.ndb.getHashByHeight(i);
        hashes.push(hash);
      }

      let [branches, root] = util.branchesAndRoot(
        hashes,
        startHeight + (count - 1)
      );

      res.json(200, {
        count: headers.length,
        hex: headers.join(""),
        branch: branches,
        root: root.toString("hex"),
        max: MAX
      });
    });

    //TODO - basically what we are going to do here is this:
    //If standalone mode, call and internal function,
    //if not, then just call the daemon that already exists.
    this.get("/nomenclate/blockchain/estimatefee", async (req, res) => {
      const valid = Validator.fromRequest(req);
      //Number of blocks TODO have a default.
      const blocksCount = valid.u32("blocks_count", 0);

      const fee = this.fees.estimateFee(blocksCount);
      res.json(200, { fee: fee });
    });

    this.get("/nomenclate/blockchain/relayfee", async (req, res) => {
      //Support relaying any fee
      //TODO bring this out to constants along with the Max headers returned.
      res.json(200, { fee: 0 });
    });

    /*
     *
     * Address HTTP Functions
     *
     */
    this.get("/nomenclate/address/:hash/mempool", async (req, res) => {
      const valid = Validator.fromRequest(req);

      let hash = valid.str("hash");

      //Check if is valid, if not return error - enforce
      let addr = Address.fromString(hash, this.network);

      let txs = this.mempool.getTXByAddress(addr);

      let history = this.mempool.getHistory();

      console.log(history);

      console.log(txs);

      res.json(200, {});
    });

    this.get("/nomenclate/address/:hash/unspent", async (req, res) => {
      const valid = Validator.fromRequest(req);

      let hash = valid.str("hash");
      let limit = valid.u32("limit", 25);
      let offset = valid.u32("offset", 0);

      let end = offset + limit;

      //Check if is valid, if not return error - enforce
      let addr = Address.fromString(hash, this.network);

      let txs = await this.ndb.addressUnspent(addr);

      txs = util.sortTXs(txs);

      let total = txs.length;

      let result = txs.slice(offset, end);

      res.json(200, { total, offset, limit, result });
    });

    /*
     *
     * Transaction HTTP Functions
     *
     */
    this.post("/nomenclate/transaction/broadcast", async (req, res) => {
      const valid = Validator.fromRequest(req);
      const raw = valid.buf("tx");

      enforce(raw, "TX is required.");

      const tx = TX.decode(raw);

      //TODO see if there is a way to determine if it already exists. and then return an enforce
      await this.node.sendTX(tx);

      res.json(200, { hash: tx.txid() });
    });

    //TODO revamp this entirely.
    this.get("/nomenclate/transaction/:hash", async (req, res) => {
      const valid = Validator.fromRequest(req);
      const hash = valid.str("hash");
      const verbose = valid.bool("verbose", false);
      const merkle = valid.bool("merkle", false);

      const meta = await this.node.getMeta(Buffer.from(hash, "hex"));

      enforce(meta, "Transaction not found");

      const tx = meta.tx;
      let entry;
      let branches;
      let position;

      if (!verbose) {
        if (!merkle) {
          res.json(200, { hex: tx.toHex() });
          return;
        } else {
          let entry = await this.client.getEntry(meta.height);
          let block = await this.client.getBlock(meta.block);

          let i = 0;
          let txs = [];

          for (let t of block.txs) {
            txs.push(t.hash());
            if (t.hash().toString("hex") == hash) {
              position = i;
            }
            i++;
          }

          let root;
          [branches, root] = util.branchesAndRoot(txs, position);

          res.json(200, {
            merkle: branches,
            block_height: meta.height,
            pos: position,
            hex: tx.toHex()
          });
          return;
        }
      } else {
        if (!merkle) {
          const json = this.txToJSON(tx, entry);
          json.time = meta.mtime;
          json.hex = tx.toHex();
          res.json(200, json);
          return;
        } else {
          let entry = await this.client.getEntry(meta.height);
          let block = await this.client.getBlock(meta.block);

          let i = 0;
          let txs = [];

          for (let t of block.txs) {
            txs.push(t.hash());
            if (t.hash().toString("hex") == hash) {
              position = i;
            }
            i++;
          }

          let root;
          [branches, root] = util.branchesAndRoot(txs, position);

          let json = this.txToJSON(tx, entry);
          json.time = meta.mtime;
          json.hex = tx.toHex();
          json.merkle = branches;
          res.json(200, json);
          return;
        }
      }
    });

    this.get(
      "/nomenclate/transaction/:hash/merkle/:height",
      async (req, res) => {
        const valid = Validator.fromRequest(req);

        let hash = valid.str("hash");
        let height = valid.u32("height");

        let entry = await this.client.getEntry(height);

        let block = await this.client.getBlock(entry.hash);

        let i = 0;
        let position;
        let txs = [];

        for (let tx of block.txs) {
          txs.push(tx.hash());
          if (tx.hash().toString("hex") == hash) {
            position = i;
          }
          i++;
        }

        let [branches, _] = util.branchesAndRoot(txs, position);

        res.json(200, {
          merkle: branches,
          block_height: height,
          pos: position
        });
      }
    );

    this.get(
      "/nomenclate/transaction/:height/byPosition/:pos",
      async (req, res) => {
        const valid = Validator.fromRequest(req);

        let height = valid.u32("height");
        let pos = valid.u32("pos");
        let merkle = valid.bool("merkle", false);

        let entry = await this.client.getEntry(height);

        let block = await this.client.getBlock(entry.hash);

        enforce(
          pos <= block.txs.length,
          "No transition exists at position: " + pos
        );

        let tx = block.txs[pos];

        if (!merkle) {
          res.json(200, { tx_hash: tx.hash().toString("hex") });
          return;
        }

        let txs = [];

        for (let t of block.txs) {
          txs.push(t.hash());
        }

        let [branches, root] = util.branchesAndRoot(txs, pos);

        res.json(200, {
          tx_hash: tx.hash().toString("hex"),
          merkle: branches
        });
      }
    );

    /*
     *
     * Server HTTP Functions
     *
     */
    //Server -> Banner
    this.get("/nomenclate/banner", async (req, res) => {
      res.json(200, { banner: "Welcome to Nomenclate" });
    });

    //Server -> Features
    this.get("/nomenclate/features", async (req, res) => {
      let features = {};

      const genesis = await this.client.getEntry(0);

      features.genesis_hash = genesis.hash.toString("hex");
      features.hosts = { [this.host]: { port: this.port, ssl: this.ssl } };
      // Right now we are assuming these are in order in the package.json.
      // Possibly fix this later on. XXX
      features.protocol_max = protocol[protocol.length - 1];
      features.protocol_min = protocol[0];
      features.server_version = "Nomenclate " + version;

      //XXX Need to implement pruning.
      // features.pruning =

      res.json(200, features);
    });

    //Server -> Ping
    this.get("/nomenclate/ping", async (req, res) => {
      res.json(200, {});
    });

    //Server -> Version
    this.get("/nomenclate/version", async (req, res) => {
      res.json(200, ["Nomenclate " + version, protocol]);
    });

    // Address Tx History
    this.get("/nomenclate/address/:hash/history", async (req, res) => {
      const valid = Validator.fromRequest(req);

      let hash = valid.str("hash");
      let limit = valid.u32("limit", 10);
      let offset = valid.u32("offset", 0);

      let end = offset + limit;

      let txs;

      let addr = Address.fromString(hash, this.network);

      try {
        txs = await this.ndb.addressHistory(addr);
      } catch (e) {
        res.json(400);
        return;
      }

      //Return out of range if start is beyond array length.
      if (offset > txs.length) {
        res.json(416);
        return;
      }

      txs = util.sortTXs(txs);

      let total = txs.length;

      let result = txs.slice(offset, end);

      res.json(200, { total, offset, limit, result });

      return;
    });

    // Name History
    this.get("/nomenclate/name/:name/history", async (req, res) => {
      const valid = Validator.fromRequest(req);

      let name = valid.str("name");
      let limit = valid.u32("limit", 10);
      let offset = valid.u32("offset", 0);
      let full = valid.bool("full", false);

      let end = offset + limit;

      let txs;

      let nameHash = rules.hashName(name);

      //Do namechecks here, and return accordingly

      try {
        txs = await this.ndb.nameHistory(nameHash);
      } catch (e) {
        res.json(400);
        return;
      }

      //Return out of range if start is beyond array length.
      if (offset > txs.length) {
        res.json(416);
        return;
      }

      txs = util.sortTXs(txs);

      let total = txs.length;

      let result = txs.slice(offset, end);

      res.json(200, { total, offset, limit, result });

      return;
    });

    //Address Balance
    this.get("/nomenclate/address/:hash/balance", async (req, res) => {
      const valid = Validator.fromRequest(req);

      let hash = valid.str("hash");

      let addr = Address.fromString(hash, this.network);

      let balance;

      try {
        balance = await this.ndb.addressBalance(addr);
      } catch (e) {
        res.json(400);
        return;
      }

      res.json(200, balance);

      return;
    });
  }

  //TODO move these to util or somewhere else.
  txToJSON(tx, entry) {
    let height = -1;
    let time = 0;
    let hash = null;
    let conf = 0;

    if (entry) {
      height = entry.height;
      time = entry.time;
      hash = entry.hash;
      conf = this.client.getTip().height - height + 1;
    }

    const vin = [];

    for (const input of tx.inputs) {
      const json = {
        coinbase: undefined,
        txid: undefined,
        vout: undefined,
        txinwitness: undefined,
        sequence: input.sequence,
        link: input.link
      };

      json.coinbase = tx.isCoinbase();
      json.txid = input.prevout.txid();
      json.vout = input.prevout.index;
      json.txinwitness = input.witness.toJSON();

      vin.push(json);
    }

    const vout = [];

    for (let i = 0; i < tx.outputs.length; i++) {
      const output = tx.outputs[i];
      vout.push({
        value: Amount.coin(output.value, true),
        n: i,
        address: this.addrToJSON(output.address),
        covenant: output.covenant.toJSON()
      });
    }

    return {
      txid: tx.txid(),
      hash: tx.wtxid(),
      size: tx.getSize(),
      vsize: tx.getVirtualSize(),
      version: tx.version,
      locktime: tx.locktime,
      vin: vin,
      vout: vout,
      blockhash: hash ? hash.toString("hex") : null,
      confirmations: conf,
      time: time,
      blocktime: time,
      hex: undefined
    };
  }

  //TODO move these to util or somewhere else.
  addrToJSON(addr) {
    return {
      version: addr.version,
      hash: addr.hash.toString("hex")
    };
  }
}

class HTTPOptions {
  /**
   * HTTPOptions
   * @alias module:http.HTTPOptions
   * @constructor
   * @param {Object} options
   */

  constructor(options) {
    this.network = Network.primary;
    this.logger = null;
    this.node = null;
    this.apiKey = base58.encode(random.randomBytes(20));
    this.apiHash = sha256.digest(Buffer.from(this.apiKey, "ascii"));
    this.adminToken = random.randomBytes(32);
    this.serviceHash = this.apiHash;
    this.noAuth = false;
    this.cors = false;
    this.walletAuth = false;

    this.prefix = null;
    this.host = "127.0.0.1";
    this.port = 8080;
    this.ssl = false;
    this.keyFile = null;
    this.certFile = null;

    this.fromOptions(options);
  }

  /**
   * Inject properties from object.
   * @private
   * @param {Object} options
   * @returns {HTTPOptions}
   */

  fromOptions(options) {
    assert(options);
    assert(
      options.node && typeof options.node === "object",
      "HTTP Server requires a NomenclateDB."
    );

    this.node = options.node;

    if (options.network != null) this.network = Network.get(options.network);

    if (options.logger != null) {
      assert(typeof options.logger === "object");
      this.logger = options.logger;
    }

    if (options.ndb != null) {
      assert(typeof options.ndb === "object");
      this.ndb = options.ndb;
    }

    if (options.client != null) {
      assert(typeof options.client === "object");
      this.client = options.client;
    }

    if (options.logger != null) {
      assert(typeof options.logger === "object");
      this.logger = options.logger;
    }

    if (options.apiKey != null) {
      assert(typeof options.apiKey === "string", "API key must be a string.");
      assert(options.apiKey.length <= 255, "API key must be under 255 bytes.");
      this.apiKey = options.apiKey;
      this.apiHash = sha256.digest(Buffer.from(this.apiKey, "ascii"));
    }

    if (options.noAuth != null) {
      assert(typeof options.noAuth === "boolean");
      this.noAuth = options.noAuth;
    }

    if (options.cors != null) {
      assert(typeof options.cors === "boolean");
      this.cors = options.cors;
    }

    if (options.prefix != null) {
      assert(typeof options.prefix === "string");
      this.prefix = options.prefix;
      this.keyFile = path.join(this.prefix, "key.pem");
      this.certFile = path.join(this.prefix, "cert.pem");
    }

    if (options.host != null) {
      assert(typeof options.host === "string");
      this.host = options.host;
    }

    if (options.port != null) {
      assert(
        (options.port & 0xffff) === options.port,
        "Port must be a number."
      );
      this.port = options.port;
    }

    if (options.ssl != null) {
      assert(typeof options.ssl === "boolean");
      this.ssl = options.ssl;
    }

    if (options.keyFile != null) {
      assert(typeof options.keyFile === "string");
      this.keyFile = options.keyFile;
    }

    if (options.certFile != null) {
      assert(typeof options.certFile === "string");
      this.certFile = options.certFile;
    }

    // Allow no-auth implicitly
    // if we're listening locally.
    if (!options.apiKey) {
      if (this.host === "127.0.0.1" || this.host === "::1") this.noAuth = true;
    }

    return this;
  }

  /**
   * Instantiate http options from object.
   * @param {Object} options
   * @returns {HTTPOptions}
   */

  static fromOptions(options) {
    return new HTTPOptions().fromOptions(options);
  }
}

/*
 * Helpers
 */

function enforce(value, msg) {
  if (!value) {
    const err = new Error(msg);
    err.statusCode = 400;
    throw err;
  }
}

/*
 * Expose
 */

module.exports = HTTP;
