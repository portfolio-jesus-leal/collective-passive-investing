// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");
const fs = require("fs");

const PRICE_FEED_ADDRESS = "0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419"
const MINTER_ROLE = "0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6";

async function main() {
  // Deploy contract PriceConsumerV3
  const PriceConsumerV3 = await hre.ethers.getContractFactory("PriceConsumerV3");
  const priceConsumer = await PriceConsumerV3.deploy(PRICE_FEED_ADDRESS);

  await priceConsumer.deployed();
  console.log("PriceConsumerV3 deployed to:", priceConsumer.address);

  // Deploy contract ContainerFactory
  const ContainerFactory = await hre.ethers.getContractFactory("ContainerFactory");
  const containerFactory = await ContainerFactory.deploy(priceConsumer.address);
  
  await containerFactory.deployed();
  console.log("ContainerFactory deployed to:", containerFactory.address);

  // // Deploy contract TokenERC20
  // const TokenERC20 = await hre.ethers.getContractFactory("TokenERC20");
  // const token = await TokenERC20.deploy("My-Token", "MYT");
  
  // await token.deployed();
  // console.log("TokenERC20 deployed to:", token.address, '');
  
  // // Deploy contract Container
  // const Container = await hre.ethers.getContractFactory("Container");
  // const container = await Container.deploy(priceConsumer.address, token.address);

  // await container.deployed();
  // console.log("Container deployed to:", container.address);

  // Assign role MINTER_ROLE to the Container contract
  // await token.grantRole(container.address, MINTER_ROLE);

  /* this code writes the contract addresses to a local */
	/* file named config.js that we can use in the app */
	fs.writeFileSync('./test-config.js', `
    const priceConsumerAddress = "${priceConsumer.address}"
    const containerFactoryAddress = "${containerFactory.address}"
    module.exports = {
      priceConsumerAddress,
      containerFactoryAddress,
    }
  `)
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
