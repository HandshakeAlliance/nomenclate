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

const {Address} = require("hsd");

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
    // this.chain = this.node.chain;

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
        res.text(200, header.toString("hex"));
      }

      enforce(
        height <= cp_height,
        "Checkpoint can't be before requested block"
      );

      //TODO I think we might actually want to make this the client.
      //Our height check shouldn't be to the chain, but rather to our internal DB.
      // enforce(
      //   cp_height <= this.chain.height,
      //   "Checkpoint can't be greater than current chain height"
      // );

      //index = height
      //length = cp_height + 1
      //
      //start = index
      //end = length

      let headers = [];

      //TODO review this code. not sure if i'm creating the merkle tree correctly.
      for (let i = height; i <= cp_height; i++) {
        let hash = await this.ndb.getHeaders(i);
        headers.push(hash);
      }

      let [branches, root] = util.branchesAndRoot(headers, height);

      console.log(branches);
      console.log(root);

      res.json(200, {
        branch: branches,
        header: header.toString("hex"),
        root: root.toString("hex")
      });
    });

    // this.get("/nomenclate/blockchain/estimatefee

    /*
     *
     * Server HTTP Functions
     *
     */
    //Server -> Banner
    this.get("/nomenclate/banner", async (req, res) => {
      res.text(200, "Welcome to Nomenclate");
    });

    //Server -> Features
    this.get("/nomenclate/features", async (req, res) => {
      let features = {};

      const genesis = await this.client.getEntry(0);

      features.genesisHash = genesis.hash.toString("hex");
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
      res.json(200, null);
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
    this.network = options.node.network;
    this.logger = options.node.logger;

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
