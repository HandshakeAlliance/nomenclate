<img src="https://user-images.githubusercontent.com/9666345/49334234-9f38cf00-f596-11e8-9808-f16f75dd1bf7.png" width="700" >

Nomenclate is an indexing server for Handshake. Currently it allows querying of address balances, histories, and auction histories. It acts as the backend for our Handshake block explorer: [HNScan](https://hnscan.com)


## Installation

Nomenclate can currently be installed as an HSD plugin.

Install Nomenclate by running:

    npm install nomenclate


## Usage

In order to enable Nomenclate with your Handshake Daemon, add the flag:

    --plugins=nomenclate

to your HSD startup script. Ensure that nomenclate is installed in the repository from which
you are running your daemon.

## Bindings

Below is a list of bindings that make interacting with Nomenclate much easier.

- Javascript - [Nomenclate-js](https://github.com/HandshakeAlliance/nomenclate-js)
- Rust - [Nomenclate-rs](https://github.com/HandshakeAlliance/nomenclate-rs)


## License

This project is licensed under [MIT License](/LICENSE).





