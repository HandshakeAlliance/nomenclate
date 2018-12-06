"use strict";

const { FullNode } = require("hsd");
const fs = require("fs");
var path = require("path");

const node = new FullNode({
  network: "testnet",
  apiKey: "api-key",
  prefix: ".hsd/benchmark",
  port: 48444,
  workers: true,
  persistent: true,
  memory: false,
  listen: true,
  indexTx: true,
  indexAddress: true,
  plugins: [require("../lib/index.js")]
});

let directory = ".hsd/benchmark/testnet/nomenclate";

(async () => {
  console.log("Starting node");
  await startNode(node);
  console.log("Node started");
})().catch(err => {
  console.error(err.stack);
  process.exit(1);
});

async function startNode(node) {
  try {
    await node.ensure();
    await node.open();
    await node.connect();

    node.startSync();
  } catch (e) {
    console.log(e);
  }

  waitForChainSynced(node);
}

async function waitForChainSynced(node) {
  if (node.chain.synced) {
    checkNomenclateDBSize(node);
    return;
  }

  console.log("Chain not syned yet... Waiting 5 seconds");
  // console.log(node.chain);

  setTimeout(() => {
    waitForChainSynced(node);
  }, 5000);
}

function checkNomenclateDBSize(node) {
  let total = 0;
  fs.readdirSync(directory).forEach(file => {
    if (path.extname(file) === ".ldb") {
      console.log(file);
      total += getFilesizeInMB(file);
    }
  });

  console.log("Level DB Size: %d MB", total);
}

function getFilesizeInMB(filename) {
  const stats = fs.statSync(directory + "/" + filename);
  const fileSizeInBytes = stats.size;
  return fileSizeInBytes / 1000000.0;
}
