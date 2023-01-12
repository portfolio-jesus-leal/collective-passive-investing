# smartcontract

Testing (Local)
===============

Run the test:
   
  `npx hardhat test`

Also can be used the command below to see the test coverage report:

  `npx hardhat coverage`
   
Note that:

- *hardhat.config.js* needs to include the parameter:
```
 ...
 module.exports = {
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      // If you want to do some forking set `enabled` to true
       forking: {
         url: MAINNET_RPC_URL,
         enabled: true,
       },
      chainId: 31337,
    },
    ...
```
- It is necessary to include the variable **ALCHEMY_MAINNET_RPC_URL** or **MAINNET_RPC_URL** in a *.env* file.

