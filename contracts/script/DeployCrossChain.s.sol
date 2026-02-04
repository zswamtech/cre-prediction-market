// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PredictionMarket} from "../src/PredictionMarket.sol";
import {PredictionMarketSender} from "../src/PredictionMarketSender.sol";

contract DeployCrossChain is Script {
    // CCIP Routers
    address constant ROUTER_SEPOLIA = 0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59;
    address constant ROUTER_ARB_SEPOLIA = 0x2a9C5afB0d0e4BAb2BCdaE109EC4b0c4Be15a165;
    address constant ROUTER_BASE_SEPOLIA = 0xD3b06cEbF099CE7DA4AcCf578aaebFDBd6e88a93;

    // Chain Selectors
    uint64 constant SELECTOR_SEPOLIA = 16015286601757825753;
    uint64 constant SELECTOR_ARB_SEPOLIA = 3478487238524512106;
    uint64 constant SELECTOR_BASE_SEPOLIA = 10344971235874465080;

    // WETH Addresses
    address constant WETH_SEPOLIA = 0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14;
    address constant WETH_ARB_SEPOLIA = 0x980B62Da83eFf3D4576C647993b0c1D7faf17c73;
    address constant WETH_BASE_SEPOLIA = 0x4200000000000000000000000000000000000006;

    // Chainlink Forwarder (Sepolia)
    address constant FORWARDER_SEPOLIA = 0x15fc6ae953e024d975e77382eeec56a9101f9f88;

    function run() public {
        uint256 chainId = block.chainid;
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        
        vm.startBroadcast(deployerPrivateKey);

        if (chainId == 11155111) {
            // Deploy on Sepolia (Receiver)
            console.log("Deploying PredictionMarket on Sepolia...");
            PredictionMarket market = new PredictionMarket(
                FORWARDER_SEPOLIA,
                ROUTER_SEPOLIA,
                WETH_SEPOLIA
            );
            console.log("PredictionMarket deployed at:", address(market));
        } 
        else if (chainId == 421614) {
            // Deploy on Arbitrum Sepolia (Sender)
            address destinationMarket = vm.envAddress("SEPOLIA_MARKET_ADDRESS");
            require(destinationMarket != address(0), "Must set SEPOLIA_MARKET_ADDRESS");

            console.log("Deploying PredictionMarketSender on Arbitrum Sepolia...");
            PredictionMarketSender sender = new PredictionMarketSender(
                ROUTER_ARB_SEPOLIA,
                destinationMarket,
                SELECTOR_SEPOLIA,
                WETH_ARB_SEPOLIA
            );
            console.log("Sender (Arbitrum) deployed at:", address(sender));
        } 
        else if (chainId == 84532) {
            // Deploy on Base Sepolia (Sender)
            address destinationMarket = vm.envAddress("SEPOLIA_MARKET_ADDRESS");
            require(destinationMarket != address(0), "Must set SEPOLIA_MARKET_ADDRESS");

            console.log("Deploying PredictionMarketSender on Base Sepolia...");
            PredictionMarketSender sender = new PredictionMarketSender(
                ROUTER_BASE_SEPOLIA,
                destinationMarket,
                SELECTOR_SEPOLIA,
                WETH_BASE_SEPOLIA
            );
            console.log("Sender (Base) deployed at:", address(sender));
        } 
        else {
            console.log("Unsupported chain:", chainId);
        }

        vm.stopBroadcast();
    }
}
