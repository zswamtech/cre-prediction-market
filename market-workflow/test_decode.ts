import { decodeEventLog, parseAbi, keccak256, toBytes } from 'viem';

const sig = "SettlementRequested(uint256,string)";
const hash = keccak256(toBytes(sig));
console.log(`Hash computed: ${hash}`);

const EVENT_ABI = parseAbi([
  "event SettlementRequested(uint256 indexed marketId, string question)",
]);

const topics = [
    hash,
    "0x0000000000000000000000000000000000000000000000000000000000000017" // random marketId 23
];
const data = "0x0000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000000568656c6c6f000000000000000000000000000000000000000000000000000000"; // string "hello"

try {
    const decoded = decodeEventLog({ abi: EVENT_ABI, data, topics });
    console.log("Decoded successfully!", decoded);
} catch (e) {
    console.error("Decoding failed:", e);
}
