import { keccak256, toBytes } from 'viem';

const signatures = [
    "MarketCreated(uint256,string,address)",
    "PredictionMade(uint256,address,uint8,uint256)",
    "SettlementRequested(uint256,string)",
    "MarketSettled(uint256,uint8,uint16)",
    "WinningsClaimed(uint256,address,uint256)"
];

const target = "0x6bfe994aa671108bc4fcb31c2a97ab16ddb967720121010032b2e834bf5eacf6";

signatures.forEach(sig => {
    const hash = keccak256(toBytes(sig));
    console.log(`${sig}\n -> ${hash}`);
    if (hash === target) {
        console.log("MATCH FOUND! ^^^^^^^^^^^^^");
    }
});
