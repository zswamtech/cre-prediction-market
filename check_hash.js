const { keccak256, toBytes } = require('viem');

const sig = "SettlementRequested(uint256,string)";
const hash = keccak256(toBytes(sig));
console.log(`Signature: ${sig}`);
console.log(`Hash: ${hash}`);

const expectedHash = "0x6bfe994aa671108bc4fcb31c2a97ab16ddb967720121010032b2e834bf5eacf6";
console.log(`Expected:  ${expectedHash}`);
console.log(`Match?     ${hash === expectedHash}`);
