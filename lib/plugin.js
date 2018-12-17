/*!
 * plugin.js - nomenclate plugin for hsd
 * Copyright (c) 2017-2018, Christopher Jeffrey (MIT License).
 * Copyright (c) 2018, Handshake Alliance Developers (MIT License).
 * https://github.com/handshakealliance/nomenclate
 */

"use strict";

const EventEmitter = require("events");
const ChainClient = require("./chainclient");
const NomenclateDB = require("./nomenclatedb.js");
const HTTP = require("./http");
const { Network } = require("hsd");

/**
 * @exports nomenclate/plugin
 */

const plugin = exports;

/**
 * Plugin
 * @extends EventEmitter
 */

class Plugin extends EventEmitter {
  constructor(node) {
    super();

    this.config = node.config.filter("nomenclate");
    this.config.open("nomenclate.conf");

    this.network = this.config.network;
    this.logger = node.logger;

    this.client = new ChainClient(node.chain);

    console.log("connecting to: %s", node.network);

    //Init DB here
    this.ndb = new NomenclateDB({
      network: this.network,
      logger: this.logger,
      client: this.client,
      node: node,
      memory: this.config.bool("memory", node.memory),
      prefix: this.config.prefix,
      maxFiles: this.config.uint("max-files"),
      cacheSize: this.config.mb("cache-size")
    });

    //Init http here
    this.http = new HTTP({
      network: this.network,
      logger: this.logger,
      ndb: this.ndb,
      client: this.client,
      node: this,
      ssl: this.config.bool("ssl"),
      keyFile: this.config.path("ssl-key"),
      certFile: this.config.path("ssl-cert"),
      host: this.config.str("http-host"),
      port: this.config.uint("http-port"),
      apiKey: this.config.str("api-key", node.config.str("api-key")),
      walletAuth: this.config.bool("wallet-auth"),
      noAuth: this.config.bool("no-auth"),
      cors: this.config.bool("cors"),
      adminToken: this.config.str("admin-token")
    });

    this.init();
  }

  init() {
    this.ndb.on("error", err => this.emit("error", err));
    this.http.on("error", err => this.emit("error", err));
  }

  //Going to open the http server here and the database
  async open() {
    console.log("opening db");
    await this.ndb.open();

    console.log("opening server");
    await this.http.open();
  }

  //Close the db and the http server.
  async close() {}
}

/**
 * Plugin name.
 * @const {String}
 */

plugin.id = "nomenclate";

/**
 * Plugin initialization.
 * @param {Node} node
 * @returns {Nomenclate}
 */

plugin.init = function init(node) {
  return new Plugin(node);
};
