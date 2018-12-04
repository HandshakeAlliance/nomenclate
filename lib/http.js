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
const common = require("./common");

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
    this.logger = this.options.logger.context("http-electrum");
    this.ndb = this.options.ndb;

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
        "Electrum HTTP server listening on %s (port=%d).",
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
    // if (this.options.cors) this.use(this.cors());

    // if (!this.options.noAuth) {
    //   this.use(
    //     this.basicAuth({
    //       hash: sha256.digest,
    //       password: this.options.apiKey,
    //       realm: "nomenclate"
    //     })
    //   );
    // }
    //

    this.use(
      this.bodyParser({
        type: "json"
      })
    );

    this.use(async (req, res) => {
      if (!this.options.walletAuth) {
        req.admin = true;
        return;
      }

      const valid = Validator.fromRequest(req);
      const token = valid.buf("token");

      if (token && safeEqual(token, this.options.adminToken)) {
        req.admin = true;
        return;
      }

      if (req.method === "POST" && req.path.length === 0) {
        res.json(403);
        return;
      }
    });

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

    this.hook(async (req, res) => {
      if (req.path.length < 2) return;

      if (req.path[0] !== "nomenclate") return;

      if (req.method === "PUT" && req.path.length === 2) return;

      const valid = Validator.fromRequest(req);
      // const id = valid.str("id");
      // const token = valid.buf("token");

      // if (!id) {
      //   res.json(403);
      //   return;
      // }

      // if (req.admin || !this.options.walletAuth) {
      //   const wallet = await this.wdb.get(id);

      //   if (!wallet) {
      //     res.json(404);
      //     return;
      //   }

      //   req.wallet = wallet;

      //   return;
      // }

      // if (!token) {
      //   res.json(403);
      //   return;
      // }

      // let wallet;
      // try {
      //   wallet = await this.wdb.auth(id, token);
      // } catch (err) {
      //   this.logger.info("Auth failure for %s: %s.", id, err.message);
      //   res.json(403);
      //   return;
      // }

      // if (!wallet) {
      //   res.json(404);
      //   return;
      // }

      // req.wallet = wallet;

      // this.logger.info("Successful auth for %s.", id);
    });

    // Address Tx History
    this.get("/nomenclate/address/:hash/history", async (req, res) => {
      const valid = Validator.fromRequest(req);

      let hash = valid.str("hash");
      let page = valid.u32("page");
      let limit = valid.u32("limit");
      let full = valid.bool("full");

      // Defaults
      if (!page) {
        page = 1;
      }

      if (!limit) {
        limit = 10;
      }

      if (!full) {
        full = false;
      }

      let start = (page - 1) * limit;

      let end = start + limit;

      let txs;

      try {
        txs = await this.ndb.getAddressHashHistory(hash);
      } catch (e) {
        res.json(400);
        return;
      }

      //Return out of range if start is beyond array length.
      if (start > txs.length) {
        res.json(416);
        return;
      }

      txs = common.sortTXs(txs);

      let total = txs.length;

      let result = txs.slice(start, end);

      res.json(200, { total, page, limit, result });

      return;
    });

    // Name History
    this.get("/nomenclate/name/:name/history", async (req, res) => {
      const valid = Validator.fromRequest(req);

      let name = valid.str("name");
      let page = valid.u32("page");
      let limit = valid.u32("limit");
      let full = valid.bool("full");

      // Defaults
      if (!page) {
        page = 1;
      }

      if (!limit) {
        limit = 10;
      }

      if (!full) {
        full = false;
      }

      let start = (page - 1) * limit;

      let end = start + limit;

      let txs;

      try {
        txs = await this.ndb.nameHistory(name);
      } catch (e) {
        res.json(400);
        return;
      }

      //Return out of range if start is beyond array length.
      if (start > txs.length) {
        res.json(416);
        return;
      }

      txs = common.sortTXs(txs);

      let total = txs.length;

      let result = txs.slice(start, end);

      res.json(200, { total, page, limit, result });

      return;
    });

    //Address Balance
    this.get("/nomenclate/address/:hash/balance", async (req, res) => {
      const valid = Validator.fromRequest(req);

      let hash = valid.str("hash");

      let balance;

      try {
        balance = await this.ndb.addressBalance(hash);
      } catch (e) {
        res.json(400);
        return;
      }

      res.json(200, { balance });

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

    if (options.adminToken != null) {
      if (typeof options.adminToken === "string") {
        assert(
          options.adminToken.length === 64,
          "Admin token must be a 32 byte hex string."
        );
        const token = Buffer.from(options.adminToken, "hex");
        assert(
          token.length === 32,
          "Admin token must be a 32 byte hex string."
        );
        this.adminToken = token;
      } else {
        assert(
          Buffer.isBuffer(options.adminToken),
          "Admin token must be a hex string or buffer."
        );
        assert(
          options.adminToken.length === 32,
          "Admin token must be 32 bytes."
        );
        this.adminToken = options.adminToken;
      }
    }

    if (options.noAuth != null) {
      assert(typeof options.noAuth === "boolean");
      this.noAuth = options.noAuth;
    }

    if (options.cors != null) {
      assert(typeof options.cors === "boolean");
      this.cors = options.cors;
    }

    if (options.walletAuth != null) {
      assert(typeof options.walletAuth === "boolean");
      this.walletAuth = options.walletAuth;
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
