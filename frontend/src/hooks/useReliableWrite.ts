"use client";

import { useState, useCallback } from "react";
import {
  encodeFunctionData,
  type Abi,
  type EncodeFunctionDataParameters,
} from "viem";
import { useSendTransaction, usePublicClient, useWaitForTransactionReceipt } from "wagmi";

/**
 * useReliableWrite - Bypasses MetaMask's RPC for gas estimation.
 *
 * Problem: wagmi's writeContract sends the tx through the wallet connector,
 * which uses MetaMask's own RPC (often Infura with rate limiting) for gas
 * estimation. If that RPC fails, you get "HTTP client error" even though
 * the contract is fine.
 *
 * Solution: We estimate gas using our own reliable RPC (configured in wagmi
 * transports), then send a raw transaction with pre-estimated gas via
 * useSendTransaction, which skips the wallet's gas estimation step.
 */
export function useReliableWrite() {
  const publicClient = usePublicClient();
  const { sendTransaction, isPending: isSending, data: hash, error: sendError } = useSendTransaction();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  const [estimateError, setEstimateError] = useState<string | null>(null);

  const writeContract = useCallback(
    async ({
      address,
      abi,
      functionName,
      args,
      value,
    }: {
      address: `0x${string}`;
      abi: Abi | readonly unknown[];
      functionName: string;
      args?: readonly unknown[];
      value?: bigint;
    }) => {
      setEstimateError(null);

      try {
        // Encode the function call data
        const data = encodeFunctionData({
          abi: abi as Abi,
          functionName,
          args,
        } as EncodeFunctionDataParameters);

        // Estimate gas using our reliable RPCs (not MetaMask's)
        let gas: bigint;
        try {
          gas = await publicClient!.estimateGas({
            to: address,
            data,
            value,
          });
          // Add 20% buffer for safety
          gas = (gas * 120n) / 100n;
        } catch (e) {
          // If estimation fails, let the wallet handle it
          gas = 300_000n;
        }

        // Send the transaction with pre-calculated gas
        sendTransaction({
          to: address,
          data,
          value,
          gas,
        });
      } catch (e) {
        setEstimateError(
          e instanceof Error ? e.message : "Error preparando la transaccion"
        );
      }
    },
    [publicClient, sendTransaction]
  );

  return {
    writeContract,
    hash,
    isPending: isSending,
    isConfirming,
    isSuccess,
    error: sendError || (estimateError ? new Error(estimateError) : null),
  };
}
