/*!
 * nullclient.js - chain client for nomenclate
 * Copyright (c) 2014-2017, Christopher Jeffrey (MIT License).
 * Copyright (c) 2018, Handshake Alliance Developers (MIT License).
 * https://github.com/handshakealliance/nomenclate
 */

"use strict";

const assert = require("bsert");
const EventEmitter = require("events");

/**
 * Null Client
 * Sort of a fake local client for separation of concerns.
 * @alias module:helectrum.NullClient
 */

class NullClient extends EventEmitter {
  /**
   * Create a client.
   * @constructor
   */

  constructor(chain) {
    super();

    this.chain = chain;
    this.network = chain.network;
    this.opened = false;
  }

  /**
   * Open the client.
   * @returns {Promise}
   */

  async open(options) {
    assert(!this.opened, "NullClient is already open.");
    this.opened = true;
    setImmediate(() => this.emit("connect"));
  }

  /**
   * Close the client.
   * @returns {Promise}
   */

  async close() {
    assert(this.opened, "NullClient is not open.");
    this.opened = false;
    setImmediate(() => this.emit("disconnect"));
  }

  /**
   * Add a listener.
   * @param {String} type
   * @param {Function} handler
   */

  bind(type, handler) {
    return this.on(type, handler);
  }

  /**
   * Add a listener.
   * @param {String} type
   * @param {Function} handler
   */

  hook(type, handler) {
    return this.on(type, handler);
  }

  /**
   * Get chain tip.
   * @returns {Promise}
   */

  async getTip() {
    const { hash, height, time } = this.network.genesis;
    return { hash, height, time };
  }

  /**
   * Get chain entry.
   * @param {Hash} hash
   * @returns {Promise}
   */

  async getEntry(hash) {
    return { hash, height: 0, time: 0 };
  }

  /**
   * Get block
   * @param {Hash} hash
   * @returns {Promise}
   */

  async getBlock(hash) {
    return null;
  }

  /**
   * Get a historical block coin viewpoint.
   * @param {Block} hash
   * @returns {Promise} - Returns {@link CoinView}.
   */

  async getBlockView(block) {
    return null;
  }
}

/*
 * Expose
 */

module.exports = NullClient;
