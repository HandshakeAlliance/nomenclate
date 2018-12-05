# Index Schema

The index is stored at a single LevelDB database using the following schema:

## Transaction Outputs' Index

Allows efficiently finding all funding transactions for a specific address:


| Code | Address Hash        | Funding TxID |   | Tx Block Height |
|------|---------------------|--------------|---|-----------------|
| o    | SHA256(addressHash) | Hash(txid)   |   | uint32          |

## Transaction Inputs' Index

Allows efficiently finding spending transaction of a specific output:


| Code | Funding TxID | Funding Output Index |   | Spending TxID |
|------|--------------|----------------------|---|---------------|
| i    | Hash(txid)   | uint32               |   | Hash(txid)    |

## NameHash Transaction IDs

Allows efficiently finding all transactions for a specific name:

| Code | Name Hash         | TxID       |   | Tx Block Height |
|------|-------------------|------------|---|-----------------|
| n    | Sha256(nameHash)  | Hash(txid) |   | uint32          |
