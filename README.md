# smartcontract

Testing (Local)
===============

Run the test:
   
  `npx hardhat test`

You can also try the following commands:
  - `npm test`
  - `npm test:trace`
  - `npm test:fulltrace`
  - `npm test:integration`
  - `npm test:integration:trace`
  - `npm test:integration:fulltrace`

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

### Other commands available:

- `npm compile`
- `npm deploy`
- `npm coverage`
- `npm format`
- `npm solhint`
- `npm fork`
- `npm console`
- `npm console:rinkeby`
- `npm console:ropsten`
- `npm size-contracts`
- `npm size-contracts:no-compile`

